// Live Support Sessions — roster and Google Calendar attendee sync. SERVER ONLY.
//
// Attendees of every upcoming, linked session = host emails + eligible client
// emails. Eligible = the OWNER of a studio whose subscription_tier is scale or
// lifetime, with role studio_owner (otb_staff / otb_admin are never added as
// clients; coaches come in as hosts). Comparison is case-insensitive.
//
// Removals and additions are sent as two separate PATCHes: removals always
// with sendUpdates=none (people quietly drop off), additions with the mode
// stored in lss_settings.invite_send_updates.
//
// Client invites paused (lss_settings.client_invites_paused, default true):
// no sync adds clients — nightly cron, tier changes, session edits and the
// admin button all respect it. Hosts are still added and removals still apply.
// Dry runs (Preview) ignore it so the admin can see what would be sent.
//
// Rolling invite window (lss_settings.invite_window_days): clients are only
// ADDED to sessions starting within the window; hosts are always added.
// Removals apply to every upcoming session, inside the window or not.
//
// Never removes: hosts, any lss_coaches email, the connected calendar owner,
// the organizer, or resources. Never touches events before Dec 1, 2026.

import { adminClient } from '@/lib/supabase/admin'
import {
  GoogleApiError,
  LSS_IMPORT_FROM_ISO,
  containsZoomLink,
  getEvent,
  joinFirstNames,
  patchEvent,
  readTokenRow,
  type GAttendee,
  type SendUpdates,
} from '@/lib/lss-google'

export const LSS_ELIGIBLE_TIERS = ['scale', 'lifetime'] as const

const norm = (e: string | null | undefined) => (e ?? '').trim().toLowerCase()

// ─── Settings ────────────────────────────────────────────────────────────────

export interface LssCalendarSettings {
  calendarId: string | null
  sendUpdates: SendUpdates
  ignoredEventIds: string[]
  inviteWindowDays: number
  clientInvitesPaused: boolean
}

export const LSS_DEFAULT_INVITE_WINDOW_DAYS = 14

export async function readCalendarSettings(): Promise<LssCalendarSettings> {
  const { data } = await adminClient
    .from('lss_settings')
    .select('google_calendar_id, invite_send_updates, ignored_google_event_ids, invite_window_days, client_invites_paused')
    .eq('id', true)
    .maybeSingle()
  const row = data as {
    google_calendar_id: string | null
    invite_send_updates: SendUpdates | null
    ignored_google_event_ids: string[] | null
    invite_window_days: number | null
    client_invites_paused: boolean | null
  } | null
  return {
    calendarId: row?.google_calendar_id?.trim() || null,
    sendUpdates: row?.invite_send_updates ?? 'none',
    ignoredEventIds: row?.ignored_google_event_ids ?? [],
    inviteWindowDays: row?.invite_window_days ?? LSS_DEFAULT_INVITE_WINDOW_DAYS,
    // Fail closed: no row or no column means paused.
    clientInvitesPaused: row?.client_invites_paused ?? true,
  }
}

// ─── Coaches & hosts ─────────────────────────────────────────────────────────

export interface CoachRow {
  id: string
  first_name: string
  email: string
  active: boolean
}

export async function listCoaches(): Promise<CoachRow[]> {
  const { data, error } = await adminClient
    .from('lss_coaches')
    .select('id, first_name, email, active')
    .order('first_name')
  if (error) throw new Error(error.message)
  return (data ?? []) as CoachRow[]
}

/** session_id → hosts in display order. */
export async function hostsBySession(sessionIds?: string[]): Promise<Map<string, CoachRow[]>> {
  let q = adminClient
    .from('lss_session_hosts')
    .select('session_id, position, lss_coaches (id, first_name, email, active)')
    .order('position')
  if (sessionIds) q = q.in('session_id', sessionIds)
  const { data, error } = await q
  if (error) throw new Error(error.message)

  const map = new Map<string, CoachRow[]>()
  for (const r of (data ?? []) as unknown as { session_id: string; lss_coaches: CoachRow | null }[]) {
    if (!r.lss_coaches) continue
    const list = map.get(r.session_id) ?? []
    list.push(r.lss_coaches)
    map.set(r.session_id, list)
  }
  return map
}

