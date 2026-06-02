'use client'

import Link from 'next/link'
import { useState, useEffect, useTransition } from 'react'
import { approveUser, rejectUser, enterViewAs, updateStudioTier, approveTierRequest, getWatchHistory } from '@/app/actions/admin'
import type { WatchHistoryEntry } from '@/app/actions/admin'
import { formatDate, formatRelativeTime } from '@/lib/utils'
import { TIER_LABELS } from '@/lib/features'
import type { UserRole } from '@/types/database'
import type { AdminProfile } from './page'

type Tab = 'pending' | 'users' | 'tiers'
type TierFilter = 'all' | 'free' | 'pending_upgrade' | 'scale' | 'graduate' | 'lifetime'

const ROLE_BADGE: Record<UserRole, { label: string; bg: string; color: string }> = {
  studio_owner: { label: 'Studio Owner', bg: 'rgba(0,0,0,0.06)',      color: '#374151' },
  otb_staff:    { label: 'OTB Staff',    bg: 'rgba(109,40,217,0.1)',  color: '#6d28d9' },
  otb_admin:    { label: 'Super Admin',  bg: 'rgba(4,173,239,0.15)',  color: '#0284a8' },
}
const USER_STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  approved: { label: 'Approved', bg: 'rgba(22,163,74,0.12)',  color: '#15803d' },
  pending:  { label: 'Pending',  bg: 'rgba(180,83,9,0.12)',   color: '#b45309' },
  rejected: { label: 'Rejected', bg: 'rgba(220,38,38,0.1)',   color: '#b91c1c' },
}
const TIER_OPTIONS = ['free', 'scale', 'graduate', 'lifetime'] as const
const TIER_BADGE: Record<string, { bg: string; color: string }> = {
  free:     { bg: 'rgba(0,0,0,0.06)',        color: '#6b7280' },
  scale:    { bg: 'rgba(4,173,239,0.15)',    color: '#0284a8' },
  graduate: { bg: 'rgba(109,40,217,0.1)',    color: '#6d28d9' },
  lifetime: { bg: 'rgba(22,163,74,0.12)',    color: '#15803d' },
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function Td({ children, muted, right, nowrap }: { children: React.ReactNode; muted?: boolean; right?: boolean; nowrap?: boolean }) {
  return (
    <td className={`px-4 py-3 text-sm ${muted ? 'text-[var(--ink-3)]' : 'text-[var(--ink-2)]'} ${right ? 'text-right' : ''} ${nowrap ? 'whitespace-nowrap' : ''}`}>
      {children}
    </td>
  )
}

function RoleCell({ profile }: { profile: AdminProfile }) {
  const badge = ROLE_BADGE[profile.role] ?? ROLE_BADGE.studio_owner
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: badge.bg, color: badge.color }}>
      {badge.label}
    </span>
  )
}

function TierCell({ profile }: { profile: AdminProfile }) {
  const [isPending, startTransition] = useTransition()

  if (profile.role === 'otb_admin' || profile.role === 'otb_staff' || !profile.studio_id) {
    return <span className="text-[var(--ink-3)] text-xs">—</span>
  }

  const tier = profile.subscription_tier ?? 'free'
  const badge = TIER_BADGE[tier] ?? TIER_BADGE.free

  return (
    <select
      value={tier}
      disabled={isPending}
      onChange={e => {
        const newTier = e.target.value
        startTransition(async () => { await updateStudioTier(profile.studio_id!, newTier) })
      }}
      className="px-2 py-0.5 rounded-lg border text-xs focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)] disabled:opacity-50"
      style={{ backgroundColor: badge.bg, color: badge.color, borderColor: badge.color + '40' }}
    >
      {TIER_OPTIONS.map(t => (
        <option key={t} value={t}>{TIER_LABELS[t]}</option>
      ))}
    </select>
  )
}

function ApprovalButtons({ userId }: { userId: string }) {
  const [isPending, startTransition] = useTransition()
  return (
    <div className="flex items-center gap-2">
      <button
        disabled={isPending}
        onClick={() => startTransition(async () => { await approveUser(userId) })}
        className="px-3 py-1 rounded-lg text-xs font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-80"
        style={{ background: '#16a34a' }}
      >
        Approve
      </button>
      <button
        disabled={isPending}
        onClick={() => startTransition(async () => { await rejectUser(userId) })}
        className="px-3 py-1 rounded-lg text-xs font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-80"
        style={{ background: '#dc2626' }}
      >
        Reject
      </button>
    </div>
  )
}

