// Live Support Sessions — Google Calendar client. SERVER ONLY.
//
// Uses its own Internal OAuth client (GOOGLE_LSS_CLIENT_ID / _SECRET /
// _REDIRECT_URI), separate from the Gmail outreach client. Tokens live in
// lss_google_tokens, which only the service role can read.

import { adminClient } from '@/lib/supabase/admin'
import { LSS_PUBLIC_JOIN_URL } from '@/lib/live-support'

export const LSS_GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
]

/**
 * The only Google account allowed to connect. Google sends invite emails From
 * and Reply-To the connected account, so this must be a non-coach mailbox:
 * clients see this address on every invite.
 */
export const LSS_CALENDAR_OWNER = 'support@outsidethebachs.com'
export const LSS_OAUTH_STATE_COOKIE = 'lss_google_oauth_state'

export const LSS_LIVE_SUPPORT_URL = 'https://studio.outsidethebachs.com/live-support'

/** The import screen never lists or touches events before this instant (Dec 1, 2026 00:00 Central). */
export const LSS_IMPORT_FROM_ISO = '2026-12-01T06:00:00.000Z'

const CAL = 'https://www.googleapis.com/calendar/v3'

export interface LssOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export function lssOAuthConfig(): LssOAuthConfig | null {
  const clientId = process.env.GOOGLE_LSS_CLIENT_ID
  const clientSecret = process.env.GOOGLE_LSS_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_LSS_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) return null
  return { clientId, clientSecret, redirectUri }
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export class GoogleApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public reason: string | null,
  ) {
    super(message)
  }

  /** Quota / rate-limit errors: the sync stops on the first one. */
  get isQuota(): boolean {
    if (this.status === 429) return true
    return ['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded', 'dailyLimitExceeded', 'usageLimits']
      .includes(this.reason ?? '')
  }
}

async function parseGoogleError(res: Response): Promise<GoogleApiError> {
  let reason: string | null = null
  let message = `${res.status} ${res.statusText}`
  try {
    const body = await res.json() as {
      error?: { message?: string; errors?: { reason?: string }[]; status?: string } | string
      error_description?: string
    }
    if (typeof body.error === 'string') {
      reason = body.error
      message = body.error_description ? `${body.error}: ${body.error_description}` : body.error
    } else if (body.error) {
      reason = body.error.errors?.[0]?.reason ?? body.error.status ?? null
      message = body.error.message ?? message
    }
  } catch {
    // non-JSON body
  }
  return new GoogleApiError(message, res.status, reason)
}

// ─── Tokens ──────────────────────────────────────────────────────────────────

interface TokenRow {
  account_email: string | null
  refresh_token: string | null
  access_token: string | null
  access_token_expires_at: string | null
}

export async function readTokenRow(): Promise<TokenRow | null> {
  const { data } = await adminClient
    .from('lss_google_tokens')
    .select('account_email, refresh_token, access_token, access_token_expires_at')
    .eq('id', true)
    .maybeSingle()
  return (data as TokenRow | null) ?? null
}

/**
 * Exchanges an authorization code and stores the tokens, but only when the
 * account is LSS_CALENDAR_OWNER; otherwise nothing is saved (an existing good
 * connection is kept) and WrongAccountError is thrown.
 */
export class WrongAccountError extends Error {
  constructor(public email: string | null) {
    super(`wrong_account:${email ?? 'unknown'}`)
  }
}

export async function exchangeCodeAndStore(code: string, connectedBy: string): Promise<string> {
  const cfg = lssOAuthConfig()
  if (!cfg) throw new Error('Google LSS OAuth is not configured')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw await parseGoogleError(res)
  const t = await res.json() as {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope?: string
    id_token?: string
  }

  const email = emailFromIdToken(t.id_token)
  if (email !== LSS_CALENDAR_OWNER) throw new WrongAccountError(email)
  const row: Record<string, unknown> = {
    id: true,
    account_email: email,
    access_token: t.access_token,
    access_token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    scope: t.scope ?? null,
    connected_at: new Date().toISOString(),
    connected_by: connectedBy,
  }
  // Google only returns a refresh token with prompt=consent; keep the old one otherwise.
  if (t.refresh_token) row.refresh_token = t.refresh_token

  const { error } = await adminClient.from('lss_google_tokens').upsert(row, { onConflict: 'id' })
  if (error) throw new Error(`Could not save Google tokens: ${error.message}`)
  return email
}

function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8')) as { email?: string }
    return payload.email?.toLowerCase() ?? null
  } catch {
    return null
  }
}

/** A valid access token, refreshing (and saving) it when it is within a minute of expiry. */
export async function getAccessToken(): Promise<string> {
  const row = await readTokenRow()
  if (!row?.refresh_token) throw new Error('Google Calendar is not connected')
  if (row.account_email?.toLowerCase() !== LSS_CALENDAR_OWNER) {
    // A token from an earlier allowed account (e.g. a coach) must never send invites.
    throw new Error(`Google Calendar is connected as ${row.account_email ?? 'an unknown account'}; reconnect as ${LSS_CALENDAR_OWNER}`)
  }

  const expiry = row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : 0
  if (row.access_token && expiry - Date.now() > 60_000) return row.access_token

  const cfg = lssOAuthConfig()
  if (!cfg) throw new Error('Google LSS OAuth is not configured')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: row.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw await parseGoogleError(res)
  const t = await res.json() as { access_token: string; expires_in: number }

  await adminClient
    .from('lss_google_tokens')
    .update({
      access_token: t.access_token,
      access_token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    })
    .eq('id', true)

  return t.access_token
}

