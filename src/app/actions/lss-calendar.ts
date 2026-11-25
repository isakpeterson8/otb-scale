'use server'

// Live Support Sessions — Google Calendar admin actions. Staff only.
// Coach emails and attendee lists are returned only to staff callers.

import { revalidatePath } from 'next/cache'
import { getStaffContext } from '@/lib/staff'
import { adminClient } from '@/lib/supabase/admin'
import { fmtChicagoDate, fmtChicagoTime } from '@/lib/live-support'
import {
  LSS_IMPORT_FROM_ISO,
  containsZoomLink,
  eventDurationMinutes,
  eventStartIso,
  getCalendarTitle,
  getEvent,
  insertEvent,
  listEventsFrom,
  lssEventFormat,
  lssOAuthConfig,
  patchEvent,
  readTokenRow,
  type GEvent,
  type SendUpdates,
} from '@/lib/lss-google'
import {
  hostsBySession,
  listCoaches,
  readCalendarSettings,
  setSessionHosts,
  syncLssAttendees,
  upcomingLinkedSessions,
  type SessionSyncResult,
} from '@/lib/lss-sync'

type Result<T = null> = { error: string | null; data?: T }

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

function revalidateLss() {
  revalidatePath('/admin/lss')
  revalidatePath('/live-support')
  revalidatePath('/dashboard')
}

// ─── Connection ──────────────────────────────────────────────────────────────

export interface GoogleStatus {
  configured: boolean
  connected: boolean
  accountEmail: string | null
  calendarId: string | null
  calendarTitle: string | null
  testError: string | null
  sendUpdates: SendUpdates
}

export async function getGoogleStatus(): Promise<Result<GoogleStatus>> {
  if (!await getStaffContext()) return { error: 'Unauthorized' }
  const [token, settings] = await Promise.all([readTokenRow(), readCalendarSettings()])
  const status: GoogleStatus = {
    configured: !!lssOAuthConfig(),
    connected: !!token?.refresh_token,
    accountEmail: token?.account_email ?? null,
    calendarId: settings.calendarId,
    calendarTitle: null,
    testError: null,
    sendUpdates: settings.sendUpdates,
  }
  if (status.connected && status.configured && settings.calendarId) {
    try {
      status.calendarTitle = await getCalendarTitle(settings.calendarId)
    } catch (e) {
      status.testError = errMsg(e)
    }
  }
  return { error: null, data: status }
}

export async function saveGoogleCalendarId(calendarId: string): Promise<Result> {
  if (!await getStaffContext()) return { error: 'Unauthorized' }
  const v = calendarId.trim()
  if (!v) return { error: 'Enter the calendar ID.' }
  const { error } = await adminClient.from('lss_settings').update({ google_calendar_id: v }).eq('id', true)
  if (error) return { error: error.message }
  revalidatePath('/admin/lss')
  return { error: null }
}

export async function saveInviteSendUpdates(mode: SendUpdates): Promise<Result> {
  if (!await getStaffContext()) return { error: 'Unauthorized' }
  if (!['all', 'externalOnly', 'none'].includes(mode)) return { error: 'Invalid mode' }
  const { error } = await adminClient.from('lss_settings').update({ invite_send_updates: mode }).eq('id', true)
  if (error) return { error: error.message }
  revalidatePath('/admin/lss')
  return { error: null }
}

// ─── Review & import existing events ─────────────────────────────────────────

export interface ReviewGuest {
  email: string
  coachId: string | null
  coachName: string | null
  responseStatus: string | null
}

export interface ReviewEvent {
  id: string
  startIso: string
  whenLabel: string
  durationMinutes: number
  timeZone: string | null
  title: string
  guests: ReviewGuest[]
  hasZoomLink: boolean
  matchedCoachIds: string[]
  unknownGuests: string[]
  proposed: { summary: string; description: string; location: string }
}

function toReview(e: GEvent, coachesByEmail: Map<string, { id: string; first_name: string }>): ReviewEvent | null {
  const startIso = eventStartIso(e)
  if (!startIso || startIso < LSS_IMPORT_FROM_ISO) return null
  const guests: ReviewGuest[] = (e.attendees ?? [])
    .filter(a => !a.resource)
    .map(a => {
      const c = coachesByEmail.get(a.email.toLowerCase())
      return { email: a.email, coachId: c?.id ?? null, coachName: c?.first_name ?? null, responseStatus: a.responseStatus ?? null }
    })
  const matched = guests.filter(g => g.coachId)
  const start = new Date(startIso)
  return {
    id: e.id,
    startIso,
    whenLabel: `${fmtChicagoDate(start)} · ${fmtChicagoTime(start)} Central`,
    durationMinutes: eventDurationMinutes(e),
    timeZone: e.start.timeZone ?? null,
    title: e.summary ?? '(no title)',
    guests,
    hasZoomLink: containsZoomLink(e),
    matchedCoachIds: matched.map(g => g.coachId!),
    unknownGuests: guests.filter(g => !g.coachId).map(g => g.email),
    proposed: { ...lssEventFormat(matched.map(g => g.coachName!)) },
  }
}

