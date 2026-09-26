import { formatDate } from '@/lib/utils'
import type { WorkPlanTaskShape } from '@/types/database'

/**
 * The ONLY columns a client-facing surface may read, for plans and for tasks.
 *
 * These mirror the work_plans_client / work_plan_tasks_client views column for
 * column. The views are the security boundary for a real member; under View As
 * the app reads base tables with the service-role client, where no view stands
 * in the way — so the View As path selects exactly these strings instead. Both
 * paths live in lib/work-plans-data.ts and share these constants, so the two
 * cannot drift into exposing different data.
 *
 * internal_note and done_by are absent by design. Adding either here would
 * defeat the views.
 */
export const CLIENT_PLAN_COLUMNS = 'id, title, status, is_published, created_at, updated_at'

export const CLIENT_TASK_COLUMNS =
  'id, work_plan_id, title, description, timeframe_group, week_number, ' +
  'is_recurring, starts_after_week, sort_order, milestone_tag, links, ' +
  'status, is_done, done_at, client_note, is_client_added, created_at, updated_at'

/** Mirrors work_plan_task_items_client. done_by is absent by design. */
export const CLIENT_TASK_ITEM_COLUMNS =
  'id, task_id, title, sort_order, is_done, done_at, created_at, updated_at'

/**
 * Display order for timeframe_group.
 *
 * "Brain dump" sorts FIRST — it is the capture area for loose ideas, so it
 * belongs at the top rather than buried after the schedule. Then the one-time
 * Week 1-6 launch sprint, then the recurring cadences.
 *
 * timeframe_group is free text in the database (no CHECK, no enum), which is
 * what lets a client name their own group. Anything not in this list is a
 * custom group and sorts after everything here — see orderTimeframeGroups.
 */
export const BRAIN_DUMP_GROUP = 'Brain dump'

export const TIMEFRAME_ORDER = [
  BRAIN_DUMP_GROUP,
  'Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6',
  'Weekly', 'Monthly', 'Semester',
]

/**
 * Standard groups in fixed order, then custom groups. Unrecognised groups sort
 * last, alphabetically — a stable fallback when no creation dates are available.
 *
 * Prefer orderTimeframeGroups when you have the tasks: it orders custom groups
 * by when they first appeared, which is what a client expects after adding one.
 */
export function compareTimeframeGroups(a: string, b: string): number {
  const ia = TIMEFRAME_ORDER.indexOf(a)
  const ib = TIMEFRAME_ORDER.indexOf(b)
  if (ia !== -1 && ib !== -1) return ia - ib
  if (ia !== -1) return -1
  if (ib !== -1) return 1
  return a.localeCompare(b)
}

type GroupedTask = Pick<WorkPlanTaskShape, 'timeframe_group' | 'sort_order' | 'created_at'>

/**
 * The group names present in `tasks`, ordered for display: standard groups in
 * TIMEFRAME_ORDER, then custom groups by first appearance (the earliest
 * created_at of any task in them), alphabetical as a tiebreak.
 *
 * Custom groups need no table of their own — a group exists exactly where a task
 * references it, which is also what scopes it to one plan.
 */
export function orderTimeframeGroups(tasks: GroupedTask[]): string[] {
  const firstSeen = new Map<string, string>()
  for (const t of tasks) {
    const seen = firstSeen.get(t.timeframe_group)
    if (seen === undefined || t.created_at < seen) firstSeen.set(t.timeframe_group, t.created_at)
  }

  const standard: string[] = []
  const custom: string[] = []
  for (const group of firstSeen.keys()) {
    if (TIMEFRAME_ORDER.includes(group)) standard.push(group)
    else custom.push(group)
  }

  standard.sort((a, b) => TIMEFRAME_ORDER.indexOf(a) - TIMEFRAME_ORDER.indexOf(b))
  custom.sort((a, b) => {
    const fa = firstSeen.get(a) ?? ''
    const fb = firstSeen.get(b) ?? ''
    return fa.localeCompare(fb) || a.localeCompare(b)
  })

  return [...standard, ...custom]
}

/** Tasks bucketed by timeframe_group, groups in display order, tasks by sort_order. */
export function groupTasksByTimeframe<T extends GroupedTask>(
  tasks: T[],
): { group: string; tasks: T[] }[] {
  const buckets = new Map<string, T[]>()
  for (const task of tasks) {
    const list = buckets.get(task.timeframe_group)
    if (list) list.push(task)
    else buckets.set(task.timeframe_group, [task])
  }
  return orderTimeframeGroups(tasks).map(group => ({
    group,
    tasks: (buckets.get(group) ?? []).sort((a, b) => a.sort_order - b.sort_order),
  }))
}

/**
 * A readable label for a task link.
 *
 * Almost no seeded link carries a label (168 of 174 at the time of writing), and
 * raw URLs read badly — a Google Docs id is 44 opaque characters. So:
 *   1. an explicit label always wins;
 *   2. a slug-shaped last path segment becomes title case
 *      (…/education/mindset/goal-setting → "Goal Setting");
 *   3. anything else falls back to a friendly host name, because an opaque id
 *      humanises into noise.
 */
const HOST_LABELS: Record<string, string> = {
  'docs.google.com':             'Google Doc',
  'drive.google.com':            'Google Drive file',
  'calendly.com':                'Calendly',
  'studio.outsidethebachs.com':  'OTB Studio',
  'cadence.outsidethebachs.com': 'Cadence Check-In',
  'www.outsidethebachs.com':     'outsidethebachs.com',
}

/** A slug is lowercase words separated by hyphens — not an opaque id. */
function slugToTitle(segment: string): string | null {
  const s = decodeURIComponent(segment).replace(/\.(html?|php)$/i, '')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(s)) return null
  // Reject things that are mostly digits or one very long token (ids).
  if (s.split('-').some(w => w.length > 24)) return null
  return s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export function linkLabel(link: { url: string; label: string | null }): string {
  if (link.label && link.label.trim()) return link.label.trim()

  let parsed: URL
  try {
    parsed = new URL(link.url)
  } catch {
    return link.url
  }

  const segments = parsed.pathname.split('/').filter(Boolean)
  for (let i = segments.length - 1; i >= 0; i--) {
    const title = slugToTitle(segments[i])
    if (title) return title
  }

  return HOST_LABELS[parsed.hostname] ?? parsed.hostname.replace(/^www\./, '')
}

/** Whole-number completion percent. 0 when a plan has no tasks (never NaN). */
export function completionPercent(done: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((done / total) * 100)
}

export interface StudioOption {
  id: string
  name: string
  created_at: string | null
}

/**
 * One entry per studio id, ordered by name, with a disambiguator appended only
 * where two DISTINCT studios share a name.
 *
 * studios holds many same-named rows with different ids — 156 rows across 78
 * names at the time of writing, from repeated signups producing "<handle>'s
 * Studio". They are separate studios, so deduping by name would hide real ones;
 * the picker instead makes them tellable apart by created date plus a short id
 * fragment, which is unique even when four share a name and a day.
 */
export function labelStudioOptions(studios: StudioOption[]): { id: string; label: string }[] {
  const nameCounts = new Map<string, number>()
  for (const s of studios) nameCounts.set(s.name, (nameCounts.get(s.name) ?? 0) + 1)

  return studios
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name) || (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    .map(s => ({
      id: s.id,
      label:
        (nameCounts.get(s.name) ?? 0) > 1
          ? `${s.name} · ${formatDate(s.created_at)} · ${s.id.slice(0, 8)}`
          : s.name,
    }))
}