async function calendarFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(`${CAL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) throw await parseGoogleError(res)
  if (res.status === 204) return undefined as T
  return await res.json() as T
}

// ─── Calendar types ──────────────────────────────────────────────────────────

export interface GAttendee {
  email: string
  responseStatus?: string
  organizer?: boolean
  self?: boolean
  resource?: boolean
  optional?: boolean
  displayName?: string
  comment?: string
  additionalGuests?: number
}

export interface GEventTime {
  dateTime?: string
  date?: string
  timeZone?: string
}

export interface GEvent {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  start: GEventTime
  end: GEventTime
  attendees?: GAttendee[]
  organizer?: { email?: string; self?: boolean }
  guestsCanSeeOtherGuests?: boolean
  guestsCanInviteOthers?: boolean
  guestsCanModify?: boolean
  htmlLink?: string
  recurringEventId?: string
}

export type SendUpdates = 'all' | 'externalOnly' | 'none'

// ─── Event format ────────────────────────────────────────────────────────────

/** "Alyssa", "Alyssa & Isak", "Alyssa, Chaz & Isak". */
export function joinFirstNames(names: string[]): string {
  const n = names.map(s => s.trim()).filter(Boolean)
  if (n.length <= 1) return n[0] ?? ''
  return `${n.slice(0, -1).join(', ')} & ${n[n.length - 1]}`
}

export function lssEventSummary(hostFirstNames: string[]): string {
  const names = joinFirstNames(hostFirstNames)
  return names ? `OTB Live Support Session with ${names}` : 'OTB Live Support Session'
}

export const LSS_EVENT_DESCRIPTION =
  `Join here: ${LSS_PUBLIC_JOIN_URL}\n\nSee upcoming sessions and past recordings: ${LSS_LIVE_SUPPORT_URL}`

/**
 * The fields every LSS event carries. Start/end are deliberately absent: on
 * import and edit the event keeps its own start, end and time zone.
 * No conferenceData, so Google adds no Meet link.
 */
export function lssEventFormat(hostFirstNames: string[]) {
  return {
    summary: lssEventSummary(hostFirstNames),
    description: LSS_EVENT_DESCRIPTION,
    location: LSS_PUBLIC_JOIN_URL,
    guestsCanSeeOtherGuests: false,
    guestsCanInviteOthers: false,
    guestsCanModify: false,
  }
}

export function containsZoomLink(e: Pick<GEvent, 'description' | 'location' | 'summary'>): boolean {
  return /zoom\.us/i.test(`${e.summary ?? ''} ${e.description ?? ''} ${e.location ?? ''}`)
}

// ─── Calendar calls ──────────────────────────────────────────────────────────

const enc = encodeURIComponent

/**
 * Connection check. Uses events.list (covered by the calendar.events scope)
 * because its response carries the calendar's title; calendars.get would need
 * a broader scope.
 */
export async function getCalendarTitle(calendarId: string): Promise<string> {
  const r = await calendarFetch<{ summary?: string }>(`/calendars/${enc(calendarId)}/events?maxResults=1`)
  return r.summary ?? calendarId
}

/** Single (expanded) events from `timeMinIso` onward, soonest first. */
export async function listEventsFrom(calendarId: string, timeMinIso: string, timeMaxIso?: string): Promise<GEvent[]> {
  const out: GEvent[] = []
  let pageToken: string | undefined
  do {
    const q = new URLSearchParams({
      timeMin: timeMinIso,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
      ...(timeMaxIso ? { timeMax: timeMaxIso } : {}),
      ...(pageToken ? { pageToken } : {}),
    })
    const r = await calendarFetch<{ items?: GEvent[]; nextPageToken?: string }>(
      `/calendars/${enc(calendarId)}/events?${q}`,
    )
    out.push(...(r.items ?? []).filter(e => e.status !== 'cancelled'))
    pageToken = r.nextPageToken
  } while (pageToken)
  return out
}

export function getEvent(calendarId: string, eventId: string): Promise<GEvent> {
  return calendarFetch<GEvent>(`/calendars/${enc(calendarId)}/events/${enc(eventId)}`)
}

export function patchEvent(
  calendarId: string,
  eventId: string,
  body: Partial<GEvent>,
  sendUpdates: SendUpdates,
): Promise<GEvent> {
  return calendarFetch<GEvent>(
    `/calendars/${enc(calendarId)}/events/${enc(eventId)}?sendUpdates=${sendUpdates}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  )
}

export function insertEvent(calendarId: string, body: Partial<GEvent>, sendUpdates: SendUpdates): Promise<GEvent> {
  return calendarFetch<GEvent>(
    `/calendars/${enc(calendarId)}/events?sendUpdates=${sendUpdates}`,
    { method: 'POST', body: JSON.stringify(body) },
  )
}

export function deleteEvent(calendarId: string, eventId: string, sendUpdates: SendUpdates): Promise<void> {
  return calendarFetch<void>(
    `/calendars/${enc(calendarId)}/events/${enc(eventId)}?sendUpdates=${sendUpdates}`,
    { method: 'DELETE' },
  )
}

/** Start instant of an event, as an ISO string (all-day events → midnight UTC of that date). */
export function eventStartIso(e: GEvent): string | null {
  if (e.start.dateTime) return new Date(e.start.dateTime).toISOString()
  if (e.start.date) return new Date(`${e.start.date}T00:00:00Z`).toISOString()
  return null
}

export function eventDurationMinutes(e: GEvent): number {
  const s = e.start.dateTime ? new Date(e.start.dateTime).getTime() : NaN
  const en = e.end.dateTime ? new Date(e.end.dateTime).getTime() : NaN
  const m = Math.round((en - s) / 60_000)
  return Number.isFinite(m) && m > 0 ? m : 60
}
