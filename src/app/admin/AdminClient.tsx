'use client'

import { useState, useTransition } from 'react'
import { updateUserRole, approveUser, rejectUser, enterViewAs } from '@/app/actions/admin'
import { formatDate } from '@/lib/utils'
import type { UserRole } from '@/types/database'
import type { AdminProfile } from './page'

type Tab = 'pending' | 'users'

const ROLE_OPTIONS: UserRole[] = ['studio_owner', 'otb_staff', 'otb_admin']
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

function RoleCell({ profile, canEdit }: { profile: AdminProfile; canEdit: boolean }) {
  const [isPending, startTransition] = useTransition()
  const badge = ROLE_BADGE[profile.role] ?? ROLE_BADGE.studio_owner

  if (!canEdit) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: badge.bg, color: badge.color }}>
        {badge.label}
      </span>
    )
  }

  return (
    <select
      value={profile.role}
      disabled={isPending}
      onChange={e => {
        const newRole = e.target.value as UserRole
        startTransition(async () => { await updateUserRole(profile.id, newRole) })
      }}
      className="px-2 py-0.5 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-xs text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)] disabled:opacity-50"
    >
      {ROLE_OPTIONS.map(r => (
        <option key={r} value={r}>{ROLE_BADGE[r].label}</option>
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

function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-12 text-center text-sm text-[var(--ink-3)]">{msg}</td>
    </tr>
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
  const isSuperAdmin = callerRole === 'otb_admin'

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'pending', label: 'Pending Approval', count: pendingProfiles.length },
    { key: 'users',   label: 'Users',            count: profiles.length },
  ]

  const filteredProfiles = search.trim()
    ? profiles.filter(p => p.email?.toLowerCase().includes(search.toLowerCase()))
    : profiles

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
          Admin
        </h2>
        <p className="text-sm text-[var(--ink-3)] mt-0.5">
          Platform overview · {isSuperAdmin ? 'Super Admin' : 'Staff'}
        </p>
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ink)]/8">
                  <Th>Email</Th>
                  <Th>Joined</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ink)]/6">
                {pendingProfiles.length === 0
                  ? <EmptyRow cols={3} msg="No pending users." />
                  : pendingProfiles.map(p => (
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
        </div>
      )}

      {/* Users tab */}
      {tab === 'users' && (
        <div className="space-y-3">
          {/* Search */}
          <input
            type="text"
            placeholder="Search by email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full max-w-sm px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--surface)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
          />

          <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--ink)]/8">
                    <Th>Email</Th>
                    <Th>Role</Th>
                    <Th>Status</Th>
                    <Th>Studio</Th>
                    <Th>Joined</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ink)]/6">
                  {filteredProfiles.length === 0
                    ? <EmptyRow cols={6} msg={search ? 'No users match that search.' : 'No users found.'} />
                    : filteredProfiles.map(p => {
                      const statusBadge = p.status ? USER_STATUS_BADGE[p.status] : null
                      return (
                        <tr key={p.id} className="hover:bg-[var(--canvas)] transition-colors">
                          <td className="px-4 py-3 font-medium text-[var(--ink)]">{p.email ?? '—'}</td>
                          <td className="px-4 py-3">
                            <RoleCell profile={p} canEdit={isSuperAdmin} />
                          </td>
                          <td className="px-4 py-3">
                            {statusBadge
                              ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: statusBadge.bg, color: statusBadge.color }}>{statusBadge.label}</span>
                              : <span className="text-[var(--ink-3)] text-xs">—</span>}
                          </td>
                          <Td muted>{p.studio_name ?? '—'}</Td>
                          <Td muted nowrap>{formatDate(p.created_at)}</Td>
                          <td className="px-4 py-3 text-right">
                            <ViewAsButton profile={p} />
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
