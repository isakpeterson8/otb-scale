'use client'

import { useState, useEffect, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { approveUser, rejectUser, enterViewAs, updateStudioTier, approveTierRequest, getWatchHistory, createAccessGrant, revokeAccessGrant, listAccessGrants } from '@/app/actions/admin'
import type { WatchHistoryEntry, AccessGrant } from '@/app/actions/admin'
import { sendAdminReminder } from '@/app/actions/reminders'
import CanvaRequestsTab from './CanvaRequestsTab'
import { formatDate, formatRelativeTime } from '@/lib/utils'
import { TIER_LABELS } from '@/lib/features'
import type { UserRole } from '@/types/database'
import type { AdminProfile } from './page'

type ReminderType = 'cadence_weekly' | 'data_recap_monthly' | 'admin_manual'

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

  if (profile.subscription_tier === 'unknown') {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
        style={{ background: 'rgba(220,38,38,0.1)', color: '#b91c1c' }}
        title={`studio_id ${profile.studio_id} has no matching row in the studios table`}
      >
        ⚠ no studio row
      </span>
    )
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

function SendReminderButton({ profile, onOpen }: { profile: AdminProfile; onOpen: (p: AdminProfile) => void }) {
  if (!profile.studio_id) return null
  return (
    <button
      onClick={() => onOpen(profile)}
      className="px-3 py-1 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
      style={{ background: 'rgba(180,83,9,0.12)', color: '#b45309' }}
    >
      Send reminder
    </button>
  )
}

function SendReminderModal({ profile, onClose }: { profile: AdminProfile; onClose: () => void }) {
  const [type, setType] = useState<ReminderType>('admin_manual')
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function submit() {
    if (!profile.studio_id) return
    startTransition(async () => {
      const result = await sendAdminReminder(profile.id, profile.studio_id!, type, message)
      if (result.error) { setError(result.error); return }
      setSent(true)
      setTimeout(onClose, 1000)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--ink)]/8 w-full max-w-sm p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium text-[var(--ink)]">Send Reminder</h3>
          <button onClick={onClose} className="p-1 text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-[var(--ink-3)]">To: {profile.email ?? profile.display_name ?? 'User'}</p>

        {sent ? (
          <p className="text-sm text-center py-4" style={{ color: 'var(--green)' }}>Reminder sent!</p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[var(--ink-3)] font-medium">Type</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as ReminderType)}
                className="px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
              >
                <option value="cadence_weekly">Weekly Check-In</option>
                <option value="data_recap_monthly">Monthly Recap</option>
                <option value="admin_manual">Admin Message</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[var(--ink-3)] font-medium">Message (optional)</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="e.g. Haven't updated school contacts"
                rows={3}
                className="px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)] resize-none"
              />
            </div>
            {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}
            <button
              onClick={submit}
              disabled={isPending}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--accent-text)', color: 'var(--canvas)' }}
            >
              {isPending ? 'Sending…' : 'Send Reminder'}
            </button>
          </>
        )}
      </div>
    </div>
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

const VALID_TABS = ['pending', 'users', 'tiers', 'canva', 'grants'] as const
type Tab = (typeof VALID_TABS)[number]

// Module-level: survives tab switches within the same page session
let _grantsCache: AccessGrant[] | null = null

const GRANT_STATUS_BADGE: Record<'active' | 'revoked', { label: string; bg: string; color: string }> = {
  active:  { label: 'Active',  bg: 'rgba(22,163,74,0.12)',  color: '#15803d' },
  revoked: { label: 'Revoked', bg: 'rgba(220,38,38,0.1)',   color: '#b91c1c' },
}

function grantStatus(grant: AccessGrant): 'active' | 'revoked' {
  if (grant.revoked_at) return 'revoked'
  return 'active'
}

function AccessGrantsTab() {
  const [grants, setGrants] = useState<AccessGrant[] | null>(_grantsCache)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [tier, setTier] = useState<string>('scale')
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function reload() {
    listAccessGrants().then(result => {
      if (result.error) { setLoadError(result.error); return }
      _grantsCache = result.data
      setGrants(result.data)
    })
  }

  useEffect(() => {
    if (_grantsCache) return  // already loaded this session
    reload()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function submit() {
    setFormError(null)
    startTransition(async () => {
      const result = await createAccessGrant(email, tier)
      if (result.error) { setFormError(result.error); return }
      setEmail('')
      setTier('scale')
      _grantsCache = null  // bust so next load is fresh
      reload()
    })
  }

  function revoke(grantId: string) {
    startTransition(async () => {
      const result = await revokeAccessGrant(grantId)
      if (result.error) { setFormError(result.error); return }
      _grantsCache = null  // bust so next load is fresh
      reload()
    })
  }

  return (
    <div className="space-y-6">
      {/* Grant form */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 p-5 space-y-4 max-w-lg">
        <p className="text-sm font-medium text-[var(--ink)]">Grant access</p>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-xs text-[var(--ink-3)] font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--ink-3)] font-medium">Tier</label>
            <select
              value={tier}
              onChange={e => setTier(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
            >
              {TIER_OPTIONS.map(t => (
                <option key={t} value={t}>{TIER_LABELS[t]}</option>
              ))}
            </select>
          </div>

        </div>

        {formError && <p className="text-xs" style={{ color: 'var(--red)' }}>{formError}</p>}

        <button
          onClick={submit}
          disabled={isPending || !email.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-90"
          style={{ background: 'var(--accent-text)' }}
        >
          {isPending ? 'Granting…' : 'Grant access'}
        </button>
      </div>

      {/* Grants list */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
        {grants === null ? (
          <p className="px-4 py-12 text-center text-sm text-[var(--ink-3)]">
            {loadError ? loadError : 'Loading…'}
          </p>
        ) : grants.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-[var(--ink-3)]">No grants yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ink)]/8">
                  <Th>Email</Th>
                  <Th>Tier</Th>
                  <Th>Status</Th>
                  <Th>Granted</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ink)]/6">
                {grants.map(g => {
                  const status = grantStatus(g)
                  const tierBadge = TIER_BADGE[g.tier] ?? TIER_BADGE.free
                  const statusBadge = GRANT_STATUS_BADGE[status]
                  return (
                    <tr key={g.id} className="hover:bg-[var(--canvas)] transition-colors">
                      <td className="px-4 py-3 font-medium text-[var(--ink)] whitespace-nowrap">{g.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: tierBadge.bg, color: tierBadge.color }}
                        >
                          {(TIER_LABELS as Record<string, string>)[g.tier] ?? g.tier}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: statusBadge.bg, color: statusBadge.color }}
                        >
                          {statusBadge.label}
                        </span>
                      </td>
                      <Td muted nowrap>{formatDate(g.granted_at)}</Td>
                      <td className="px-4 py-3 text-right">
                        {status === 'active' && (
                          <button
                            disabled={isPending}
                            onClick={() => revoke(g.id)}
                            className="px-3 py-1 rounded-lg text-xs font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-80"
                            style={{ background: '#dc2626' }}
                          >
                            Revoke
                          </button>
                        )}
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
  const searchParams = useSearchParams()
  const urlTab = searchParams.get('tab') as Tab | null
  const [tab, setTab] = useState<Tab>(
    urlTab && (VALID_TABS as readonly string[]).includes(urlTab) ? urlTab : 'pending'
  )
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState<TierFilter>('all')
  const [watchHistoryProfile, setWatchHistoryProfile] = useState<AdminProfile | null>(null)
  const [reminderProfile, setReminderProfile] = useState<AdminProfile | null>(null)
  const isSuperAdmin = callerRole === 'otb_admin'
  const isAdmin = callerRole === 'otb_admin' || callerRole === 'otb_staff'

  const pendingUpgradeCount = profiles.filter(p => p.requested_tier).length

  // Listen for client-side tab changes dispatched by AdminNav (no server round-trip)
  useEffect(() => {
    function onAdminTabChange(e: Event) {
      const key = (e as CustomEvent<string>).detail as Tab
      if ((VALID_TABS as readonly string[]).includes(key)) setTab(key)
    }
    window.addEventListener('admin-tab-change', onAdminTabChange)
    return () => window.removeEventListener('admin-tab-change', onAdminTabChange)
  }, [])

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
      {/* Send Reminder Modal */}
      {reminderProfile && (
        <SendReminderModal
          profile={reminderProfile}
          onClose={() => setReminderProfile(null)}
        />
      )}

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

      {/* Canva Requests tab */}
      {tab === 'canva' && <CanvaRequestsTab />}

      {/* Access Grants tab */}
      {tab === 'grants' && <AccessGrantsTab />}

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
                        <div className="flex items-center gap-2 flex-wrap">
                          <WatchHistoryButton profile={p} onOpen={setWatchHistoryProfile} />
                          <SendReminderButton profile={p} onOpen={setReminderProfile} />
                        </div>
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
                                <SendReminderButton profile={p} onOpen={setReminderProfile} />
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
