import { formatDate } from '@/lib/utils'
import type { WorkPlanTaskShape } from '@/types/database'

/**
 * Display order for timeframe_group: the one-time Week 1-6 launch sprint first,
 * then the recurring cadences. Anything unrecognised sorts last, alphabetically,
 * so a hand-typed group still renders rather than disappearing.
 */
export const TIMEFRAME_ORDER = [
  'Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6',
  'Weekly', 'Monthly', 'Semester',
]

export function compareTimeframeGroups(a: string, b: string): number {
  const ia = TIMEFRAME_ORDER.indexOf(a)
  const ib = TIMEFRAME_ORDER.indexOf(b)
  if (ia !== -1 && ib !== -1) return ia - ib
  if (ia !== -1) return -1
  if (ib !== -1) return 1
  return a.localeCompare(b)
}

/** Tasks bucketed by timeframe_group, groups in pipeline order, tasks by sort_order. */
export function groupTasksByTimeframe<T extends Pick<WorkPlanTaskShape, 'timeframe_group' | 'sort_order'>>(
  tasks: T[],
): { group: string; tasks: T[] }[] {
  const buckets = new Map<string, T[]>()
  for (const task of tasks) {
    const list = buckets.get(task.timeframe_group)
    if (list) list.push(task)
    else buckets.set(task.timeframe_group, [task])
  }
  return [...buckets.keys()]
    .sort(compareTimeframeGroups)
    .map(group => ({
      group,
      tasks: (buckets.get(group) ?? []).sort((a, b) => a.sort_order - b.sort_order),
    }))
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
