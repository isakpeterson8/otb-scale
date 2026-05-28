'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { SchoolOutreach, CadenceEnrollment, FacebookGroup, StudioSnapshot } from '@/types/database'

const STRATEGY_SESSION_URL = 'https://login.outsidethebachs.com/music-lesson-studio-strategy-session-request'

type Snapshot   = Pick<StudioSnapshot, 'snapshot_date' | 'enrollment' | 'collected_revenue'>
type School     = Pick<SchoolOutreach, 'id' | 'school_name' | 'stage'>
type Enrollment = Pick<CadenceEnrollment, 'id' | 'school_id' | 'status' | 'current_email_number' | 'email_2_due_at' | 'email_3_due_at' | 'email_4_due_at'>
type Group      = Pick<FacebookGroup, 'id' | 'group_name' | 'most_recent_post_date'>

interface Props {
  isFreeTier?: boolean
  toastMessage?: string
  latestSnapshot: Snapshot | null
  schools: School[]
  enrollments: Enrollment[]
  activeGroups: Group[]
}

function fmtCurrency(n: number | null) {
  if (n == null) return '—'
  return '$' + Math.round(n).toLocaleString()
}

function fmtMonthYear(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function fmtDate(d: string) {
  const parsed = new Date(d + 'T12:00:00')
  if (isNaN(parsed.getTime())) return 'Due soon'
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function Card({ children, href, className = '' }: { children: React.ReactNode; href?: string; className?: string }) {
  const base = `bg-[#f3f4f6] rounded-2xl p-5 flex flex-col gap-3 ${className}`
  if (href) return <Link href={href} className={`${base} hover:bg-[#eaecef] transition-colors`}>{children}</Link>
  return <div className={base}>{children}</div>
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-widest text-[#6b7280]">{children}</p>
}

function BigNumber({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-4xl font-bold text-[#111827] leading-none" style={{ fontFamily: 'var(--font-heading)' }}>
      {children}
    </p>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold text-[#111827]" style={{ fontFamily: 'var(--font-heading)' }}>
      {children}
    </h2>
  )
}

function InnerCard({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-xl p-4 space-y-2 shadow-sm">{children}</div>
}

export default function DashboardClient({ isFreeTier, toastMessage, latestSnapshot, schools, enrollments, activeGroups }: Props) {
  const router = useRouter()
  const [toast, setToast] = useState<string | null>(toastMessage ?? null)

  // Clear the toast query param from URL after displaying
  useEffect(() => {
    if (toastMessage) {
      const url = new URL(window.location.href)
      url.searchParams.delete('toast')
      router.replace(url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : ''), { scroll: false })
    }
  }, [toastMessage, router])

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weekOut = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

  // ── Free tier: simplified dashboard ─────────────────────────────────────────
  if (isFreeTier) {
    return (
      <div className="space-y-8">
        {/* Toast notification */}
        {toast && (
          <div
            className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(4,173,239,0.1)', border: '1px solid rgba(4,173,239,0.2)', color: '#0284a8' }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 mt-0.5">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
              <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="flex-1">{toast}</span>
            <button onClick={() => setToast(null)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity" aria-label="Dismiss">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}

        {/* Page header */}
        <div>
          <h1 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
            Dashboard
          </h1>
          <p className="text-sm text-[var(--ink-3)] mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Studio Snapshot */}
        <section className="space-y-3">
          <SectionHeading>Studio Snapshot</SectionHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardTitle>Current Enrollment</CardTitle>
              {latestSnapshot?.enrollment != null
                ? <BigNumber>{latestSnapshot.enrollment}</BigNumber>
                : <p className="text-sm text-[#9ca3af]">No data yet — add a snapshot in Financials</p>}
              {latestSnapshot && (
                <p className="text-xs text-[#6b7280]">{fmtMonthYear(latestSnapshot.snapshot_date)}</p>
              )}
            </Card>

            <Card>
              <CardTitle>Collected Revenue</CardTitle>
              {latestSnapshot?.collected_revenue != null
                ? <BigNumber>{fmtCurrency(latestSnapshot.collected_revenue)}</BigNumber>
                : <p className="text-sm text-[#9ca3af]">No data yet — add a snapshot in Financials</p>}
              {latestSnapshot && (
                <p className="text-xs text-[#6b7280]">{fmtMonthYear(latestSnapshot.snapshot_date)}</p>
              )}
            </Card>
          </div>
        </section>

        {/* Upgrade banner */}
        <div
          className="rounded-2xl px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
          style={{ background: 'var(--surface)', border: '1px solid rgba(255,248,240,0.08)' }}
        >
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
              Want more features? Book a free session to learn more.
            </p>
          </div>
          <a
            href={STRATEGY_SESSION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold transition-opacity hover:opacity-80 whitespace-nowrap"
            style={{ color: 'var(--accent-text)' }}
          >
            Book a Strategy Session
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M2.5 7h9M8 3.5L11.5 7 8 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      </div>
    )
  }

  // ── Paid tier: full dashboard ────────────────────────────────────────────────
  const schoolById = new Map(schools.map(s => [s.id, s.school_name]))

  function nextDueFor(e: Enrollment): { label: string; date: string | null } {
    const num = e.current_email_number ?? 0
    if (num === 0) return { label: 'Email 1', date: null }
    const due = num === 1 ? e.email_2_due_at : num === 2 ? e.email_3_due_at : num === 3 ? e.email_4_due_at : null
    return { label: `Email ${num + 1}`, date: due }
  }

  const emailsDue = enrollments
    .filter(e => e.status === 'active')
    .map(e => ({ e, ...nextDueFor(e) }))
    .filter(({ date }) => date === null || new Date(date) <= weekOut)
    .sort((a, b) => {
      if (a.date === null && b.date === null) return 0
      if (a.date === null) return -1
      if (b.date === null) return 1
      return new Date(a.date).getTime() - new Date(b.date).getTime()
    })

  const activeCadence  = enrollments.filter(e => e.status === 'active').length
  const email1Ready    = enrollments.filter(e => e.status === 'active' && (e.current_email_number ?? 0) === 0).length
  const email24Pending = enrollments.filter(e => e.status === 'active' && (e.current_email_number ?? 0) > 0).length
  const needsAttention = activeGroups.filter(g => !g.most_recent_post_date || new Date(g.most_recent_post_date) < thirtyDaysAgo)

  return (
    <div className="space-y-8">
      {/* Toast */}
      {toast && (
        <div
          className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(4,173,239,0.1)', border: '1px solid rgba(4,173,239,0.2)', color: '#0284a8' }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 mt-0.5">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
            <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span className="flex-1">{toast}</span>
          <button onClick={() => setToast(null)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity" aria-label="Dismiss">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {/* Page header */}
      <div>
        <h1 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
          Dashboard
        </h1>
        <p className="text-sm text-[var(--ink-3)] mt-0.5">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Row 1 — Studio Snapshot */}
      <section className="space-y-3">
        <SectionHeading>Studio Snapshot</SectionHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card href="/financials">
            <CardTitle>Current Enrollment</CardTitle>
            {latestSnapshot?.enrollment != null
              ? <BigNumber>{latestSnapshot.enrollment}</BigNumber>
              : <p className="text-sm text-[#9ca3af]">No data yet</p>}
            {latestSnapshot && <p className="text-xs text-[#6b7280]">{fmtMonthYear(latestSnapshot.snapshot_date)}</p>}
          </Card>
          <Card href="/financials">
            <CardTitle>Collected Revenue</CardTitle>
            {latestSnapshot?.collected_revenue != null
              ? <BigNumber>{fmtCurrency(latestSnapshot.collected_revenue)}</BigNumber>
              : <p className="text-sm text-[#9ca3af]">No data yet</p>}
            {latestSnapshot && <p className="text-xs text-[#6b7280]">{fmtMonthYear(latestSnapshot.snapshot_date)}</p>}
          </Card>
        </div>
      </section>

      {/* Row 2 — School Outreach */}
      <section className="space-y-3">
        <SectionHeading>School Outreach</SectionHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card href="/school-outreach">
            <CardTitle>Active Schools</CardTitle>
            <BigNumber>{schools.length}</BigNumber>
            <p className="text-xs text-[#6b7280]">{activeCadence} in active cadence</p>
          </Card>
          <Card>
            <CardTitle>Emails Due This Week</CardTitle>
            {emailsDue.length === 0 ? (
              <p className="text-sm text-[#6b7280]">No emails due this week 🎉</p>
            ) : (
              <InnerCard>
                <div className="space-y-2">
                  {emailsDue.map(({ e, label, date }) => {
                    const name = schoolById.get(e.school_id) ?? 'Unknown school'
                    const isOverdue = date !== null && new Date(date) < today
                    return (
                      <Link key={e.id} href="/school-outreach" className="flex items-center justify-between text-sm hover:opacity-80 transition-opacity">
                        <span className="font-medium text-[#111827] truncate max-w-[55%]">{name}</span>
                        <span className={`text-xs shrink-0 ml-2 ${isOverdue ? 'text-red-500 font-semibold' : 'text-[#6b7280]'}`}>
                          {date === null ? `${label} ready` : `${label} — ${isOverdue ? `overdue ${fmtDate(date)}` : fmtDate(date)}`}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </InnerCard>
            )}
          </Card>
          <Card>
            <CardTitle>Cadence Overview</CardTitle>
            <InnerCard>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#6b7280]">Email 1 ready</span>
                  <span className="font-semibold text-[#111827]">{email1Ready}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6b7280]">Email 2–4 pending</span>
                  <span className="font-semibold text-[#111827]">{email24Pending}</span>
                </div>
                <div className="flex justify-between border-t border-[#f3f4f6] pt-1.5">
                  <span className="text-[#6b7280]">Active cadence</span>
                  <span className="font-semibold" style={{ color: '#04ADEF' }}>{activeCadence}</span>
                </div>
              </div>
            </InnerCard>
          </Card>
        </div>
      </section>

      {/* Row 3 — Facebook Groups */}
      <section className="space-y-3">
        <SectionHeading>Facebook Groups</SectionHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card href="/facebook-groups">
            <CardTitle>Active Groups</CardTitle>
            <BigNumber>{activeGroups.length}</BigNumber>
            {activeGroups.length > 0 && (
              <InnerCard>
                <div className="space-y-1.5">
                  {activeGroups.map(g => (
                    <div key={g.id} className="flex items-center justify-between text-sm">
                      <span className="font-medium text-[#111827] truncate max-w-[60%]">{g.group_name}</span>
                      <span className="text-xs text-[#9ca3af] shrink-0 ml-2">
                        {g.most_recent_post_date ? `Posted ${fmtDate(g.most_recent_post_date)}` : 'Never posted'}
                      </span>
                    </div>
                  ))}
                </div>
              </InnerCard>
            )}
          </Card>
          <Card href="/facebook-groups">
            <CardTitle>⚠️ Needs Attention</CardTitle>
            {needsAttention.length === 0 ? (
              <p className="text-sm text-[#6b7280]">All groups posted to recently ✅</p>
            ) : (
              <InnerCard>
                <div className="space-y-1.5">
                  {needsAttention.map(g => (
                    <div key={g.id} className="flex items-center justify-between text-sm">
                      <span className="font-medium text-[#111827] truncate max-w-[60%]">{g.group_name}</span>
                      <span className="text-xs text-red-500 shrink-0 ml-2">
                        {g.most_recent_post_date ? `Last posted ${fmtDate(g.most_recent_post_date)}` : 'Never posted'}
                      </span>
                    </div>
                  ))}
                </div>
              </InnerCard>
            )}
          </Card>
        </div>
      </section>
    </div>
  )
}
