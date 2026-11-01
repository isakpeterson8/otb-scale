'use client'

import { useEffect, useState } from 'react'
import {
  GROUP_OPTIONS,
  PRESET_OPTIONS,
  SORT_OPTIONS,
  sourceChipOptions,
  statusChipOptions,
  type FacetOption,
  type GroupKey,
  type ListFacets,
  type ListViewConfig,
  type SortKey,
} from '@/lib/list-view'
import { useListView } from '@/hooks/useListView'

const SELECT_CLASS =
  'px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--surface)] text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]'

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value]
}

function ChipGroup({
  label,
  options,
  counts,
  selected,
  onChange,
}: {
  label: string
  options: FacetOption[]
  counts: Record<string, number>
  selected: string[]
  onChange: (next: string[]) => void
}) {
  // Hide empty values unless selected, so a stale bookmarked chip can still be cleared.
  const visible = options.filter(o => (counts[o.value] ?? 0) > 0 || selected.includes(o.value))
  if (visible.length === 0) return null
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-[var(--ink-3)] uppercase tracking-wide font-medium pt-1.5 w-14 shrink-0">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {visible.map(o => {
          const active = selected.includes(o.value)
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(toggle(selected, o.value))}
              className={[
                'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                active
                  ? 'bg-[var(--accent-light)] border-[var(--accent-text)] text-[var(--ink)]'
                  : 'border-[var(--ink)]/15 text-[var(--ink-2)] hover:border-[var(--ink)]/30',
              ].join(' ')}
            >
              {o.label} <span className="text-[var(--ink-3)]">{counts[o.value] ?? 0}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Sort / filter / group / preset controls for a list page. Everything is read
 * from and written to the URL via useListView, so the server page does the
 * actual querying. On narrow screens the controls collapse into a
 * "Sort & filter" bottom sheet; search stays visible.
 */
export default function ListViewToolbar({
  config,
  facets,
  resultCount,
}: {
  config: ListViewConfig
  facets: ListFacets
  /** Rows in the current (filtered) result, for the "Showing N of M" line. */
  resultCount: number
}) {
  const { view, setView, applyPreset, reset, isPending, isDefault } = useListView(config)
  const [sheetOpen, setSheetOpen] = useState(false)

  // Search is typed locally and pushed to the URL after a pause, so each
  // keystroke doesn't trigger a server round trip.
  // When the URL's q changes from outside (back button, Reset, a preset),
  // adopt it — adjusted during render rather than in an effect.
  const [search, setSearch] = useState(view.q)
  const [syncedQ, setSyncedQ] = useState(view.q)
  if (view.q !== syncedQ) {
    setSyncedQ(view.q)
    setSearch(view.q)
  }
  useEffect(() => {
    if (search.trim() === view.q.trim()) return
    const id = setTimeout(() => setView({ q: search }), 300)
    return () => clearTimeout(id)
  }, [search, view.q, setView])

  const activeFilterCount =
    view.status.length + view.source.length + (view.preset !== 'all' ? 1 : 0) + (view.group !== 'none' ? 1 : 0)

  const controls = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Sort"
          value={view.sort}
          onChange={e => setView({ sort: e.target.value as SortKey })}
          className={SELECT_CLASS}
        >
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label(config)}</option>)}
        </select>
        <select
          aria-label="Group by"
          value={view.group}
          onChange={e => setView({ group: e.target.value as GroupKey })}
          className={SELECT_CLASS}
        >
          {GROUP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label(config)}</option>)}
        </select>
        <div className="flex items-center gap-1 rounded-lg border border-[var(--ink)]/15 p-0.5" role="group" aria-label="Preset views">
          {PRESET_OPTIONS.map(p => (
            <button
              key={p.value}
              type="button"
              aria-pressed={view.preset === p.value}
              onClick={() => applyPreset(p.value)}
              className={[
                'px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                view.preset === p.value
                  ? 'bg-[var(--accent)] text-[var(--ink)]'
                  : 'text-[var(--ink-2)] hover:text-[var(--ink)]',
              ].join(' ')}
            >
              {p.label}
            </button>
          ))}
        </div>
        {!isDefault && (
          <button
            type="button"
            onClick={() => { setSearch(''); reset() }}
            className="px-2.5 py-1.5 text-xs text-[var(--ink-3)] hover:text-[var(--ink)] underline-offset-2 hover:underline"
          >
            Reset
          </button>
        )}
      </div>
      <ChipGroup
        label={config.statusLabel}
        options={statusChipOptions(config)}
        counts={facets.status}
        selected={view.status}
        onChange={status => setView({ status })}
      />
      <ChipGroup
        label="Source"
        options={sourceChipOptions(config, facets)}
        counts={facets.source}
        selected={view.source}
        onChange={source => setView({ source })}
      />
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-3)]" aria-hidden>
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            aria-label="Search"
            placeholder={config.searchPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[var(--ink)]/15 bg-[var(--surface)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
          />
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="md:hidden shrink-0 px-3 py-2.5 rounded-xl border border-[var(--ink)]/15 text-sm text-[var(--ink)]"
        >
          Sort &amp; filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
      </div>

      <div className="hidden md:block">{controls}</div>

      <p className="text-xs text-[var(--ink-3)]" aria-live="polite">
        {isPending ? 'Updating…' : `Showing ${resultCount} of ${facets.total}`}
      </p>

      {sheetOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onClick={() => setSheetOpen(false)}>
          <div
            role="dialog"
            aria-label="Sort and filter"
            className="bg-[var(--canvas)] rounded-t-2xl border-t border-[var(--ink)]/8 p-4 max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-medium text-[var(--ink)]">Sort &amp; filter</h3>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--ink)] text-sm font-medium"
              >
                Done
              </button>
            </div>
            {controls}
          </div>
        </div>
      )}
    </div>
  )
}