/**
 * Replaces a session's hosts and refreshes lss_sessions.coach_names with
 * their FIRST NAMES only — the one host field clients can read.
 */
export async function setSessionHosts(sessionId: string, coachIds: string[]): Promise<string> {
  const coaches = await listCoaches()
  const byId = new Map(coaches.map(c => [c.id, c]))
  const ordered = coachIds.filter((id, i) => byId.has(id) && coachIds.indexOf(id) === i)

  const { error: delErr } = await adminClient.from('lss_session_hosts').delete().eq('session_id', sessionId)
  if (delErr) throw new Error(delErr.message)
  if (ordered.length) {
    const { error } = await adminClient
      .from('lss_session_hosts')
      .insert(ordered.map((coach_id, position) => ({ session_id: sessionId, coach_id, position })))
    if (error) throw new Error(error.message)
  }

  const names = joinFirstNames(ordered.map(id => byId.get(id)!.first_name))
  const { error: upErr } = await adminClient
    .from('lss_sessions')
    .update({ coach_names: names || null })
    .eq('id', sessionId)
  if (upErr) throw new Error(upErr.message)
  return names
}

// ─── Eligible clients ────────────────────────────────────────────────────────

async function authEmailsById(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  for (let page = 1; page < 50; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`Could not list users: ${error.message}`)
    for (const u of data.users) if (u.email) map.set(u.id, norm(u.email))
    if (data.users.length < 1000) break
  }
  return map
}

/**
 * Login emails of eligible clients. With `studioId`, only that studio's owner
 * (returns an empty set if that studio is not eligible).
 */
export async function eligibleClientEmails(studioId?: string): Promise<Set<string>> {
  let sq = adminClient
    .from('studios')
    .select('id, owner_user_id, subscription_tier')
    .in('subscription_tier', [...LSS_ELIGIBLE_TIERS])
  if (studioId) sq = sq.eq('id', studioId)
  const { data: studios, error } = await sq
  if (error) throw new Error(error.message)

  const ownerIds = [...new Set((studios ?? []).map(s => s.owner_user_id as string | null).filter((x): x is string => !!x))]
  if (!ownerIds.length) return new Set()

  const { data: profiles, error: pErr } = await adminClient
    .from('profiles')
    .select('id, email, role')
    .in('id', ownerIds)
  if (pErr) throw new Error(pErr.message)

  const authEmails = await authEmailsById()
  const out = new Set<string>()
  for (const p of (profiles ?? []) as { id: string; email: string | null; role: string | null }[]) {
    if (p.role !== 'studio_owner') continue
    const email = authEmails.get(p.id) ?? norm(p.email)
    if (email) out.add(email)
  }
  return out
}

/** Every login email that belongs to a studio's owner (eligible or not), for studio-scoped syncs. */
async function studioOwnerEmails(studioId: string): Promise<Set<string>> {
  const { data: studio } = await adminClient.from('studios').select('owner_user_id').eq('id', studioId).maybeSingle()
  const ownerId = (studio as { owner_user_id: string | null } | null)?.owner_user_id
  const out = new Set<string>()
  if (!ownerId) return out
  const { data: u } = await adminClient.auth.admin.getUserById(ownerId)
  if (u?.user?.email) out.add(norm(u.user.email))
  const { data: p } = await adminClient.from('profiles').select('email').eq('id', ownerId).maybeSingle()
  const pe = norm((p as { email: string | null } | null)?.email)
  if (pe) out.add(pe)
  return out
}

// ─── Sync ────────────────────────────────────────────────────────────────────

export interface SessionSyncResult {
  sessionId: string
  title: string
  startsAt: string
  added: string[]
  removed: string[]
  attendeeCount: number | null
  error: string | null
  quota: boolean
  skipped?: string
  /** False when the session starts after the invite window: clients are not added yet. */
  inWindow: boolean
  /** True when client invites are paused: only hosts were (or would be) added. */
  clientsPaused: boolean
}

