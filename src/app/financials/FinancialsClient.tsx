'use client'

import { useState, useTransition } from 'react'
import { upsertFinancialMonth } from '@/app/actions/financials'
import type { FinancialMonth } from '@/types/database'

interface FinancialsClientProps {
  months: FinancialMonth[]
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-')
  const date = new Date(Number(year), Number(m) - 1, 1)
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function CurrencyCell({
  month,
  field,
  initialValue,
}: {
  month: string
  field: 'revenue' | 'expenses'
  initialValue: number | null
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(
    initialValue != null ? (initialValue / 100).toString() : ''
  )
  const [isPending, startTransition] = useTransition()

  function handleBlur() {
    setEditing(false)
    startTransition(async () => {
      await upsertFinancialMonth(month, field, value)
    })
  }

  const displayVal = value
    ? `$${parseFloat(value || '0').toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : '—'

  if (editing) {
    return (
      <input
        type="number"
        step="0.01"
        min="0"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => { if (e.key === 'Enter') handleBlur() }}
        className="w-full px-2 py-1 rounded bg-[var(--canvas)] border border-[var(--accent-text)] text-sm text-[var(--ink)] text-right focus:outline-none"
        placeholder="0"
      />
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      disabled={isPending}
      className={`w-full text-right text-sm px-2 py-1 rounded hover:bg-white/6 transition-colors ${isPending ? 'opacity-50' : ''} ${value ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]'}`}
    >
      {displayVal}
    </button>
  )
}

function NotesCell({ month, initialValue }: { month: string; initialValue: string | null }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialValue ?? '')
  const [isPending, startTransition] = useTransition()

  function handleBlur() {
    setEditing(false)
    startTransition(async () => {
      await upsertFinancialMonth(month, 'notes', value)
    })
  }

  if (editing) {
    return (
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => { if (e.key === 'Enter') handleBlur() }}
        className="w-full px-2 py-1 rounded bg-[var(--canvas)] border border-[var(--accent-text)] text-sm text-[var(--ink)] focus:outline-none"
        placeholder="Notes…"
      />
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      disabled={isPending}
      className={`w-full text-left text-sm px-2 py-1 rounded hover:bg-white/6 transition-colors truncate ${value ? 'text-[var(--ink-2)]' : 'text-[var(--ink-3)]'}`}
    >
      {value || 'Add note…'}
    </button>
  )
}

export default function FinancialsClient({ months }: FinancialsClientProps) {
  const totalRevenue = months.reduce((sum, m) => sum + (m.revenue ?? 0), 0) / 100
  const totalExpenses = months.reduce((sum, m) => sum + (m.expenses ?? 0), 0) / 100
  const totalNet = totalRevenue - totalExpenses

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
          Financials
        </h2>
        <p className="text-sm text-[var(--ink-3)] mt-0.5">Last 12 months — click any cell to edit</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Revenue', value: `$${totalRevenue.toLocaleString()}`, color: 'text-[var(--green)]' },
          { label: 'Total Expenses', value: `$${totalExpenses.toLocaleString()}`, color: 'text-[var(--amber)]' },
          { label: 'Net', value: `$${totalNet.toLocaleString()}`, color: totalNet >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 px-5 py-4">
            <p className="text-xs text-[var(--ink-3)] mb-2 uppercase tracking-wide font-medium">{label}</p>
            <p className={`text-3xl leading-none ${color}`} style={{ fontFamily: 'var(--font-heading)' }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--ink)]/8">
              <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Month</th>
              <th className="text-right px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide w-32">Revenue</th>
              <th className="text-right px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide w-32">Expenses</th>
              <th className="text-right px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide w-24">Net</th>
              <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ink)]/6">
            {months.map((m) => {
              const rev = m.revenue != null ? m.revenue / 100 : null
              const exp = m.expenses != null ? m.expenses / 100 : null
              const net = rev != null && exp != null ? rev - exp : null
              return (
                <tr key={m.month} className="hover:bg-[var(--canvas)] transition-colors">
                  <td className="px-5 py-2.5 text-[var(--ink-2)] font-medium">
                    {formatMonthLabel(m.month)}
                  </td>
                  <td className="px-3 py-1.5 w-32">
                    <CurrencyCell month={m.month} field="revenue" initialValue={m.revenue} />
                  </td>
                  <td className="px-3 py-1.5 w-32">
                    <CurrencyCell month={m.month} field="expenses" initialValue={m.expenses} />
                  </td>
                  <td className={`px-5 py-2.5 text-right text-sm font-medium ${net != null ? (net >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]') : 'text-[var(--ink-3)]'}`}>
                    {net != null ? `$${net.toLocaleString()}` : '—'}
                  </td>
                  <td className="px-3 py-1.5">
                    <NotesCell month={m.month} initialValue={m.notes} />
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--ink)]/15">
              <td className="px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">12-month totals</td>
              <td className="px-5 py-3 text-right text-sm font-medium text-[var(--green)]">
                ${totalRevenue.toLocaleString()}
              </td>
              <td className="px-5 py-3 text-right text-sm font-medium text-[var(--amber)]">
                ${totalExpenses.toLocaleString()}
              </td>
              <td className={`px-5 py-3 text-right text-sm font-medium ${totalNet >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                ${totalNet.toLocaleString()}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
