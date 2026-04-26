'use client'

import { useState, useTransition } from 'react'
import { upsertMonth } from '@/app/actions/financials'
import type { FinancialMonth } from '@/types/database'

const YEARS = [2024, 2025, 2026, 2027]
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
type TabKey = 'metrics' | 'pipeline' | 'financials'
type EditableField = keyof Pick<FinancialMonth,
  'enrollment' | 'booked_hrs' | 'goal_hrs' | 'avail_hrs' |
  'leads' | 'consults' | 'poss_reg' | 'new_enrollments' | 'disenrollments' |
  'est_revenue' | 'collected_revenue' | 'expenses'
>
type MonthRow = Partial<FinancialMonth> | null

// ─── formatters ──────────────────────────────────────────────────────────────

function fmtInt(v: number | null): string {
  if (v == null) return '—'
  return Math.round(v).toLocaleString('en-US')
}

function fmtNum(v: number | null, dec = 1): string {
  if (v == null) return '—'
  return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function fmtCur(v: number | null): string {
  if (v == null) return '—'
  const abs = Math.abs(Math.round(v))
  return (v < 0 ? '−$' : '$') + abs.toLocaleString('en-US')
}

function fmtPct(num: number | null, den: number | null): string {
  if (num == null || !den) return '—'
  return ((num / den) * 100).toFixed(1) + '%'
}

function pctVal(num: number | null, den: number | null): number | null {
  if (num == null || !den) return null
  return (num / den) * 100
}

function trafficColor(pct: number | null, lo: number, hi: number, invert = false): string {
  if (pct == null) return 'var(--ink-3)'
  const good = pct >= hi
  const mid = pct >= lo
  if (invert) return good ? 'var(--red)' : mid ? 'var(--amber)' : 'var(--green)'
  return good ? 'var(--green)' : mid ? 'var(--amber)' : 'var(--red)'
}

// ─── summary ─────────────────────────────────────────────────────────────────

function computeSummary(rows: MonthRow[]) {
  let enrollSum = 0, enrollN = 0
  let collected = 0, expenses = 0, estRev = 0
  let leads = 0, consults = 0, newEnroll = 0, disenroll = 0
  let bookedHrs = 0, availHrs = 0, goalHrs = 0
  let hasCollected = false, hasExpenses = false

  for (const r of rows) {
    if (!r) continue
    if (r.enrollment != null) { enrollSum += r.enrollment; enrollN++ }
    if (r.collected_revenue != null) { collected += r.collected_revenue; hasCollected = true }
    if (r.expenses != null) { expenses += r.expenses; hasExpenses = true }
    if (r.est_revenue != null) estRev += r.est_revenue
    if (r.leads != null) leads += r.leads
    if (r.consults != null) consults += r.consults
    if (r.new_enrollments != null) newEnroll += r.new_enrollments
    if (r.disenrollments != null) disenroll += r.disenrollments
    if (r.booked_hrs != null) bookedHrs += r.booked_hrs
    if (r.avail_hrs != null) availHrs += r.avail_hrs
    if (r.goal_hrs != null) goalHrs += r.goal_hrs
  }

  const avgEnroll = enrollN > 0 ? enrollSum / enrollN : null
  const profit = (hasCollected || hasExpenses) ? collected - expenses : null
  const estNet = profit != null ? profit * 0.70 : null

  return {
    avgEnroll,
    totalCollected: hasCollected ? collected : null,
    totalExpenses: hasExpenses ? expenses : null,
    totalEstRev: estRev > 0 ? estRev : null,
    profit,
    estNet,
    leads,
    consults,
    newEnroll,
    disenroll,
    bookedHrs: bookedHrs > 0 ? bookedHrs : null,
    availHrs: availHrs > 0 ? availHrs : null,
    goalHrs: goalHrs > 0 ? goalHrs : null,
  }
}

// ─── EditableCell ─────────────────────────────────────────────────────────────

function EditableCell({
  value,
  type = 'int',
  readOnly = false,
  color,
  onSave,
}: {
  value: number | null
  type?: 'int' | 'numeric' | 'currency'
  readOnly?: boolean
  color?: string
  onSave?: (v: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState('')

  const display =
    type === 'currency' ? fmtCur(value) :
    type === 'numeric'  ? fmtNum(value) :
    fmtInt(value)

  function startEdit() {
    if (readOnly) return
    setRaw(value != null ? String(value) : '')
    setEditing(true)
  }

  function commit() {
    setEditing(false)
    const t = raw.trim()
    if (t === '') { onSave?.(null); return }
    const parsed = type === 'int' ? parseInt(t, 10) : parseFloat(t)
    onSave?.(isNaN(parsed) ? null : parsed)
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        step={type === 'int' ? '1' : '0.1'}
        value={raw}
        onChange={e => setRaw(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit() }}
        className="w-full px-1.5 py-0.5 text-sm text-right rounded border border-[var(--accent)] bg-white text-[var(--ink)] focus:outline-none"
      />
    )
  }

  return (
    <div
      onClick={startEdit}
      style={{ color: color || (value == null ? 'var(--ink-3)' : undefined) }}
      className={[
        'px-1.5 py-0.5 text-sm text-right rounded select-none',
        readOnly
          ? 'cursor-default text-[var(--ink-2)]'
          : 'cursor-pointer hover:bg-[var(--surface-2)] text-[var(--ink-2)]',
      ].join(' ')}
    >
      {display}
    </div>
  )
}

function ReadCell({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div className="px-1.5 py-0.5 text-sm text-right" style={{ color: color || 'var(--ink-3)' }}>
      {children}
    </div>
  )
}

// ─── Table helpers ────────────────────────────────────────────────────────────

function Th({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <th className={`py-3 text-xs font-medium uppercase tracking-wide text-[var(--ink-3)] whitespace-nowrap ${first ? 'px-4 text-left' : 'px-2 text-right'}`}>
      {children}
    </th>
  )
}

function MonthTd({ label }: { label: string }) {
  return (
    <td className="px-4 py-2 text-sm font-medium text-[var(--ink-2)] whitespace-nowrap">{label}</td>
  )
}

function SummaryTd({ children, first, color }: { children: React.ReactNode; first?: boolean; color?: string }) {
  return (
    <td
      className={`py-2.5 text-sm font-medium ${first ? 'px-4 text-left text-[var(--ink-3)]' : 'px-2 text-right'}`}
      style={{ color: color || undefined }}
    >
      {children}
    </td>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FinancialsClient({
  initialData,
}: {
  initialData: Record<number, Record<number, FinancialMonth>>
}) {
  const currentYear = new Date().getFullYear()
  const defaultYear = YEARS.includes(currentYear) ? currentYear : YEARS[1]

  const [activeYear, setActiveYear] = useState(defaultYear)
  const [activeTab, setActiveTab] = useState<TabKey>('metrics')
  const [localData, setLocalData] = useState<Record<number, MonthRow[]>>(() => {
    const out: Record<number, MonthRow[]> = {}
    for (const year of YEARS) {
      out[year] = Array.from({ length: 12 }, (_, i) => {
        const m = initialData[year]?.[i + 1]
        return m ? { ...m } : null
      })
    }
    return out
  })
  const [, startTransition] = useTransition()

  const yearRows = localData[activeYear]
  const summary = computeSummary(yearRows)

  function handleSave(monthIdx: number, field: EditableField, value: number | null) {
    const existing = yearRows[monthIdx]
    if (value === null && !existing?.id) return

    setLocalData(prev => {
      const copy = [...prev[activeYear]]
      copy[monthIdx] = { ...(copy[monthIdx] ?? {}), [field]: value }
      return { ...prev, [activeYear]: copy }
    })

    startTransition(async () => {
      await upsertMonth(activeYear, monthIdx + 1, { [field]: value })
    })
  }

  function cell(i: number, field: EditableField, type: 'int' | 'numeric' | 'currency' = 'int') {
    return {
      value: (yearRows[i]?.[field] ?? null) as number | null,
      type,
      onSave: (v: number | null) => handleSave(i, field, v),
    }
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'metrics', label: 'Studio Metrics' },
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'financials', label: 'Financials' },
  ]

  const summaryCards = [
    {
      label: 'Avg Enrollment',
      value: summary.avgEnroll != null ? fmtInt(Math.round(summary.avgEnroll)) : '—',
      color: 'var(--ink)',
    },
    {
      label: 'Collected Revenue',
      value: fmtCur(summary.totalCollected),
      color: summary.totalCollected != null ? 'var(--green)' : 'var(--ink-3)',
    },
    {
      label: 'Total Profit',
      value: fmtCur(summary.profit),
      color: summary.profit == null ? 'var(--ink-3)' : summary.profit >= 0 ? 'var(--green)' : 'var(--red)',
    },
    {
      label: 'Est. Net Income',
      value: fmtCur(summary.estNet),
      color: summary.estNet == null ? 'var(--ink-3)' : summary.estNet >= 0 ? 'var(--ink)' : 'var(--red)',
    },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
            Financials
          </h2>
          <p className="text-sm text-[var(--ink-3)] mt-0.5">Click any cell to edit</p>
        </div>
        <div className="flex items-center gap-1 bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 p-1">
          {YEARS.map(year => (
            <button
              key={year}
              onClick={() => setActiveYear(year)}
              className={[
                'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
                activeYear === year
                  ? 'bg-[var(--canvas)] text-[var(--ink)] shadow-sm border border-[var(--ink)]/8'
                  : 'text-[var(--ink-3)] hover:text-[var(--ink)]',
              ].join(' ')}
            >
              {year}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map(({ label, value, color }) => (
          <div key={label} className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 px-5 py-4">
            <p className="text-xs text-[var(--ink-3)] mb-2 uppercase tracking-wide font-medium">{label}</p>
            <p className="text-3xl leading-none" style={{ fontFamily: 'var(--font-heading)', color }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Tab selector */}
      <div className="flex items-center gap-1 border-b border-[var(--ink)]/8">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={[
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
              activeTab === key
                ? 'text-[var(--ink)] border-[var(--accent-text)]'
                : 'text-[var(--ink-3)] border-transparent hover:text-[var(--ink-2)]',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
        <div className="overflow-x-auto">

          {/* ── Studio Metrics ── */}
          {activeTab === 'metrics' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ink)]/8">
                  <Th first>Month</Th>
                  <Th>Enrollment</Th>
                  <Th>Booked Hrs</Th>
                  <Th>Goal Hrs</Th>
                  <Th>Avail Hrs</Th>
                  <Th>Util %</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ink)]/6">
                {MONTH_NAMES.map((name, i) => {
                  const r = yearRows[i]
                  const util = pctVal(r?.booked_hrs ?? null, r?.avail_hrs ?? null)
                  return (
                    <tr key={i} className="hover:bg-[var(--canvas)] transition-colors">
                      <MonthTd label={name} />
                      <td className="px-2 py-1"><EditableCell {...cell(i, 'enrollment', 'int')} /></td>
                      <td className="px-2 py-1"><EditableCell {...cell(i, 'booked_hrs', 'numeric')} /></td>
                      <td className="px-2 py-1"><EditableCell {...cell(i, 'goal_hrs', 'numeric')} /></td>
                      <td className="px-2 py-1"><EditableCell {...cell(i, 'avail_hrs', 'numeric')} /></td>
                      <td className="px-2 py-1">
                        <ReadCell color={trafficColor(util, 40, 70)}>
                          {util != null ? util.toFixed(1) + '%' : '—'}
                        </ReadCell>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--ink)]/12 bg-[var(--surface)]">
                  <SummaryTd first>Annual</SummaryTd>
                  <SummaryTd>{summary.avgEnroll != null ? fmtInt(Math.round(summary.avgEnroll)) : '—'}</SummaryTd>
                  <SummaryTd>{fmtNum(summary.bookedHrs)}</SummaryTd>
                  <SummaryTd>{fmtNum(summary.goalHrs)}</SummaryTd>
                  <SummaryTd>{fmtNum(summary.availHrs)}</SummaryTd>
                  <SummaryTd color={trafficColor(pctVal(summary.bookedHrs, summary.availHrs), 40, 70)}>
                    {fmtPct(summary.bookedHrs, summary.availHrs)}
                  </SummaryTd>
                </tr>
              </tfoot>
            </table>
          )}

          {/* ── Pipeline ── */}
          {activeTab === 'pipeline' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ink)]/8">
                  <Th first>Month</Th>
                  <Th>Leads</Th>
                  <Th>Consults</Th>
                  <Th>Poss. Reg.</Th>
                  <Th>New Enroll</Th>
                  <Th>Disenroll</Th>
                  <Th>Close %</Th>
                  <Th>Consult Close %</Th>
                  <Th>Attrition %</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ink)]/6">
                {MONTH_NAMES.map((name, i) => {
                  const r = yearRows[i]
                  const closePct = pctVal(r?.new_enrollments ?? null, r?.leads ?? null)
                  const consultPct = pctVal(r?.new_enrollments ?? null, r?.consults ?? null)
                  const attritionPct = pctVal(r?.disenrollments ?? null, r?.enrollment ?? null)
                  return (
                    <tr key={i} className="hover:bg-[var(--canvas)] transition-colors">
                      <MonthTd label={name} />
                      <td className="px-2 py-1"><EditableCell {...cell(i, 'leads', 'int')} /></td>
                      <td className="px-2 py-1"><EditableCell {...cell(i, 'consults', 'int')} /></td>
                      <td className="px-2 py-1"><EditableCell {...cell(i, 'poss_reg', 'int')} /></td>
                      <td className="px-2 py-1"><EditableCell {...cell(i, 'new_enrollments', 'int')} /></td>
                      <td className="px-2 py-1"><EditableCell {...cell(i, 'disenrollments', 'int')} /></td>
                      <td className="px-2 py-1">
                        <ReadCell color={trafficColor(closePct, 25, 50)}>
                          {closePct != null ? closePct.toFixed(1) + '%' : '—'}
                        </ReadCell>
                      </td>
                      <td className="px-2 py-1">
                        <ReadCell color={trafficColor(consultPct, 40, 65)}>
                          {consultPct != null ? consultPct.toFixed(1) + '%' : '—'}
                        </ReadCell>
                      </td>
                      <td className="px-2 py-1">
                        <ReadCell color={trafficColor(attritionPct, 5, 10, true)}>
                          {attritionPct != null ? attritionPct.toFixed(1) + '%' : '—'}
                        </ReadCell>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--ink)]/12 bg-[var(--surface)]">
                  <SummaryTd first>Annual</SummaryTd>
                  <SummaryTd>{summary.leads > 0 ? fmtInt(summary.leads) : '—'}</SummaryTd>
                  <SummaryTd>{summary.consults > 0 ? fmtInt(summary.consults) : '—'}</SummaryTd>
                  <SummaryTd>—</SummaryTd>
                  <SummaryTd>{summary.newEnroll > 0 ? fmtInt(summary.newEnroll) : '—'}</SummaryTd>
                  <SummaryTd>{summary.disenroll > 0 ? fmtInt(summary.disenroll) : '—'}</SummaryTd>
                  <SummaryTd color={trafficColor(pctVal(summary.newEnroll > 0 ? summary.newEnroll : null, summary.leads > 0 ? summary.leads : null), 25, 50)}>
                    {fmtPct(summary.newEnroll > 0 ? summary.newEnroll : null, summary.leads > 0 ? summary.leads : null)}
                  </SummaryTd>
                  <SummaryTd color={trafficColor(pctVal(summary.newEnroll > 0 ? summary.newEnroll : null, summary.consults > 0 ? summary.consults : null), 40, 65)}>
                    {fmtPct(summary.newEnroll > 0 ? summary.newEnroll : null, summary.consults > 0 ? summary.consults : null)}
                  </SummaryTd>
                  <SummaryTd color={trafficColor(pctVal(summary.disenroll > 0 ? summary.disenroll : null, summary.avgEnroll ?? null), 5, 10, true)}>
                    {fmtPct(summary.disenroll > 0 ? summary.disenroll : null, summary.avgEnroll ?? null)}
                  </SummaryTd>
                </tr>
              </tfoot>
            </table>
          )}

          {/* ── Financials ── */}
          {activeTab === 'financials' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ink)]/8">
                  <Th first>Month</Th>
                  <Th>Est. Revenue</Th>
                  <Th>Collected Revenue</Th>
                  <Th>Expenses</Th>
                  <Th>Profit</Th>
                  <Th>Est. 30% Tax</Th>
                  <Th>Est. Net Income</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ink)]/6">
                {MONTH_NAMES.map((name, i) => {
                  const r = yearRows[i]
                  const profit = r?.collected_revenue != null || r?.expenses != null
                    ? (r?.collected_revenue ?? 0) - (r?.expenses ?? 0)
                    : null
                  const tax = profit != null ? profit * 0.30 : null
                  const net = profit != null ? profit * 0.70 : null
                  return (
                    <tr key={i} className="hover:bg-[var(--canvas)] transition-colors">
                      <MonthTd label={name} />
                      <td className="px-2 py-1"><EditableCell {...cell(i, 'est_revenue', 'currency')} /></td>
                      <td className="px-2 py-1"><EditableCell {...cell(i, 'collected_revenue', 'currency')} /></td>
                      <td className="px-2 py-1"><EditableCell {...cell(i, 'expenses', 'currency')} /></td>
                      <td className="px-2 py-1">
                        <ReadCell color={profit == null ? 'var(--ink-3)' : profit >= 0 ? 'var(--green)' : 'var(--red)'}>
                          {fmtCur(profit)}
                        </ReadCell>
                      </td>
                      <td className="px-2 py-1">
                        <ReadCell color="var(--ink-3)">{fmtCur(tax)}</ReadCell>
                      </td>
                      <td className="px-2 py-1">
                        <ReadCell color={net == null ? 'var(--ink-3)' : net >= 0 ? 'var(--ink)' : 'var(--red)'}>
                          {fmtCur(net)}
                        </ReadCell>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                {(() => {
                  const tax = summary.profit != null ? summary.profit * 0.30 : null
                  return (
                    <tr className="border-t-2 border-[var(--ink)]/12 bg-[var(--surface)]">
                      <SummaryTd first>Annual</SummaryTd>
                      <SummaryTd>{fmtCur(summary.totalEstRev)}</SummaryTd>
                      <SummaryTd color={summary.totalCollected != null ? 'var(--green)' : undefined}>
                        {fmtCur(summary.totalCollected)}
                      </SummaryTd>
                      <SummaryTd>{fmtCur(summary.totalExpenses)}</SummaryTd>
                      <SummaryTd color={summary.profit == null ? undefined : summary.profit >= 0 ? 'var(--green)' : 'var(--red)'}>
                        {fmtCur(summary.profit)}
                      </SummaryTd>
                      <SummaryTd>{fmtCur(tax)}</SummaryTd>
                      <SummaryTd color={summary.estNet == null ? undefined : summary.estNet >= 0 ? 'var(--ink)' : 'var(--red)'}>
                        {fmtCur(summary.estNet)}
                      </SummaryTd>
                    </tr>
                  )
                })()}
              </tfoot>
            </table>
          )}

        </div>
      </div>
    </div>
  )
}