export interface SyncOptions {
  /** Only these sessions (by id). Default: every upcoming linked session. */
  sessionIds?: string[]
  /** Limit adds/removes to one studio's owner. */
  studioId?: string
  /** Compute the changes without writing to Google. */
  dryRun?: boolean
  /** Override lss_settings.invite_send_updates for additions. */
  sendUpdates?: SendUpdates
}

interface LinkedSession {
  id: string
  title: string
  starts_at: string
  duration_minutes: number
  google_event_id: string
}

/** Upcoming sessions linked to Google, soonest first. */
export async function upcomingLinkedSessions(sessionIds?: string[]): Promise<LinkedSession[]> {
  const nowIso = new Date().toISOString()
  const fromIso = nowIso > LSS_IMPORT_FROM_ISO ? nowIso : LSS_IMPORT_FROM_ISO
  let q = adminClient
    .from('lss_sessions')
    .select('id, title, starts_at, duration_minutes, google_event_id')
    .not('google_event_id', 'is', null)
    .gte('starts_at', fromIso)
    .order('starts_at', { ascending: true })
  if (sessionIds) q = q.in('id', sessionIds)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as LinkedSession[]
}

interface SyncContext {
  calendarId: string
  sendUpdates: SendUpdates
  eligible: Set<string>
  scope: Set<string> | null // emails a studio-scoped run may change; null = all
  protectedEmails: Set<string>
  hosts: Map<string, CoachRow[]>
  dryRun: boolean
  /** Sessions starting before this instant get clients added. */
  windowEndIso: string
  /** lss_settings.client_invites_paused (ignored on dry runs). */
  clientsPaused: boolean
}

async function buildContext(opts: SyncOptions, sessionIds: string[]): Promise<SyncContext> {
  const settings = await readCalendarSettings()
  if (!settings.calendarId) throw new Error('No Google calendar ID is set')

  const [coaches, hosts, eligible, token, scope] = await Promise.all([
    listCoaches(),
    hostsBySession(sessionIds),
    eligibleClientEmails(opts.studioId),
    readTokenRow(),
    opts.studioId ? studioOwnerEmails(opts.studioId) : Promise.resolve(null),
  ])

  const protectedEmails = new Set<string>(coaches.map(c => norm(c.email)))
  if (token?.account_email) protectedEmails.add(norm(token.account_email))
  protectedEmails.add(norm(settings.calendarId))

  return {
    calendarId: settings.calendarId,
    sendUpdates: opts.sendUpdates ?? settings.sendUpdates,
    eligible,
    scope,
    protectedEmails,
    hosts,
    dryRun: !!opts.dryRun,
    windowEndIso: new Date(Date.now() + settings.inviteWindowDays * 86_400_000).toISOString(),
    clientsPaused: settings.clientInvitesPaused && !opts.dryRun,
  }
}

