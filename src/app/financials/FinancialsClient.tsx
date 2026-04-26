'use client'

import { useState, useTransition } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { createSnapshot, updateSnapshot, deleteSnapshot } from '@/app/actions/financials'
import type { StudioSnapshot } from '@/types/database'

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtCur(v: number | null): string {
  if (v == null) return '—'
  const abs = Math.abs(Math.round(v))
  return (v < 0 ? '−$' : '$') + abs.toLocaleString('en-US')
}

function fmtInt(v: number | null): string {
  if (v == null) return '—'
  return Math.round(v).toLocaleString('en-US')
}

function fmtPct(num: number | null, den: number | null): string {
  if (num == null || !den) return '—'
  return ((num / den) * 100).toFixed(1) + '%'
}

function fmtDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function fmtChartDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  })
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// ─── form types ───────────────────────────────────────────────────────────────

type FormState = {
  snapshot_date: string
  enrollment: string
  booked_hrs: string
  goal_hrs: string
  avail_hrs: string
  leads: string
  consults: string
  poss_reg: string
  new_enrollments: string
  disenrollments: string
  est_revenue: string
  collected_revenue: string
  expenses: string
}

function blankForm(): FormState {
  return {
    snapshot_date: today(),
    enrollment: '', booked_hrs: '', goal_hrs: '', avail_hrs: '',
    leads: '', consults: '', poss_reg: '', new_enrollments: '', disenrollments: '',
    est_revenue: '', collected_revenue: '', expenses: '',
  }
}

function snapshotToForm(s: StudioSnapshot): FormState {
  const n = (v: number | null) => v != null ? String(v) : ''
  return {
    snapshot_date: s.snapshot_date,
    enrollment: n(s.enrollment), booked_hrs: n(s.booked_hrs),
    goal_hrs: n(s.goal_hrs), avail_hrs: n(s.avail_hrs),
    leads: n(s.leads), consults: n(s.consults), poss_reg: n(s.poss_reg),
    new_enrollments: n(s.new_enrollments), disenrollments: n(s.disenrollments),
    est_revenue: n(s.est_revenue), collected_revenue: n(s.collected_revenue),
    expenses: n(s.expenses),
  }
}

function parseForm(f: FormState): Omit<StudioSnapshot, 'id' | 'studio_id' | 'created_at'> {
  const ni = (s: string) => s.trim() === '' ? null : parseInt(s, 10)
  const nf = (s: string) => s.trim() === '' ? null : parseFloat(s)
  return {
    snapshot_date: f.snapshot_date,
    enrollment: ni(f.enrollment),
    booked_hrs: nf(f.booked_hrs),
    goal_hrs: nf(f.goal_hrs),
    avail_hrs: nf(f.avail_hrs),
    leads: ni(f.leads),
    consults: ni(f.consults),
    poss_reg: ni(f.poss_reg),
    new_enrollments: ni(f.new_enrollments),
    disenrollments: ni(f.disenrollments),
    est_revenue: nf(f.est_revenue),
    collected_revenue: nf(f.collected_revenue),
    expenses: nf(f.expenses),
  }
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function SnapshotModal({
  snapshot,
  onClose,
  onCreated,
  onUpdated,
}: {
  snapshot: StudioSnapshot | null
  onClose: () => void
  onCreated: (s: StudioSnapshot) => void
  onUpdated: (s: StudioSnapshot) => void
}) {
  const [form, setForm] = useState<FormState>(() =>
    snapshot ? snapshotToForm(snapshot) : blankForm()
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function set(field: keyof FormState, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const data = parseForm(form)
    startTransition(async () => {
      if (snapshot) {
        const res = await updateSnapshot(snapshot.id, data)
        if (res.error) { setError(res.error); return }
        onUpdated({ ...snapshot, ...data })
      } else {
        const res = await createSnapshot(data)
        if (res.error) { setError(res.error); return }
        if (res.data) onCreated(res.data)
      }
      onClose()
    })
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]'
  const labelCls = 'block text-xs text-[var(--ink-3)] mb-1'

  function Field({ label, field, type = 'number', placeholder = '' }: {
    label: string; field: keyof FormState; type?: string; placeholder?: string
  }) {
    return (
      <div>
        <label className={labelCls}>{label}</label>
        <input
          type={type}
          step={type === 'number' ? 'any' : undefined}
          min={type === 'number' ? '0' : undefined}
          value={form[field]}
          onChange={e => set(field, e.target.value)}
          placeholder={placeholder}
          className={inputCls}
        />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8 overflow-y-auto">
      <div className="w-full max-w-lg bg-[var(--surface)] rounded-2xl border border-[var(--ink)]/8 p-6 my-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-medium text-[var(--ink)]">
            {snapshot ? 'Edit Snapshot' : 'Log Snapshot'}
          </h3>
          <button onClick={onClose} className="text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className={labelCls}>Snapshot Date *</label>
            <input
              type="date"
              required
              value={form.snapshot_date}
              onChange={e => set('snapshot_date', e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-3)] mb-2 pb-1.5 border-b border-[var(--ink)]/8">
              Enrollment
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Enrollment" field="enrollment" placeholder="32" />
              <Field label="Booked Hrs" field="booked_hrs" placeholder="64" />
              <Field label="Goal Hrs" field="goal_hrs" placeholder="80" />
              <Field label="Avail Hrs" field="avail_hrs" placeholder="90" />
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-3)] mb-2 pb-1.5 border-b border-[var(--ink)]/8">
              Pipeline
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Leads" field="leads" placeholder="12" />
              <Field label="Consults" field="consults" placeholder="5" />
              <Field label="Poss. Reg." field="poss_reg" placeholder="3" />
              <Field label="New Enrollments" field="new_enrollments" placeholder="2" />
              <Field label="Disenrollments" field="disenrollments" placeholder="1" />
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-3)] mb-2 pb-1.5 border-b border-[var(--ink)]/8">
              Revenue
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Est. Revenue ($)" field="est_revenue" placeholder="4500" />
              <Field label="Collected Revenue ($)" field="collected_revenue" placeholder="4200" />
              <Field label="Expenses ($)" field="expenses" placeholder="800" />
            </div>
          </div>

          {error && (
            <p className="text-xs text-[var(--red)] bg-[var(--red-l)] px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ink)]/8">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--ink)] text-sm font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              {isPending ? 'Saving…' : snapshot ? 'Save changes' : 'Log snapshot'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Chart wrapper ────────────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 p-5">
      <p className="text-sm font-medium text-[var(--ink)] mb-4">{title}</p>
      {children}
    </div>
  )
}