function ViewAsButton({ profile }: { profile: AdminProfile }) {
  const [isPending, startTransition] = useTransition()
  const disabled = !profile.studio_id || !profile.email || isPending

  return (
    <button
      disabled={disabled}
      onClick={() => {
        if (!profile.studio_id || !profile.email) return
        startTransition(async () => {
          await enterViewAs(profile.studio_id!, profile.email!)
        })
      }}
      title={!profile.studio_id ? 'No studio associated with this user' : 'View app as this user'}
      className="px-3 py-1 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-30"
      style={{ background: 'rgba(4,173,239,0.12)', color: '#0284a8' }}
    >
      {isPending ? 'Loading…' : 'View as'}
    </button>
  )
}

function ApproveTierButton({ profile }: { profile: AdminProfile }) {
  const [isPending, startTransition] = useTransition()
  if (!profile.studio_id || !profile.requested_tier) return null
  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => { await approveTierRequest(profile.studio_id!) })}
      className="px-3 py-1 rounded-lg text-xs font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-80"
      style={{ background: '#15803d' }}
    >
      {isPending ? 'Approving…' : `Approve → ${profile.requested_tier}`}
    </button>
  )
}

function WatchHistoryButton({ profile, onOpen }: { profile: AdminProfile; onOpen: (p: AdminProfile) => void }) {
  if (!profile.studio_id) return null
  return (
    <button
      onClick={() => onOpen(profile)}
      className="px-3 py-1 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
      style={{ background: 'rgba(73,37,47,0.15)', color: 'var(--accent-text)' }}
    >
      Watch history
    </button>
  )
}

