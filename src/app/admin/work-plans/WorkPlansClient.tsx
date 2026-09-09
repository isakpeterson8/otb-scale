'use client'

import Link from 'next/link'
import { useState } from 'react'
import { formatDate } from '@/lib/utils'
import { completionPercent } from '@/lib/work-plans'
import type { WorkPlanStatus } from '@/types/database'

export interface WorkPlanRow {
  id: string
  title: string
  status: WorkPlanStatus
  is_published: boolean
  updated_at: string
  studio_name: string
  total_tasks: number
  done_tasks: number
}

const STATUS_FILTERS: { value: WorkPlanStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
]

export default function WorkPlansClient({
  plans,
  loadError,
}: {
  plans: WorkPlanRow[]
  loadError: string | null
}) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<WorkPlanStatus | 'all'>('all')

  const q = search.trim().toLowerCase()
  const filtered = plans.filter(p => {
    const matchesSearch =
      q === '' || p.studio_name.toLowerCase().includes(q) || p.title.toLowerCase().includes(q)
    return matchesSearch && (status === 'all' || p.status === status)
  })

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
            Work Plans
          </h2>
          <p className="text-sm text-[var(--ink-3)] mt-0.5">
            {plans.length} plan{plans.length === 1 ? '' : 's'} · staff only, clients cannot see these yet
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/admin/work-plans/templates"
            className="px-4 py-2 rounded-xl border border-[var(--ink)]/15 text-sm text-[var(--ink-2)] hover:text-[var(--ink)] transition-colors"
          >
            Templates
          </Link>
          <Link
            href="/admin/work-plans/new"
            className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--ink)] text-sm font-medium hover:bg-[var(--accent-text)] hover:text-[var(--canvas)] transition-colors"
          >
            New plan
          </Link>
        </div>
      </div>

      {loadError && (
        <p className="text-xs text-[var(--red)] bg-[var(--red-l)] px-3 py-2 rounded-lg">
          Could not load plans: {loadError}
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="search"
          placeholder="Search by studio or plan title…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--ink)]/15 bg-[var(--surface)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
        />
        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setStatus(value)}
              className={[
                'px-3 py-2 rounded-lg text-sm transition-colors',
                status === value
                  ? 'bg-[var(--accent-light)] text-[var(--accent-text)]'
                  : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-sm text-[var(--ink-3)]">
              {plans.length === 0 ? 'No work plans yet.' : 'No plans match this view.'}
            </p>
            {plans.length === 0 && (
              <p className="text-xs text-[var(--ink-3)]">Create one from the standard template to get started.</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-[var(--ink)]/6">
            {filtered.map(plan => {
              const pct = completionPercent(plan.done_tasks, plan.total_tasks)
              return (
                <Link
                  key={plan.id}
                  href={`/admin/work-plans/${plan.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-[var(--canvas)] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-[var(--ink)] text-sm truncate">{plan.studio_name}</p>
                      {plan.status === 'archived' && (
                        <span className="px-1.5 py-0.5 rounded-full text-xs bg-white/8 text-[var(--ink-3)]">Archived</span>
                      )}
                      {plan.is_published && (
                        <span className="px-1.5 py-0.5 rounded-full text-xs bg-[var(--green-l)] text-[var(--green)]">
                          Published
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--ink-3)] mt-0.5 truncate">{plan.title}</p>
                  </div>
                  <div className="shrink-0 w-40">
                    <div className="flex items-center justify-between text-xs text-[var(--ink-3)] mb-1">
                      <span>{plan.done_tasks}/{plan.total_tasks}</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--accent-text)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-[var(--ink-3)] hidden md:block w-24 text-right">
                    {formatDate(plan.updated_at)}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