/** Events from Dec 1, 2026 onward that are not linked to a session and not ignored. */
export async function reviewCalendarEvents(): Promise<Result<ReviewEvent[]>> {
  if (!await getStaffContext()) return { error: 'Unauthorized' }
  try {
    const settings = await readCalendarSettings()
    if (!settings.calendarId) return { error: 'No calendar ID set.' }

    const [events, coaches, linked] = await Promise.all([
      listEventsFrom(settings.calendarId, LSS_IMPORT_FROM_ISO),
      listCoaches(),
      adminClient.from('lss_sessions').select('google_event_id').not('google_event_id', 'is', null),
    ])
    const linkedIds = new Set((linked.data ?? []).map(r => r.google_event_id as string))
    const ignored = new Set(settings.ignoredEventIds)
    const coachesByEmail = new Map(coaches.map(c => [c.email.toLowerCase(), c]))

    const out = events
      .filter(e => !linkedIds.has(e.id) && !ignored.has(e.id))
      .map(e => toReview(e, coachesByEmail))
      .filter((e): e is ReviewEvent => !!e)
    return { error: null, data: out }
  } catch (e) {
    return { error: errMsg(e) }
  }
}

/**
 * Imports one Google event: creates the lss_sessions row + hosts, links
 * google_event_id, then patches the event to the LSS format with
 * sendUpdates=none. Start/end/timeZone and attendees are not sent, so Google
 * keeps them exactly as they are. Rolls the session back if the patch fails.
 */
export async function importCalendarEvent(eventId: string, coachIds: string[]): Promise<Result<{ sessionId: string; summary: string }>> {
  if (!await getStaffContext()) return { error: 'Unauthorized' }
  const settings = await readCalendarSettings()
  if (!settings.calendarId) return { error: 'No calendar ID set.' }

  let event: GEvent
  try {
    event = await getEvent(settings.calendarId, eventId)
  } catch (e) {
    return { error: errMsg(e) }
  }
  const startIso = eventStartIso(event)
  if (!startIso || startIso < LSS_IMPORT_FROM_ISO) return { error: 'Events before Dec 1, 2026 are never imported.' }
  if (!event.start.dateTime) return { error: 'All-day events cannot be imported.' }

  const coaches = await listCoaches()
  const byId = new Map(coaches.map(c => [c.id, c]))
  const hostIds = coachIds.filter(id => byId.has(id))
  if (!hostIds.length) return { error: 'Pick at least one host.' }
  const format = lssEventFormat(hostIds.map(id => byId.get(id)!.first_name))

  const { data: created, error: insErr } = await adminClient
    .from('lss_sessions')
    .insert({
      title: format.summary,
      starts_at: startIso,
      duration_minutes: eventDurationMinutes(event),
      google_event_id: event.id,
    })
    .select('id')
    .single()
  if (insErr || !created) return { error: insErr?.message ?? 'Could not create the session.' }
  const sessionId = created.id as string

  try {
    await setSessionHosts(sessionId, hostIds)
    await patchEvent(settings.calendarId, event.id, format, 'none')
  } catch (e) {
    await adminClient.from('lss_sessions').delete().eq('id', sessionId)
    return { error: `Not imported: ${errMsg(e)}` }
  }

  revalidateLss()
  return { error: null, data: { sessionId, summary: format.summary } }
}

export async function ignoreCalendarEvent(eventId: string): Promise<Result> {
  if (!await getStaffContext()) return { error: 'Unauthorized' }
  const settings = await readCalendarSettings()
  const next = [...new Set([...settings.ignoredEventIds, eventId])]
  const { error } = await adminClient.from('lss_settings').update({ ignored_google_event_ids: next }).eq('id', true)
  if (error) return { error: error.message }
  revalidatePath('/admin/lss')
  return { error: null }
}

// ─── Sync ────────────────────────────────────────────────────────────────────

export interface SyncTarget {
  sessionId: string
  title: string
  whenLabel: string
}