const axisStyle = { fontSize: 11, fill: 'rgba(0,0,0,0.4)' }
const gridStyle = { stroke: 'rgba(0,0,0,0.06)' }

function curFmt(value: number) {
  return '$' + Math.round(value).toLocaleString('en-US')
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function FinancialsClient({ initialSnapshots }: { initialSnapshots: StudioSnapshot[] }) {
  const [snapshots, setSnapshots] = useState<StudioSnapshot[]>(initialSnapshots)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingSnapshot, setEditingSnapshot] = useState<StudioSnapshot | null>(null)
  const [deleting, startDeleteTransition] = useTransition()

  const recent = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null

  const chartData = snapshots.map(s => ({
    date: fmtChartDate(s.snapshot_date),
    enrollment: s.enrollment,
    collected_revenue: s.collected_revenue,
    expenses: s.expenses,
    leads: s.leads,
    consults: s.consults,
    new_enrollments: s.new_enrollments,
  }))

  function openCreate() {
    setEditingSnapshot(null)
    setModalOpen(true)
  }

  function openEdit(s: StudioSnapshot) {
    setEditingSnapshot(s)
    setModalOpen(true)
  }

  function handleCreated(s: StudioSnapshot) {
    setSnapshots(prev => [...prev, s].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)))
  }

  function handleUpdated(s: StudioSnapshot) {
    setSnapshots(prev => prev.map(x => x.id === s.id ? s : x))
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this snapshot? This cannot be undone.')) return
    setSnapshots(prev => prev.filter(x => x.id !== id))
    startDeleteTransition(async () => {
      await deleteSnapshot(id)
    })
  }

  const summaryCards = [
    { label: 'Current Enrollment', value: fmtInt(recent?.enrollment ?? null) },
    { label: 'Collected Revenue', value: fmtCur(recent?.collected_revenue ?? null), color: recent?.collected_revenue != null ? 'var(--green)' : undefined },
    {
      label: 'Profit',
      value: recent?.collected_revenue != null || recent?.expenses != null
        ? fmtCur((recent?.collected_revenue ?? 0) - (recent?.expenses ?? 0))
        : '—',
      color: recent != null
        ? ((recent.collected_revenue ?? 0) - (recent.expenses ?? 0)) >= 0
          ? 'var(--green)' : 'var(--red)'
        : undefined,
    },
    { label: 'Utilization', value: fmtPct(recent?.booked_hrs ?? null, recent?.avail_hrs ?? null) },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
            Studio Financials
          </h2>
          <p className="text-sm text-[var(--ink-3)] mt-0.5">Track your studio's growth over time</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-medium hover:opacity-90 transition-opacity"
          style={{ background: '#04ADEF' }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Log Snapshot
        </button>
      </div>

      {snapshots.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center bg-[var(--surface)] rounded-2xl border border-[var(--ink)]/8">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(4,173,239,0.12)' }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
              <path d="M11 2v18M2 11h18" stroke="#04ADEF" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="text-base font-medium text-[var(--ink)]">No snapshots yet</p>
            <p className="text-sm text-[var(--ink-3)] mt-1 max-w-xs">
              Log your first snapshot to start tracking your studio's growth.
            </p>
          </div>
          <button
            onClick={openCreate}
            className="mt-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium hover:opacity-90 transition-opacity"
            style={{ background: '#04ADEF' }}
          >
            Log First Snapshot
          </button>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {summaryCards.map(({ label, value, color }) => (
              <div key={label} className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 px-5 py-4">
                <p className="text-xs text-[var(--ink-3)] mb-2 uppercase tracking-wide font-medium">{label}</p>
                <p className="text-3xl leading-none" style={{ fontFamily: 'var(--font-heading)', color: color || 'var(--ink)' }}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* Charts — only show with 2+ points */}
          {chartData.length >= 2 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Enrollment over time */}
              <ChartCard title="Enrollment Over Time">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" {...gridStyle} />
                    <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} />
                    <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={36} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)', background: '#fff' }}
                      labelStyle={{ fontWeight: 600 }}
                    />
                    <Line type="monotone" dataKey="enrollment" name="Enrollment" stroke="#04ADEF" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Revenue vs Expenses */}
              <ChartCard title="Revenue vs Expenses">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" {...gridStyle} />
                    <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} />
                    <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={48} tickFormatter={v => '$' + (v >= 1000 ? Math.round(v / 1000) + 'k' : v)} />
                    <Tooltip
                      formatter={(v) => curFmt(v as number)}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)', background: '#fff' }}
                      labelStyle={{ fontWeight: 600 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="collected_revenue" name="Collected Revenue" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Pipeline */}
              <ChartCard title="Pipeline">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" {...gridStyle} />
                    <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} />
                    <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={28} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)', background: '#fff' }}
                      labelStyle={{ fontWeight: 600 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="leads" name="Leads" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="consults" name="Consults" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="new_enrollments" name="New Enrollments" stroke="#04ADEF" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          ) : (
            <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 px-5 py-6 text-center text-sm text-[var(--ink-3)]">
              Add at least 2 snapshots to see charts.
            </div>
          )}

          {/* Snapshots table */}
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--ink)]/8">
                    {['Date', 'Enrollment', 'Collected Revenue', 'Expenses', 'Profit', 'Util %', '', ''].map((h, i) => (
                      <th
                        key={i}
                        className={`py-3 text-xs font-medium uppercase tracking-wide text-[var(--ink-3)] whitespace-nowrap ${i === 0 ? 'px-4 text-left' : i >= 6 ? 'px-2 text-right w-8' : 'px-4 text-right'}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ink)]/6">
                  {[...snapshots].reverse().map(s => {
                    const profit = (s.collected_revenue ?? 0) - (s.expenses ?? 0)
                    const hasFinancials = s.collected_revenue != null || s.expenses != null
                    return (
                      <tr key={s.id} className="hover:bg-[var(--canvas)] transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-[var(--ink)] whitespace-nowrap">{fmtDate(s.snapshot_date)}</td>
                        <td className="px-4 py-3 text-sm text-right text-[var(--ink-2)]">{fmtInt(s.enrollment)}</td>
                        <td className="px-4 py-3 text-sm text-right text-[var(--ink-2)]">{fmtCur(s.collected_revenue)}</td>
                        <td className="px-4 py-3 text-sm text-right text-[var(--ink-2)]">{fmtCur(s.expenses)}</td>
                        <td className="px-4 py-3 text-sm text-right font-medium" style={{ color: hasFinancials ? (profit >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--ink-3)' }}>
                          {hasFinancials ? fmtCur(profit) : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-[var(--ink-2)]">
                          {fmtPct(s.booked_hrs, s.avail_hrs)}
                        </td>
                        <td className="px-2 py-3 text-right">
                          <button
                            onClick={() => openEdit(s)}
                            title="Edit"
                            className="p-1.5 rounded-lg transition-colors"
                            style={{ color: '#04ADEF' }}
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                              <path d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </td>
                        <td className="px-2 py-3 text-right">
                          <button
                            onClick={() => handleDelete(s.id)}
                            disabled={deleting}
                            title="Delete"
                            className="p-1.5 rounded-lg text-[var(--ink-3)] hover:text-[var(--red)] transition-colors disabled:opacity-40"
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                              <path d="M2 3.5h10M5 3.5V2h4v1.5M5.5 6v4.5M8.5 6v4.5M3 3.5l.8 8h6.4l.8-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal */}
      {modalOpen && (
        <SnapshotModal
          snapshot={editingSnapshot}
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  )
}
