'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { initials } from '@/lib/utils'
import { TrendingUp } from 'lucide-react'

const NAV = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" />
        <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".4" />
        <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".4" />
        <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".4" />
      </svg>
    ),
  },
  {
    label: 'Contacts',
    href: '/contacts',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="5" r="3" fill="currentColor" />
        <path d="M2 13c0-2.21 2.686-4 6-4s6 1.79 6 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      </svg>
    ),
  },
  {
    label: 'Facebook Groups',
    href: '/facebook-groups',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="5" cy="5" r="2.5" fill="currentColor" />
        <circle cx="11" cy="5" r="2.5" fill="currentColor" opacity=".5" />
        <path d="M1 13c0-1.66 1.79-3 4-3s4 1.34 4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
        <path d="M9 11c.6-.63 2.4-.63 3 0 .6.63.6 2 0 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" opacity=".6" />
      </svg>
    ),
  },
  {
    label: 'School Outreach',
    href: '/school-outreach',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M2 6l6-4 6 4v8H2V6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
        <rect x="5.5" y="9" width="2.5" height="5" rx=".5" fill="currentColor" opacity=".4" />
        <rect x="8" y="9" width="2.5" height="5" rx=".5" fill="currentColor" opacity=".4" />
        <path d="M8 2L8 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity=".5" />
      </svg>
    ),
  },
  {
    label: 'Financials',
    href: '/financials',
    icon: <TrendingUp width={16} height={16} aria-hidden />,
  },
  {
    label: 'Email Templates',
    href: '/email-templates',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M1 5l7 5 7-5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M10 8.5l3-2M6 8.5L3 6.5" stroke="currentColor" strokeWidth="1" opacity=".4" />
      </svg>
    ),
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M3.4 12.6l.7-.7M11.9 4.1l.7-.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
]

interface SidebarProps {
  displayName: string
  isAdmin: boolean
}

export default function Sidebar({ displayName, isAdmin }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <aside className="w-56 shrink-0 flex flex-col h-screen sticky top-0 bg-[var(--sidebar)]">
      <div className="flex items-center px-5 py-6">
        <img
          src="/otb-logo.png"
          alt="Outside The Bachs"
          width={120}
          style={{ objectFit: 'contain' }}
        />
      </div>

      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {NAV.map(({ label, href, icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                active
                  ? 'bg-white/10 text-[var(--ink)]'
                  : 'text-[var(--ink)]/50 hover:text-[var(--ink)]/80 hover:bg-white/6',
              ].join(' ')}
            >
              <span className={active ? 'text-[var(--ink)]' : 'text-[var(--ink)]/40'}>{icon}</span>
              {label}
            </Link>
          )
        })}

        {isAdmin && (
          <Link
            href="/admin"
            className={[
              'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname.startsWith('/admin')
                ? 'bg-white/10 text-[var(--ink)]'
                : 'text-[var(--ink)]/50 hover:text-[var(--ink)]/80 hover:bg-white/6',
            ].join(' ')}
          >
            <span className={pathname.startsWith('/admin') ? 'text-[var(--ink)]' : 'text-[var(--ink)]/40'}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M8 1l2 4h4l-3 3 1 4-4-2.5L4 12l1-4L2 5h4L8 1z" fill="currentColor" />
              </svg>
            </span>
            Admin
          </Link>
        )}
      </nav>

      <div className="px-3 pt-3 pb-4 border-t border-white/8">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center shrink-0">
            <span className="text-[var(--ink)] text-xs font-semibold leading-none">
              {initials(displayName)}
            </span>
          </div>
          <span className="text-sm text-[var(--ink)]/60 truncate">{displayName}</span>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-[var(--ink)]/30 hover:text-[var(--ink)]/55 hover:bg-white/6 transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
            <path d="M5 2H2a1 1 0 00-1 1v7a1 1 0 001 1h3M9 9.5l3-3-3-3M12 6.5H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Sign out
        </button>
      </div>
    </aside>
  )
}