/** Upcoming linked sessions, soonest first: the batches the admin sync runs through. */
export async function listSyncTargets(): Promise<Result<SyncTarget[]>> {
  if (!await getStaffContext()) return { error: 'Unauthorized' }
  try {
    const rows = await upcomingLinkedSessions()
    return {
      error: null,
      data: rows.map(r => {
        const d = new Date(r.starts_at)
        return { sessionId: r.id, title: r.title, whenLabel: `${fmtChicagoDate(d)} · ${fmtChicagoTime(d)}` }
      }),
    }
  } catch (e) {
    return { error: errMsg(e) }
  }
}

/** One batch = one session. The admin page calls this per session with a pause between. */
export async function syncOneSession(sessionId: string, dryRun: boolean): Promise<Result<SessionSyncResult | null>> {
  if (!await getStaffContext()) return { error: 'Unauthorized' }
  try {
    const [r] = await syncLssAttendees({ sessionIds: [sessionId], dryRun })
    if (!dryRun) revalidatePath('/admin/lss')
    return { error: null, data: r ?? null }
  } catch (e) {
    return { error: errMsg(e) }
  }
}

export async function recordSyncSummary(summary: string): Promise<Result> {
  if (!await getStaffContext()) return { error: 'Unauthorized' }
  await adminClient.from('lss_settings').update({ last_sync_at: new Date().toISOString(), last_sync_summary: summary.slice(0, 500) }).eq('id', true)
  revalidatePath('/admin/lss')
  return { error: null }
}

// ─── Sessions created / edited in /admin/lss ─────────────────────────────────

/**
 * Brings a session's Google event in line after a create or edit in
 * /admin/lss. Linked: patches title/description/location/guest permissions
 * (start/end only when the time was changed here, keeping the event's own
 * time zone). Not linked and `createInGoogle`: creates the event with the
 * hosts as guests, then adds clients through the normal sync.
 */
export async function pushSessionToGoogle(sessionId: string, createInGoogle: boolean): Promise<Result<{ created: boolean }>> {
  if (!await getStaffContext()) return { error: 'Unauthorized' }
  const settings = await readCalendarSettings()
  const token = await readTokenRow()
  if (!settings.calendarId || !token?.refresh_token) return { error: null, data: { created: false } }

  const { data: s } = await adminClient
    .from('lss_sessions')
    .select('id, starts_at, duration_minutes, google_event_id')
    .eq('id', sessionId)
    .single()
  if (!s) return { error: 'Session not found' }
  if ((s.starts_at as string) < LSS_IMPORT_FROM_ISO) return { error: null, data: { created: false } }

  const hosts = (await hostsBySession([sessionId])).get(sessionId) ?? []
  const format = lssEventFormat(hosts.map(h => h.first_name))
  const startMs = new Date(s.starts_at as string).getTime()
  const endIso = new Date(startMs + (s.duration_minutes as number) * 60_000).toISOString()

  try {
    if (s.google_event_id) {
      const ev = await getEvent(settings.calendarId, s.google_event_id as string)
      const body: Partial<GEvent> = { ...format }
      const evStart = ev.start.dateTime ? new Date(ev.start.dateTime).getTime() : NaN
      const evEnd = ev.end.dateTime ? new Date(ev.end.dateTime).getTime() : NaN
      if (evStart !== startMs || evEnd !== new Date(endIso).getTime()) {
        const tz = ev.start.timeZone ?? 'America/Chicago'
        body.start = { dateTime: new Date(startMs).toISOString(), timeZone: tz }
        body.end = { dateTime: endIso, timeZone: ev.end.timeZone ?? tz }
      }
      // Existing guests (hosts + clients) hear about a time change; a title-only edit is silent.
      await patchEvent(settings.calendarId, s.google_event_id as string, body, body.start ? 'all' : 'none')
      await adminClient.from('lss_sessions').update({ title: format.summary }).eq('id', sessionId)
      await syncLssAttendees({ sessionIds: [sessionId] })
      return { error: null, data: { created: false } }
    }

    if (!createInGoogle) return { error: null, data: { created: false } }
    const ev = await insertEvent(settings.calendarId, {
      ...format,
      start: { dateTime: new Date(startMs).toISOString(), timeZone: 'America/Chicago' },
      end: { dateTime: endIso, timeZone: 'America/Chicago' },
      attendees: hosts.map(h => ({ email: h.email })),
    }, 'all') // only the hosts are guests at this point
    await adminClient.from('lss_sessions').update({ google_event_id: ev.id, title: format.summary }).eq('id', sessionId)
    await syncLssAttendees({ sessionIds: [sessionId] })
    revalidateLss()
    return { error: null, data: { created: true } }
  } catch (e) {
    return { error: `Saved here, but Google Calendar was not updated: ${errMsg(e)}` }
  }
}
