// Live Support Sessions — helpers safe to import from client and server code.
// Nothing here touches lss_settings or the Zoom URL.

import type { LssSession } from '@/types/database'

export const LSS_TIMEZONE = 'America/Chicago'
export const LSS_JOIN_PATH = '/lss/join'
export const LSS_PUBLIC_JOIN_URL = 'https://studio.outsidethebachs.com/lss/join'

/** Minutes before the start that the Join button becomes active. */
export const LSS_JOIN_OPENS_MINUTES = 10

export type LssSessionSummary = Pick<
  LssSession,
  'id' | 'title' | 'coach_names' | 'starts_at' | 'duration_minutes' | 'description' | 'facebook_event_url' | 'recording_url'
>

export function sessionEnd(s: Pick<LssSession, 'starts_at' | 'duration_minutes'>): Date {
  return new Date(new Date(s.starts_at).getTime() + s.duration_minutes * 60_000)
}

export function isJoinOpen(s: Pick<LssSession, 'starts_at' | 'duration_minutes'>, now: Date): boolean {
  const opens = new Date(s.starts_at).getTime() - LSS_JOIN_OPENS_MINUTES * 60_000
  return now.getTime() >= opens && now.getTime() < sessionEnd(s).getTime()
}

/** Sessions that have not ended yet, soonest first. */
export function upcomingSessions<T extends Pick<LssSession, 'starts_at' | 'duration_minutes'>>(rows: T[], now: Date): T[] {
  return rows
    .filter(s => sessionEnd(s).getTime() > now.getTime())
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
}

/** Sessions that have ended, most recent first. */
export function pastSessions<T extends Pick<LssSession, 'starts_at' | 'duration_minutes'>>(rows: T[], now: Date): T[] {
  return rows
    .filter(s => sessionEnd(s).getTime() <= now.getTime())
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
}

// ─── America/Chicago conversion ──────────────────────────────────────────────

function tzOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - utcMs
}

/**
 * "2026-12-03" + "19:30" in America/Chicago → ISO UTC string.
 * Returns null for malformed input.
 */
export function chicagoToUtcIso(date: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const t = /^(\d{2}):(\d{2})$/.exec(time)
  if (!d || !t) return null
  const wall = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2])
  // Two passes settle the offset across a DST boundary.
  let utc = wall - tzOffsetMs(wall, LSS_TIMEZONE)
  utc = wall - tzOffsetMs(utc, LSS_TIMEZONE)
  return new Date(utc).toISOString()
}

/** ISO UTC → { date: "YYYY-MM-DD", time: "HH:MM" } in America/Chicago, for form inputs. */
export function utcToChicagoInputs(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LSS_TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

export function fmtChicagoDate(d: Date): string {
  return d.toLocaleDateString('en-US', { timeZone: LSS_TIMEZONE, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export function fmtChicagoTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { timeZone: LSS_TIMEZONE, hour: 'numeric', minute: '2-digit' })
}

// ─── Facebook event prompt ───────────────────────────────────────────────────

export function buildFacebookPrompt(s: Pick<LssSession, 'title' | 'starts_at' | 'duration_minutes' | 'description'>): string {
  const start = new Date(s.starts_at)
  const end = sessionEnd(s)
  const details = `${(s.description ?? '').trim()}\n\nJoin from your OTB dashboard: ${LSS_PUBLIC_JOIN_URL}`.trim()
  return [
    'Goal: Create a Facebook event in the "Outside The Bachs" group for this Live Support Session.',
    "Start: https://www.facebook.com/groups/outsidethebachs/events (I'll be logged in already).",
    'Steps:',
    '1. Click "Create event". Confirm the event form is open before continuing.',
    `2. Event name: ${s.title}`,
    `3. Start: ${fmtChicagoDate(start)} ${fmtChicagoTime(start)} Central. End: ${fmtChicagoTime(end)} Central.`,
    `4. Choose an online event / external link and use: ${LSS_PUBLIC_JOIN_URL}`,
    `5. Details: ${details}`,
    "Identify fields by their visible labels. If you can't find a field, stop and describe what you see.",
    'STOP before clicking "Create event"/"Post". Show me the filled form and wait for my OK.',
    'Done when: the event is published. Then report the event URL so I can paste it into the dashboard.',
  ].join('\n')
}
