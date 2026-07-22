'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

interface Props {
  pendingCount: number
  requestsCount: number
  /** Designer mode: show only the Requests > Canva navigation */
  canvaOnly?: boolean
}

const TOP_NAV = [
  { key: 'members',   label: 'Members',   href: '/admin' },
  { key: 'requests',  label: 'Requests',  href: '/admin/concierge' },
  { key: 'sites',     label: 'Sites',     href: '/admin/squarespace' },
  { key: 'content',   label: 'Content',   href: '/admin/library' },
  { key: 'insights',  label: 'Insights',  href: '/admin/cadence' },
] as const

type SectionKey = (typeof TOP_NAV)[number]['key']

const SUB_NAV: Partial<Record<SectionKey, Array<{ key: string; label: string; href: string }>>> = {
  members: [
    { key: 'pending', label: 'Pending Approval', href: '/admin?tab=pending' },
    { key: 'users',   label: 'Users',            href: '/admin?tab=users' },
    { key: 'tiers',   label: 'Tiers',            href: '/admin?tab=tiers' },
    { key: 'grants',  label: 'Access Grants',    href: '/admin?tab=grants' },
  ],
  requests: [
    { key: 'concierge', label: 'Squarespace', href: '/admin/concierge' },
    { key: 'canva',     label: 'Canva',        href: '/admin?tab=canva' },
  ],
  content: [
    { key: 'library',   label: 'Education Library', href: '/admin/library' },
    { key: 'resources', label: 'Resources',         href: '/admin/resources' },
  ],
}

function getActiveSection(pathname: string, tab: string | null): SectionKey {
  if (pathname === '/admin') {
    if (tab === 'canva') return 'requests'
    return 'members'
  }
  if (pathname.startsWith('/admin/concierge'))  return 'requests'
  if (pathname.startsWith('/admin/squarespace')) return 'sites'
  if (pathname.startsWith('/admin/library'))    return 'content'
  if (pathname.startsWith('/admin/resources'))  return 'content'
  if (pathname.startsWith('/admin/cadence'))    return 'insights'
  return 'members'
}

function getActiveSubKey(pathname: string, tab: string | null, section: SectionKey): string | null {
  if (section === 'members') return tab ?? 'pending'
  if (section === 'requests') {
    if (tab === 'canva') return 'canva'
    return 'concierge'
  }
  if (section === 'content') {
    if (pathname.startsWith('/admin/resources')) return 'resources'
    return 'library'
  }
  return null
}

export default function AdminNav({ pendingCount, requestsCount, canvaOnly }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchParamsTab = searchParams.get('tab')

  // Track locally so client-side tab switches (window.history.replaceState) update
  // the active indicator without triggering a server round-trip.
  const [localTab, setLocalTab] = useState<string | null>(searchParamsTab)
  useEffect(() => { setLocalTab(searchParamsTab) }, [searchParamsTab])

  const tab = canvaOnly ? 'canva' : localTab

  const activeSection = canvaOnly ? 'requests' : getActiveSection(pathname, tab)
  const activeSubKey  = canvaOnly ? 'canva' : getActiveSubKey(pathname, tab, activeSection)
  const topNav = canvaOnly
    ? [{ key: 'requests', label: 'Requests', href: '/admin?tab=canva' } as const]
    : TOP_NAV
  const subItems = canvaOnly
    ? [{ key: 'canva', label: 'Canva', href: '/admin?tab=canva' }]
    : SUB_NAV[activeSection]

  const badges: Partial<Record<SectionKey, number>> = {
    members:  pendingCount,
    requests: requestsCount,
  }

  return (
    <div className="border-b border-[var(--ink)]/8 bg-[var(--surface)]">
      {/* Top-level nav */}
      <div className="overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1 px-4 md:px-8 pt-3" style={{ minWidth: 'max-content' }}>
          {topNav.map(({ key, label, href }) => {
            const isActive = activeSection === key
            const badge = badges[key]
            return (
              <Link
                key={key}
                href={href}
                className={[
                  'relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                  isActive
                    ? 'bg-[var(--accent-text)]/10 text-[var(--accent-text)]'
                    : 'text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--canvas)]',
                ].join(' ')}
              >
                {label}
                {badge != null && badge > 0 && (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none"
                    style={{
                      background: isActive ? 'var(--accent-text)' : 'rgba(180,83,9,0.15)',
                      color: isActive ? 'var(--canvas)' : '#b45309',
                    }}
                  >
                    {badge}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Sub-tab row */}
      {subItems && subItems.length > 0 && (
        <div className="overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-0 px-4 md:px-8" style={{ minWidth: 'max-content' }}>
            {subItems.map(({ key, label, href }) => {
              const isActive = activeSubKey === key
              const isTabLink = href.startsWith('/admin?tab=')
              return (
                <Link
                  key={key}
                  href={href}
                  onClick={isTabLink ? e => {
                    e.preventDefault()
                    const newTab = new URLSearchParams(href.split('?')[1] ?? '').get('tab')
                    if (!newTab) return
                    setLocalTab(newTab)
                    window.history.replaceState(null, '', href)
                    window.dispatchEvent(new CustomEvent('admin-tab-change', { detail: newTab }))
                  } : undefined}
                  className={[
                    'px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
                    isActive
                      ? 'text-[var(--ink)] border-[var(--accent-text)]'
                      : 'text-[var(--ink-3)] border-transparent hover:text-[var(--ink-2)]',
                  ].join(' ')}
                >
                  {label}
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