function WatchHistoryModal({ profile, onClose }: { profile: AdminProfile; onClose: () => void }) {
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<WatchHistoryEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile.studio_id) { setLoading(false); return }
    let cancelled = false
    getWatchHistory(profile.studio_id).then(result => {
      if (cancelled) return
      setLoading(false)
      if (result.error) setError(result.error)
      else setEntries(result.data)
    })
    return () => { cancelled = true }
  }, [profile.studio_id])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--ink)]/8 w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--ink)]/8 shrink-0">
          <div>
            <h3 className="text-base font-medium text-[var(--ink)]">Watch History</h3>
            <p className="text-xs text-[var(--ink-3)] mt-0.5">{profile.email ?? profile.display_name ?? 'User'}</p>
          </div>
          <button onClick={onClose} className="p-2 text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {loading && (
            <p className="text-sm text-[var(--ink-3)] text-center py-8">Loading…</p>
          )}
          {error && (
            <p className="text-sm text-[var(--red)] text-center py-8">{error}</p>
          )}
          {!loading && !error && (!entries || entries.length === 0) && (
            <p className="text-sm text-[var(--ink-3)] text-center py-8">No watch history for this studio.</p>
          )}
          {!loading && !error && entries && entries.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ink)]/8">
                  <th className="text-left pb-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Video</th>
                  <th className="text-left pb-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Category</th>
                  <th className="text-left pb-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide whitespace-nowrap">Watch %</th>
                  <th className="text-left pb-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide whitespace-nowrap">Last Watched</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ink)]/6">
                {entries.map(e => (
                  <tr key={e.id}>
                    <td className="py-3 pr-4 text-[var(--ink)] font-medium">{e.title}</td>
                    <td className="py-3 pr-4 text-[var(--ink-3)] text-xs">{e.category ?? '—'}</td>
                    <td className="py-3 pr-4">
                      {e.completed ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--green-l)] text-[var(--green)]">
                          Completed
                        </span>
                      ) : (
                        <span className="text-[var(--ink-2)]">{e.watch_pct}%</span>
                      )}
                    </td>
                    <td className="py-3 text-[var(--ink-3)] text-xs whitespace-nowrap">{formatRelativeTime(e.last_watched_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AdminClient({
  callerRole,
  profiles,
  pendingProfiles,
}: {
  callerRole: UserRole
  profiles: AdminProfile[]
  pendingProfiles: AdminProfile[]
}) {
  const [tab, setTab] = useState<Tab>('pending')
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState<TierFilter>('all')
  const [watchHistoryProfile, setWatchHistoryProfile] = useState<AdminProfile | null>(null)
  const isSuperAdmin = callerRole === 'otb_admin'
  const isAdmin = callerRole === 'otb_admin' || callerRole === 'otb_staff'

  const pendingUpgradeCount = profiles.filter(p => p.requested_tier).length

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'pending', label: 'Pending Approval', count: pendingProfiles.length },
    { key: 'users',   label: 'Users',            count: profiles.length },
    { key: 'tiers',   label: 'Tiers',            count: pendingUpgradeCount },
  ]

  const filteredProfiles = search.trim()
    ? profiles.filter(p =>
        (p.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (p.display_name ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : profiles

  return (
    <div className="space-y-6">
      {/* Watch History Modal */}
      {watchHistoryProfile && (
        <WatchHistoryModal
          profile={watchHistoryProfile}
          onClose={() => setWatchHistoryProfile(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
            Admin
          </h2>
          <p className="text-sm text-[var(--ink-3)] mt-0.5">
            Platform overview · {isSuperAdmin ? 'Super Admin' : 'Staff'}
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Link
              href="/admin/library"
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: 'rgba(4,173,239,0.12)', color: '#0284a8' }}
            >
              Education Library
            </Link>
            <Link
              href="/admin/resources"
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: 'rgba(73,37,47,0.15)', color: 'var(--accent-text)' }}
            >
              Resources
            </Link>
            <Link
              href="/admin/cadence"
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: 'rgba(109,40,217,0.1)', color: '#6d28d9' }}
            >
              Cadence Analysis
            </Link>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-[var(--ink)]/8">
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={[
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
              tab === key
                ? 'text-[var(--ink)] border-[var(--accent-text)]'
                : 'text-[var(--ink-3)] border-transparent hover:text-[var(--ink-2)]',
            ].join(' ')}
          >
            {label} <span className="ml-1 text-xs opacity-60">({count})</span>
          </button>
        ))}
      </div>

      {/* Pending Approval tab */}
      {tab === 'pending' && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
          {pendingProfiles.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-[var(--ink-3)]">No pending users.</p>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-[var(--ink)]/6">
                {pendingProfiles.map(p => (
                  <div key={p.id} className="px-4 py-4 space-y-3">
                    <div>
                      <p className="font-medium text-[var(--ink)] text-sm">{p.email ?? '—'}</p>
                      <p className="text-xs text-[var(--ink-3)] mt-0.5">Joined {formatDate(p.created_at)}</p>
                    </div>
                    <ApprovalButtons userId={p.id} />
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--ink)]/8">
                      <Th>Email</Th>
                      <Th>Joined</Th>
                      <Th>Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--ink)]/6">
                    {pendingProfiles.map(p => (
                      <tr key={p.id} className="hover:bg-[var(--canvas)] transition-colors">
                        <td className="px-4 py-3 font-medium text-[var(--ink)]">{p.email ?? '—'}</td>
                        <Td muted nowrap>{formatDate(p.created_at)}</Td>
                        <td className="px-4 py-3">
                          <ApprovalButtons userId={p.id} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tiers tab */}
      {tab === 'tiers' && (() => {
        const tierFilterOptions: { key: TierFilter; label: string }[] = [
          { key: 'all',            label: 'All' },
          { key: 'free',           label: 'Free' },
          { key: 'pending_upgrade',label: `Pending Upgrade${pendingUpgradeCount > 0 ? ` (${pendingUpgradeCount})` : ''}` },
          { key: 'scale',          label: 'Scale' },
          { key: 'graduate',       label: 'Graduate' },
          { key: 'lifetime',       label: 'Lifetime' },
        ]
        const studioOwners = profiles.filter(p => p.role === 'studio_owner')
        const filtered = studioOwners.filter(p => {
          if (tierFilter === 'all') return true
          if (tierFilter === 'pending_upgrade') return !!p.requested_tier
          return (p.subscription_tier ?? 'free') === tierFilter
        })
        return (
          <div className="space-y-3">
            {/* Filter chips */}
            <div className="flex flex-wrap gap-1.5">
              {tierFilterOptions.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTierFilter(key)}
                  className={[
                    'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                    tierFilter === key
                      ? 'bg-[var(--accent-l)] text-[var(--accent-text)]'
                      : 'bg-[var(--surface)] text-[var(--ink-3)] hover:text-[var(--ink-2)]',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
              {filtered.length === 0 ? (
                <p className="px-4 py-12 text-center text-sm text-[var(--ink-3)]">No users match this filter.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--ink)]/8">
                        <Th>Email</Th>
                        <Th>Name</Th>
                        <Th>Current Tier</Th>
                        <Th>Requested Tier</Th>
                        <Th>Joined</Th>
                        <Th></Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--ink)]/6">
                      {filtered.map(p => {
                        const tier = p.subscription_tier ?? 'free'
                        const badge = TIER_BADGE[tier] ?? TIER_BADGE.free
                        const reqBadge = p.requested_tier ? (TIER_BADGE[p.requested_tier] ?? TIER_BADGE.free) : null
                        return (
                          <tr key={p.id} className="hover:bg-[var(--canvas)] transition-colors">
                            <td className="px-4 py-3 font-medium text-[var(--ink)]">{p.email ?? '—'}</td>
                            <Td muted>{p.display_name ?? '—'}</Td>
                            <td className="px-4 py-3">
                              <TierCell profile={p} />
                            </td>
                            <td className="px-4 py-3">
                              {reqBadge ? (
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                                  style={{ backgroundColor: reqBadge.bg, color: reqBadge.color }}
                                >
                                  {p.requested_tier}
                                </span>
                              ) : (
                                <span className="text-[var(--ink-3)] text-xs">—</span>
                              )}
                            </td>
                            <Td muted nowrap>{formatDate(p.created_at)}</Td>
                            <td className="px-4 py-3 text-right">
                              <ApproveTierButton profile={p} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Users tab */}
      {tab === 'users' && (
        <div className="space-y-3">
          {/* Search */}
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full max-w-sm px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--surface)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
          />

          <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
            {filteredProfiles.length === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-[var(--ink-3)]">{search ? 'No users match that search.' : 'No users found.'}</p>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-[var(--ink)]/6">
                  {filteredProfiles.map(p => {
                    const statusBadge = p.status ? USER_STATUS_BADGE[p.status] : null
                    return (
                      <div key={p.id} className="px-4 py-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-[var(--ink)] text-sm truncate">{p.email ?? '—'}</p>
                            {p.display_name && <p className="text-xs text-[var(--ink-3)] mt-0.5">{p.display_name}</p>}
                            <p className="text-xs text-[var(--ink-3)]">Joined {formatDate(p.created_at)}</p>
                            <p className="text-xs text-[var(--ink-3)]">Last login: {formatRelativeTime(p.last_sign_in_at)}</p>
                          </div>
                          <ViewAsButton profile={p} />
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <RoleCell profile={p} />
                          <TierCell profile={p} />
                          {statusBadge
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: statusBadge.bg, color: statusBadge.color }}>{statusBadge.label}</span>
                            : null}
                        </div>
                        <WatchHistoryButton profile={p} onOpen={setWatchHistoryProfile} />
                      </div>
                    )
                  })}
                </div>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--ink)]/8">
                        <Th>Email</Th>
                        <Th>Role</Th>
                        <Th>Tier</Th>
                        <Th>Status</Th>
                        <Th>Name</Th>
                        <Th>Joined</Th>
                        <Th>Last Login</Th>
                        <Th></Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--ink)]/6">
                      {filteredProfiles.map(p => {
                        const statusBadge = p.status ? USER_STATUS_BADGE[p.status] : null
                        return (
                          <tr key={p.id} className="hover:bg-[var(--canvas)] transition-colors">
                            <td className="px-4 py-3 font-medium text-[var(--ink)]">{p.email ?? '—'}</td>
                            <td className="px-4 py-3">
                              <RoleCell profile={p} />
                            </td>
                            <td className="px-4 py-3">
                              <TierCell profile={p} />
                            </td>
                            <td className="px-4 py-3">
                              {statusBadge
                                ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: statusBadge.bg, color: statusBadge.color }}>{statusBadge.label}</span>
                                : <span className="text-[var(--ink-3)] text-xs">—</span>}
                            </td>
                            <Td muted>{p.display_name ?? '—'}</Td>
                            <Td muted nowrap>{formatDate(p.created_at)}</Td>
                            <Td muted nowrap>{formatRelativeTime(p.last_sign_in_at)}</Td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <WatchHistoryButton profile={p} onOpen={setWatchHistoryProfile} />
                                <ViewAsButton profile={p} />
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
