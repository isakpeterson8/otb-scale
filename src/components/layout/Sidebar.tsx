'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { initials } from '@/lib/utils'
import { TrendingUp } from 'lucide-react'
import NotificationBell from './NotificationBell'

const STRATEGY_SESSION_URL = 'https://login.outsidethebachs.com/music-lesson-studio-strategy-session-request'

const SETTINGS_NAV_ITEM = {
  label: 'Settings',
  href: '/settings',
  icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M3.4 12.6l.7-.7M11.9 4.1l.7-.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
}

// Nav items always visible to all tiers
const NAV_FREE = [
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
    label: 'Leads',
    href: '/leads',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="5" r="3" fill="currentColor" />
        <path d="M2 13c0-2.21 2.686-4 6-4s6 1.79 6 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      </svg>
    ),
  },
  {
    label: 'Financials',
    href: '/financials',
    icon: <TrendingUp width={16} height={16} aria-hidden />,
  },
  SETTINGS_NAV_ITEM,
]

// Nav items locked for free tier (shown with lock icon + modal trigger)
const NAV_LOCKED = [
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
    label: 'Education Library',
    href: '/education',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M2 4l6-2 6 2v8l-6 2-6-2V4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
        <path d="M8 2v10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity=".5" />
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
    label: 'Cadence Check-In',
    href: '/cadence',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M5 1v3M11 1v3M2 7h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M5 10h2M5 12.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity=".5" />
      </svg>
    ),
  },
]

const CANVA_EDITS_NAV_ITEM = {
  label: 'Canva Edits',
  href: '/canva-edits',
  icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 8h6M5 5.5h3M5 10.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity=".6" />
    </svg>
  ),
}

// Full nav for paid tiers (original order)
const NAV_ALL = [
  NAV_FREE[0], // Dashboard
  NAV_FREE[1], // Leads
  NAV_LOCKED[0], // Facebook Groups
  NAV_LOCKED[2], // School Outreach
  NAV_FREE[2], // Financials
  {
    label: 'Education Library',
    href: '/education',
    icon: NAV_LOCKED[1].icon,
  },
  NAV_LOCKED[3], // Cadence Check-In
  CANVA_EDITS_NAV_ITEM,
  SETTINGS_NAV_ITEM,
]

const LockIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden className="shrink-0 opacity-50">
    <rect x="2" y="5" width="7" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
    <path d="M3.5 5V3.5a2 2 0 014 0V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
)

const TIER_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  free:     { label: 'Free',     bg: 'rgba(255,248,240,0.08)', color: 'rgba(255,248,240,0.4)' },
  scale:    { label: 'Scale',    bg: 'rgba(4,173,239,0.15)',   color: '#0284a8' },
  graduate: { label: 'Graduate', bg: 'rgba(109,40,217,0.12)',  color: '#7c3aed' },
  lifetime: { label: 'Lifetime', bg: 'rgba(22,163,74,0.14)',   color: '#15803d' },
}

interface SidebarProps {
  displayName: string
  isAdmin: boolean
  tier?: string | null
  viewOnly?: boolean
  viewAsTier?: string | null
  isOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ displayName, isAdmin, tier, viewOnly, viewAsTier, isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [lockedModal, setLockedModal] = useState<string | null>(null) // feature label

  // In View As mode use the viewed studio's tier; otherwise use the real user's tier
  const effectiveTier = viewOnly && viewAsTier != null ? viewAsTier : tier
  const isFree = viewOnly ? viewAsTier === 'free' : (!isAdmin && tier === 'free')

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const navLinkClass = (active: boolean) => [
    'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs md:text-sm transition-colors min-h-[44px]',
    active
      ? 'bg-white/10 text-[var(--ink)]'
      : 'text-[var(--ink)]/50 hover:text-[var(--ink)]/80 hover:bg-white/6',
  ].join(' ')

