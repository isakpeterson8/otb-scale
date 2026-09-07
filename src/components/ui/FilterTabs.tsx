'use client'

export interface FilterTab<T extends string> {
  value: T
  label: string
  count: number
}

/**
 * Horizontal status/stage filter tabs with count badges.
 * Extracted from /school-outreach so every list view filters the same way.
 */
export default function FilterTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: FilterTab<T>[]
  active: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex items-center gap-1 border-b border-[var(--ink)]/8 overflow-x-auto">
      {tabs.map(({ value, label, count }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          className={[
            'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
            active === value
              ? 'text-[var(--ink)] border-[var(--accent-text)]'
              : 'text-[var(--ink-3)] border-transparent hover:text-[var(--ink-2)]',
          ].join(' ')}
        >
          {label} ({count})
        </button>
      ))}
    </div>
  )
}
