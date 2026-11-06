import type { FacebookGroup } from '@/types/database'

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type Day = (typeof DAYS)[number]

export const DAY_LABEL: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
}

const JS_DAY: Day[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as unknown as Day[]

export function todayKey(now = new Date()): Day {
  return JS_DAY[now.getDay()]
}

export function getISOWeek(date: Date): number {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
  const w1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d.getTime() - w1.getTime()) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7)
}

/** A-Week = odd ISO week, B-Week = even — the same rule isDueToday uses. */
export function currentWeek(now = new Date()): 'a' | 'b' {
  return getISOWeek(now) % 2 === 1 ? 'a' : 'b'
}

type DayCells = Record<Day, FacebookGroup[]>

export interface Schedule {
  /** Weekly-cycle posts: daily, weekly and biweekly groups. */
  weeks: { a: DayCells; b: DayCells }
  /** Monthly and bimonthly groups post in the first week of the month, outside the A/B cycle. */
  monthly: DayCells
  /** Active groups missing a frequency, posting days or (biweekly) an A/B week. */
  flagged: { group: FacebookGroup; reason: string }[]
  inactiveCount: number
}

function emptyCells(): DayCells {
  return { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
}

export function buildSchedule(groups: FacebookGroup[]): Schedule {
  const s: Schedule = { weeks: { a: emptyCells(), b: emptyCells() }, monthly: emptyCells(), flagged: [], inactiveCount: 0 }

  for (const g of groups) {
    if (!g.is_active) { s.inactiveCount++; continue }
    if (!g.post_frequency) { s.flagged.push({ group: g, reason: 'No posting schedule set' }); continue }

    const days = (g.post_days ?? []).filter((d): d is Day => (DAYS as readonly string[]).includes(d))

    if (g.post_frequency === 'daily') {
      for (const d of DAYS) { s.weeks.a[d].push(g); s.weeks.b[d].push(g) }
      continue
    }
    if (days.length === 0) { s.flagged.push({ group: g, reason: 'No posting day picked' }); continue }

    if (g.post_frequency === 'monthly' || g.post_frequency === 'bimonthly') {
      for (const d of days) s.monthly[d].push(g)
      continue
    }

    let weeks: ('a' | 'b')[] = ['a', 'b']
    if (g.post_frequency === 'biweekly') {
      if (g.post_week_pattern === 'a_week') weeks = ['a']
      else if (g.post_week_pattern === 'b_week') weeks = ['b']
      else if (!g.post_week_pattern) s.flagged.push({ group: g, reason: 'Biweekly with no A/B week picked (shown in both weeks)' })
    }
    for (const w of weeks) for (const d of days) s.weeks[w][d].push(g)
  }
  return s
}