  const lockedItemClass = [
    'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs md:text-sm transition-colors min-h-[44px] w-full text-left',
    'text-[var(--ink)]/30 hover:text-[var(--ink)]/45 hover:bg-white/4 cursor-pointer',
  ].join(' ')

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      {/* Upgrade modal for locked nav items */}
      {lockedModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={() => setLockedModal(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-7 flex flex-col items-center text-center"
            style={{ background: 'var(--surface)', border: '1px solid rgba(255,248,240,0.1)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Icon */}
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: 'var(--accent-l)' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 2l2.5 5.5 5.5.8-4 3.9 1 5.5L12 15l-5 2.7 1-5.5-4-3.9 5.5-.8L12 2z" fill="currentColor" style={{ color: 'var(--accent-text)' }} />
              </svg>
            </div>

            <h3
              className="text-xl mb-3"
              style={{ fontFamily: 'var(--font-heading)', color: 'var(--ink)' }}
            >
              Unlock {lockedModal}
            </h3>
            <p className="text-sm leading-relaxed mb-7" style={{ color: 'var(--ink-3)' }}>
              This feature is available on the Scale plan. Book a free Strategy Session with the OTB team to learn how Scale can help you grow your studio.
            </p>

            <div className="flex flex-col gap-3 w-full">
              <a
                href={STRATEGY_SESSION_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 rounded-xl text-sm font-semibold text-center transition-opacity hover:opacity-90"
                style={{ background: 'var(--accent-text)', color: 'var(--ink)' }}
                onClick={() => setLockedModal(null)}
              >
                Book a Strategy Session
              </a>
              <button
                onClick={() => setLockedModal(null)}
                className="w-full py-3 rounded-xl text-sm font-medium transition-colors hover:bg-white/6"
                style={{ color: 'var(--ink-3)' }}
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar panel */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 w-[200px] md:w-[240px] shrink-0 flex flex-col bg-[var(--sidebar)] transition-transform duration-200',
          'md:sticky md:top-0 md:h-screen md:translate-x-0 md:z-auto',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        ].join(' ')}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-5 md:px-5 md:py-6">
          <div className="flex items-center gap-2">
            <img
              src="/otb-logo.png"
              alt="Outside The Bachs"
              width={60}
              height={60}
              className="md:w-[100px] md:h-auto"
              style={{ objectFit: 'contain' }}
            />
            {viewOnly && (
              <span
                className="text-xs px-1.5 py-0.5 rounded font-semibold shrink-0"
                style={{ background: 'rgba(220,38,38,0.15)', color: '#b91c1c' }}
              >
                View Only
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="md:hidden flex items-center justify-center w-8 h-8 text-[var(--ink)]/40 hover:text-[var(--ink)] transition-colors"
            aria-label="Close menu"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {isFree ? (
            <>
              {/* Free tier: unlocked items */}
              {NAV_FREE.map(({ label, href, icon }) => {
                const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
                return (
                  <Link key={href} href={href} onClick={onClose} className={navLinkClass(active)}>
                    <span className={active ? 'text-[var(--ink)]' : 'text-[var(--ink)]/40'}>{icon}</span>
                    {label}
                  </Link>
                )
              })}

              {/* Free tier: separator */}
              <div className="my-1.5 mx-3 border-t border-white/6" />

              {/* Free tier: locked items — icon + lock only, no text label */}
              {NAV_LOCKED.map(({ label, icon }) => (
                <button
                  key={label}
                  onClick={() => { setLockedModal(label); onClose?.() }}
                  className={lockedItemClass}
                  title={label}
                >
                  <span className="text-[var(--ink)]/20">{icon}</span>
                  <LockIcon />
                </button>
              ))}
            </>
          ) : (
            <>
              {/* Paid tier / admin: full nav */}
              {NAV_ALL.map(({ label, href, icon }) => {
                const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
                return (
                  <Link key={href} href={href} onClick={onClose} className={navLinkClass(active)}>
                    <span className={active ? 'text-[var(--ink)]' : 'text-[var(--ink)]/40'}>{icon}</span>
                    {label}
                  </Link>
                )
              })}
            </>
          )}

          {/* Admin link — shown for admins, hidden when mirroring a studio in View As mode */}
          {isAdmin && !viewOnly && (
            <Link
              href="/admin"
              onClick={onClose}
              className={navLinkClass(pathname.startsWith('/admin'))}
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
          {/* Notifications — hidden on mobile (handled by header bell) */}
          <div className="hidden md:flex items-center justify-end px-3 py-1 mb-1">
            <NotificationBell />
          </div>
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center shrink-0">
              <span className="text-[var(--ink)] text-xs font-semibold leading-none">
                {initials(displayName)}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-sm text-[var(--ink)]/60 truncate block">{displayName}</span>
              {effectiveTier && (() => {
                const badge = TIER_BADGE[effectiveTier] ?? TIER_BADGE.free
                return (
                  <span
                    className="inline-block mt-0.5 px-1.5 py-px rounded text-[10px] font-semibold leading-tight"
                    style={{ background: badge.bg, color: badge.color }}
                  >
                    {badge.label}
                  </span>
                )
              })()}
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-[var(--ink)]/30 hover:text-[var(--ink)]/55 hover:bg-white/6 transition-colors min-h-[44px]"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
              <path d="M5 2H2a1 1 0 00-1 1v7a1 1 0 001 1h3M9 9.5l3-3-3-3M12 6.5H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}