async function syncOne(s: LinkedSession, ctx: SyncContext): Promise<SessionSyncResult> {
  const base: SessionSyncResult = {
    sessionId: s.id, title: s.title, startsAt: s.starts_at,
    added: [], removed: [], attendeeCount: null, error: null, quota: false,
    inWindow: new Date(s.starts_at).toISOString() < ctx.windowEndIso,
    clientsPaused: ctx.clientsPaused,
  }
  if (s.starts_at < LSS_IMPORT_FROM_ISO) return { ...base, skipped: 'before Dec 1, 2026' }

  try {
    const event = await getEvent(ctx.calendarId, s.google_event_id)
    const start = event.start.dateTime ?? event.start.date ?? ''
    if (start && new Date(start).toISOString() < LSS_IMPORT_FROM_ISO) {
      return { ...base, skipped: 'Google event is before Dec 1, 2026' }
    }

    // Never invite clients to an event that still shows the real Zoom link
    // (e.g. an event edited by hand in Google after import).
    if (containsZoomLink(event)) {
      throw new Error('The Google event still contains a zoom.us link; clients were not added. Fix the event (re-save it in /admin/lss) and sync again.')
    }

    const hostEmails = (ctx.hosts.get(s.id) ?? []).map(h => norm(h.email))
    // `wanted` decides removals (an eligible client is never removed, in or out
    // of the window); `toAdd` decides additions (clients only inside the window).
    const wanted = new Set<string>([...hostEmails, ...ctx.eligible])
    const toAdd = base.inWindow && !ctx.clientsPaused ? wanted : new Set<string>(hostEmails)
    const inScope = (e: string) => ctx.scope === null || ctx.scope.has(e) || hostEmails.includes(e)

    const current = event.attendees ?? []
    const keep: GAttendee[] = []
    const removed: string[] = []
    for (const a of current) {
      const e = norm(a.email)
      const isProtected = a.organizer || a.self || a.resource || ctx.protectedEmails.has(e) || hostEmails.includes(e)
      if (!wanted.has(e) && !isProtected && inScope(e)) removed.push(e)
      else keep.push(a)
    }
    const have = new Set(keep.map(a => norm(a.email)))
    const added = [...toAdd].filter(e => !have.has(e) && inScope(e)).sort()

    if (!ctx.dryRun) {
      if (removed.length) {
        await patchEvent(ctx.calendarId, s.google_event_id, { attendees: keep }, 'none')
      }
      if (added.length) {
        await patchEvent(
          ctx.calendarId,
          s.google_event_id,
          { attendees: [...keep, ...added.map(email => ({ email }))] },
          ctx.sendUpdates,
        )
      }
      await adminClient.from('lss_session_sync').upsert({
        session_id: s.id,
        synced_at: new Date().toISOString(),
        error: null,
        last_added: added.length,
        last_removed: removed.length,
        attendee_count: keep.length + added.length,
      }, { onConflict: 'session_id' })
    }

    return { ...base, added, removed: removed.sort(), attendeeCount: keep.length + added.length }
  } catch (err) {
    const quota = err instanceof GoogleApiError && err.isQuota
    const message = err instanceof Error ? err.message : String(err)
    if (!ctx.dryRun) {
      await adminClient.from('lss_session_sync').upsert(
        { session_id: s.id, synced_at: new Date().toISOString(), error: message },
        { onConflict: 'session_id' },
      )
    }
    return { ...base, error: message, quota }
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * syncLssAttendees — brings every upcoming linked session's attendees in line
 * with hosts + eligible clients. Sessions run soonest first; stops at the
 * first quota/rate-limit error.
 */
export async function syncLssAttendees(opts: SyncOptions = {}, pauseMs = 0): Promise<SessionSyncResult[]> {
  const sessions = await upcomingLinkedSessions(opts.sessionIds)
  if (!sessions.length) return []
  const ctx = await buildContext(opts, sessions.map(s => s.id))

  const results: SessionSyncResult[] = []
  for (const [i, s] of sessions.entries()) {
    if (i > 0 && pauseMs > 0) await sleep(pauseMs)
    const r = await syncOne(s, ctx)
    results.push(r)
    if (r.quota) break
  }

  if (!opts.dryRun && !opts.sessionIds && !opts.studioId) {
    const added = results.reduce((n, r) => n + r.added.length, 0)
    const removed = results.reduce((n, r) => n + r.removed.length, 0)
    const errors = results.filter(r => r.error).length
    await adminClient.from('lss_settings').update({
      last_sync_at: new Date().toISOString(),
      last_sync_summary: `${results.length} sessions · +${added} −${removed}${errors ? ` · ${errors} errors` : ''}`,
    }).eq('id', true)
  }
  return results
}

/**
 * Run after a studio's tier/access changes. Never throws: a Google problem
 * must not fail the admin action that triggered it (the nightly sync retries).
 */
export async function syncLssForStudio(studioId: string | null | undefined): Promise<void> {
  if (!studioId) return
  try {
    const token = await readTokenRow()
    if (!token?.refresh_token) return
    const results = await syncLssAttendees({ studioId })
    const changed = results.filter(r => r.added.length || r.removed.length || r.error)
    if (changed.length) {
      console.info('[lss] studio sync', studioId, changed.map(r => ({ s: r.sessionId, a: r.added.length, r: r.removed.length, e: r.error })))
    }
  } catch (err) {
    console.error('[lss] studio sync failed', studioId, err instanceof Error ? err.message : err)
  }
}
