'use client'

import Link from 'next/link'

export type LeadsTabKey = 'leads' | 'outreach' | 'waitlist'

export interface LeadsTabCounts {
  leads: number
  outreach: number
  waitlist: number
}

const ITEM_CLASS = 'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap'

function itemClass(isActive: boolean): string {
  return [
    ITEM_CLASS,
    isActive
      ? 'text-[var(--ink)] border-[var(--accent-text)]'
      : 'text-[var(--ink-3)] border-transparent hover:text-[var(--ink-2)]',
  ].join(' ')
}

/**
 * Top-level tab bar for the Leads area, shared by /leads and /leads/waitlist so
 * a third tab can't drift out of sync with the other two.
 *
 * Leads and Organic Outreach are in-page state on /leads, while Waitlist is a
 * real route — so the bar is deliberately mixed: pass `onSelect` from /leads to
 * get buttons for the first two, and omit it on /leads/waitlist to get links
 * back (Organic Outreach carries ?tab=outreach so it reopens on that panel).
 */
export default function LeadsTabBar({
  active,
  counts,
  onSelect,
}: {
  active: LeadsTabKey
  counts: LeadsTabCounts
  onSelect?: (tab: 'leads' | 'outreach') => void
}) {
  const count = (key: LeadsTabKey) => (
    <span className="ml-1 text-xs opacity-60">({counts[key]})</span>
  )

  return (
    <div className="flex items-center gap-1 border-b border-[var(--ink)]/8 overflow-x-auto">
      {onSelect ? (
        <>
          <button onClick={() => onSelect('leads')} className={itemClass(active === 'leads')}>
            Leads {count('leads')}
          </button>
          <button onClick={() => onSelect('outreach')} className={itemClass(active === 'outreach')}>
            Organic Outreach {count('outreach')}
          </button>
        </>
      ) : (
        <>
          <Link href="/leads" className={itemClass(active === 'leads')}>
            Leads {count('leads')}
          </Link>
          <Link href="/leads?tab=outreach" className={itemClass(active === 'outreach')}>
            Organic Outreach {count('outreach')}
          </Link>
        </>
      )}
      <Link href="/leads/waitlist" className={itemClass(active === 'waitlist')}>
        Waitlist {count('waitlist')}
      </Link>
    </div>
  )
}
