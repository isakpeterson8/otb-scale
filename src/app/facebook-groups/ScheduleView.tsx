'use client'

import type { FacebookGroup } from '@/types/database'
import { DAYS, DAY_LABEL, buildSchedule, currentWeek, todayKey, type Day } from './schedule'

const GRID_COLS = '96px repeat(7, minmax(108px, 1fr)) 64px'

// First column stays put while the grid scrolls sideways on narrow screens.
// Opaque base so scrolled cells don't show through the translucent row tint.
const STICKY = 'sticky left-0 z-10'
const stickyBg = (tint?: string) => ({ background: tint ? `linear-gradient(${tint}, ${tint}), var(--surface)` : 'var(--surface)' })

function CountBadge({ n }: { n: number }) {
  if (n === 0) return null
  return (
    <span
      className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-medium"
      style={{ background: 'var(--accent-light)', color: 'var(--accent-text)' }}
    >
      {n}
    </span>
  )
}

function GroupChip({ group, onEdit }: { group: FacebookGroup; onEdit: (g: FacebookGroup) => void }) {
  return (
    <button
      type="button"
      onClick={() => onEdit(group)}
      title={`Edit ${group.group_name}`}
      className="block w-full text-left truncate text-xs text-[var(--ink-2)] hover:text-[var(--accent-text)] transition-colors"
    >
      {group.group_name}
    </button>
  )
}

function Row({
  label,
  sublabel,
  cells,
  isCurrent,
  highlightDay,
  onEdit,
}: {
  label: string
  sublabel?: string
  cells: Record<Day, FacebookGroup[]>
  isCurrent: boolean
  highlightDay: Day | null
  onEdit: (g: FacebookGroup) => void
}) {
  const total = DAYS.reduce((n, d) => n + cells[d].length, 0)
  return (
    <div
      className="grid border-b border-[var(--ink)]/8"
      style={{ gridTemplateColumns: GRID_COLS, background: isCurrent ? 'var(--accent-light)' : undefined }}
    >
      <div className={`px-3 py-3 border-r border-[var(--ink)]/8 ${STICKY}`} style={stickyBg(isCurrent ? 'var(--accent-light)' : undefined)}>
        <p className="text-sm font-medium text-[var(--ink)]">{label}</p>
        {sublabel && <p className="text-[11px] text-[var(--ink-3)] leading-tight mt-0.5">{sublabel}</p>}
        {isCurrent && (
          <span
            className="inline-block mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
            style={{ background: 'var(--accent-text)', color: 'var(--canvas)' }}
          >
            This week
          </span>
        )}
      </div>
      {DAYS.map(d => {
        const list = cells[d]
        const isToday = highlightDay === d
        return (
          <div
            key={d}
            className="px-2 py-2 border-r border-[var(--ink)]/8 min-w-0 space-y-0.5"
            style={isToday ? { boxShadow: 'inset 0 0 0 2px var(--accent-text)' } : undefined}
            aria-label={`${label} ${DAY_LABEL[d]}: ${list.length} group${list.length === 1 ? '' : 's'}${isToday ? ' (today)' : ''}`}
          >
            <div className="flex justify-end h-5">
              <CountBadge n={list.length} />
            </div>
            {list.map(g => <GroupChip key={g.id} group={g} onEdit={onEdit} />)}
          </div>
        )
      })}
      <div className="px-2 py-3 flex items-start justify-center">
        <span className="text-sm font-medium text-[var(--ink)]">{total}</span>
      </div>
    </div>
  )
}

