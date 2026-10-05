'use client'

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
  { key: 'requests',  label: 'Requests',  href: '/admin/requests/squarespace' },
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
  // Both are real routes. They used to be a path and a query param on a
  // different page, which is why switching between them left the UI stale.
  requests: [
    { key: 'squarespace', label: 'Squarespace', href: '/admin/requests/squarespace' },
    { key: 'canva',       label: 'Canva',       href: '/admin/requests/canva' },
  ],
  content: [
    { key: 'library',   label: 'Education Library', href: '/admin/library' },
    { key: 'resources', label: 'Resources',         href: '/admin/resources' },
  ],
}

function getActiveSection(pathname: string): SectionKey {
  if (pathname === '/admin') return 'members'
  if (pathname.startsWith('/admin/requests'))   return 'requests'
  if (pathname.startsWith('/admin/squarespace')) return 'sites'
  if (pathname.startsWith('/admin/library'))    return 'content'
  if (pathname.startsWith('/admin/resources'))  return 'content'
  if (pathname.startsWith('/admin/cadence'))    return 'insights'
  return 'members'
}

function getActiveSubKey(pathname: string, tab: string | null, section: SectionKey): string | null {
  if (section === 'members') return tab ?? 'pending'
  if (section === 'requests') {
    return pathname.startsWith('/admin/requests/canva') ? 'canva' : 'squarespace'
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

  // Derived on EVERY render, never held in state. The previous version seeded
  // state from the URL once and then only updated it from its own click handler,
  // so a back/forward or any navigation it did not originate left the wrong tab
  // highlighted. Next patches history.pushState to feed usePathname and
  // useSearchParams, so this stays correct for shallow updates too.
  const tab = canvaOnly ? 'canva' : searchParams.get('tab')

  const activeSection = canvaOnly ? 'requests' : getActiveSection(pathname)
  const activeSubKey  = canvaOnly ? 'canva' : getActiveSubKey(pathname, tab, activeSection)
  const topNav = canvaOnly
    ? [{ key: 'requests', label: 'Requests', href: '/admin/requests/canva' } as const]
    : TOP_NAV
  const subItems = canvaOnly
    ? [{ key: 'canva', label: 'Canva', href: '/admin/requests/canva' }]
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
              // Shallow-update ONLY the Members tabs, and only while already on
              // /admin: they are four views of one page's data, so a server
              // round-trip per click is wasteful. Crucially this must never
              // intercept a link to a DIFFERENT route — preventDefault there is
              // what left the Requests tabs showing the old page.
              const isSamePageTab = href.startsWith('/admin?tab=') && pathname === '/admin'
              return (
                <Link
                  key={key}
                  href={href}
                  onClick={isSamePageTab ? e => {
                    e.preventDefault()
                    // pushState, not replaceState: each tab gets a history entry
                    // so browser back/forward moves between them.
                    window.history.pushState(null, '', href)
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
