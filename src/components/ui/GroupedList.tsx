'use client'

import type { ReactNode } from 'react'

/**
 * Renders `items` either as one list or, when `groupOf` is given, as sections
 * with a header and count per group. Items must already be ordered by group
 * (applyListView orders by the group key first), so sections keep that order.
 *
 * The page supplies `renderList` for a slice of items, so each page keeps its
 * own row/card markup and the grouping logic lives in one place.
 */
export default function GroupedList<T>({
  items,
  groupOf,
  labelFor,
  renderList,
}: {
  items: T[]
  groupOf: ((item: T) => string) | null
  labelFor: (key: string) => string
  renderList: (items: T[]) => ReactNode
}) {
  if (!groupOf) return <>{renderList(items)}</>

  const groups: { key: string; items: T[] }[] = []
  for (const item of items) {
    const key = groupOf(item)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(item)
    else groups.push({ key, items: [item] })
  }

  return (
    <div className="divide-y divide-[var(--ink)]/8">
      {groups.map(group => (
        <section key={group.key} aria-label={labelFor(group.key)}>
          <h3 className="px-4 md:px-5 py-2 bg-[var(--canvas)] text-xs font-medium uppercase tracking-wide text-[var(--ink-2)] flex items-center gap-2">
            {labelFor(group.key)}
            <span className="text-[var(--ink-3)]">{group.items.length}</span>
          </h3>
          {renderList(group.items)}
        </section>
      ))}
    </div>
  )
}
