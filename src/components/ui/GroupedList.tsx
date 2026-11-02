'use client'

import type { ReactNode } from 'react'

/**
 * Renders `items` as a mobile card list and a desktop table, either whole or,
 * when `groupOf` is given, split into groups with a header and count each.
 * Items must already be ordered by group (applyListView orders by the group
 * key first), so groups keep that order.
 *
 * The desktop view is always ONE table: each group is its own <tbody> with a
 * header row, so column widths line up across groups and the column headings
 * appear once.
 *
 * The page supplies the card and row markup, so each page keeps its own
 * layout and the grouping logic lives in one place.
 */
export default function GroupedList<T>({
  items,
  groupOf,
  labelFor,
  renderCards,
  table,
}: {
  items: T[]
  groupOf: ((item: T) => string) | null
  labelFor: (key: string) => string
  /** Mobile cards for a slice of items, including their container. */
  renderCards: (items: T[]) => ReactNode
  table: {
    className: string
    /** Classes for the md+ wrapper around the table (e.g. horizontal scroll). */
    wrapperClassName?: string
    /** The <tr> of column headings. */
    head: ReactNode
    /** Number of columns, for the group header row's colSpan. */
    columns: number
    /** <tr>s for a slice of items. */
    renderRows: (items: T[]) => ReactNode
  }
}) {
  const groups: { key: string; items: T[] }[] = []
  if (groupOf) {
    for (const item of items) {
      const key = groupOf(item)
      const last = groups[groups.length - 1]
      if (last && last.key === key) last.items.push(item)
      else groups.push({ key, items: [item] })
    }
  }

  const groupHeader = (key: string, count: number) => (
    <span className="flex items-center gap-2">
      {labelFor(key)}
      <span className="text-[var(--ink-3)]">{count}</span>
    </span>
  )
  const headerClass = 'px-4 md:px-5 py-2 bg-[var(--canvas)] text-left text-xs font-medium uppercase tracking-wide text-[var(--ink-2)]'
  const bodyClass = 'divide-y divide-[var(--ink)]/6'

  return (
    <>
      <div className="md:hidden">
        {groupOf ? (
          <div className="divide-y divide-[var(--ink)]/8">
            {groups.map(group => (
              <section key={group.key} aria-label={labelFor(group.key)}>
                <h3 className={headerClass}>{groupHeader(group.key, group.items.length)}</h3>
                {renderCards(group.items)}
              </section>
            ))}
          </div>
        ) : (
          renderCards(items)
        )}
      </div>

      <div className={['hidden md:block', table.wrapperClassName ?? ''].join(' ')}>
        <table className={table.className}>
          <thead>{table.head}</thead>
          {groupOf ? (
            groups.map(group => (
              <tbody key={group.key} className={bodyClass}>
                <tr className="border-t border-[var(--ink)]/8">
                  <th colSpan={table.columns} scope="colgroup" className={headerClass}>
                    {groupHeader(group.key, group.items.length)}
                  </th>
                </tr>
                {table.renderRows(group.items)}
              </tbody>
            ))
          ) : (
            <tbody className={bodyClass}>{table.renderRows(items)}</tbody>
          )}
        </table>
      </div>
    </>
  )
}