export default function ScheduleView({
  groups,
  onEdit,
}: {
  groups: FacebookGroup[]
  onEdit: (g: FacebookGroup) => void
}) {
  const schedule = buildSchedule(groups)
  const now = new Date()
  const week = currentWeek(now)
  const today = todayKey(now)
  const isFirstWeekOfMonth = now.getDate() <= 7

  const dayTotal = (d: Day) => schedule.weeks.a[d].length + schedule.weeks.b[d].length
  const cycleTotal = DAYS.reduce((n, d) => n + dayTotal(d), 0)
  const monthlyCount = DAYS.reduce((n, d) => n + schedule.monthly[d].length, 0)

  return (
    <div className="space-y-4">
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--ink)]/8 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium text-[var(--ink)]">Posting schedule</h3>
          <p className="text-xs text-[var(--ink-3)]">
            {cycleTotal} post{cycleTotal === 1 ? '' : 's'} per 2-week cycle · This week is {week === 'a' ? 'A' : 'B'}-Week · Click a group to edit it
          </p>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[920px]">
            {/* Header */}
            <div className="grid border-b border-[var(--ink)]/8" style={{ gridTemplateColumns: GRID_COLS }}>
              <div className={`px-3 py-2 border-r border-[var(--ink)]/8 ${STICKY}`} style={stickyBg()} />
              {DAYS.map(d => (
                <div
                  key={d}
                  className="px-2 py-2 border-r border-[var(--ink)]/8 text-xs font-medium uppercase tracking-wide text-center"
                  style={{ color: d === today ? 'var(--accent-text)' : 'var(--ink-3)' }}
                >
                  {DAY_LABEL[d]}{d === today && ' · Today'}
                </div>
              ))}
              <div className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-center text-[var(--ink-3)]">Total</div>
            </div>

            <Row label="A-Week" sublabel="Odd weeks" cells={schedule.weeks.a} isCurrent={week === 'a'} highlightDay={week === 'a' ? today : null} onEdit={onEdit} />
            <Row label="B-Week" sublabel="Even weeks" cells={schedule.weeks.b} isCurrent={week === 'b'} highlightDay={week === 'b' ? today : null} onEdit={onEdit} />

            {/* Totals */}
            <div className="grid border-b border-[var(--ink)]/8 bg-[var(--canvas)]" style={{ gridTemplateColumns: GRID_COLS }}>
              <div className={`px-3 py-2 border-r border-[var(--ink)]/8 text-xs font-medium uppercase tracking-wide text-[var(--ink-3)] ${STICKY}`} style={{ background: 'var(--canvas)' }}>A + B</div>
              {DAYS.map(d => (
                <div key={d} className="px-2 py-2 border-r border-[var(--ink)]/8 text-center text-sm font-medium text-[var(--ink)]">
                  {dayTotal(d)}
                </div>
              ))}
              <div className="px-2 py-2 text-center text-sm font-semibold text-[var(--ink)]">{cycleTotal}</div>
            </div>

            {monthlyCount > 0 && (
              <Row
                label="Monthly"
                sublabel="1st week of month; bimonthly in odd months"
                cells={schedule.monthly}
                isCurrent={false}
                highlightDay={isFirstWeekOfMonth ? today : null}
                onEdit={onEdit}
              />
            )}
          </div>
        </div>
      </div>

      {schedule.flagged.length > 0 && (
        <div className="bg-[var(--surface)] rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(180,83,9,0.35)' }}>
          <div className="px-5 py-3 border-b border-[var(--ink)]/8">
            <h3 className="text-sm font-medium" style={{ color: '#b45309' }}>
              ⚠ Needs a day or week ({schedule.flagged.length})
            </h3>
            <p className="text-xs text-[var(--ink-3)] mt-0.5">These active groups are missing schedule details. Click one to fix it.</p>
          </div>
          <ul className="divide-y divide-[var(--ink)]/6">
            {schedule.flagged.map(({ group, reason }) => (
              <li key={group.id} className="px-5 py-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5">
                <button
                  type="button"
                  onClick={() => onEdit(group)}
                  className="text-sm font-medium text-[var(--ink)] hover:text-[var(--accent-text)] transition-colors text-left"
                >
                  {group.group_name}
                </button>
                <span className="text-xs" style={{ color: '#b45309' }}>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {schedule.inactiveCount > 0 && (
        <p className="text-xs text-[var(--ink-3)]">
          {schedule.inactiveCount} inactive group{schedule.inactiveCount === 1 ? '' : 's'} not shown.
        </p>
      )}
    </div>
  )
}
