'use client'

import { useState, useTransition } from 'react'
import { updateUserRole } from '@/app/actions/admin'
import { formatDate, formatCurrency } from '@/lib/utils'
import { SCHOOL_STAGES } from '@/types/database'
import type { UserRole } from '@/types/database'
import type {
  AdminProfile,
  AdminStudio,
  AdminSchoolRecord,
  AdminContact,
  AdminFinancial,
} from './page'

type Tab = 'users' | 'studios' | 'outreach' | 'contacts' | 'financials'

const ROLE_OPTIONS: UserRole[] = ['studio_owner', 'otb_staff', 'otb_admin']
const ROLE_BADGE: Record<UserRole, { label: string; bg: string; color: string }> = {
  studio_owner: { label: 'Studio Owner', bg: 'rgba(0,0,0,0.06)',       color: '#374151' },
  otb_staff:    { label: 'OTB Staff',    bg: 'rgba(109,40,217,0.1)',   color: '#6d28d9' },
  otb_admin:    { label: 'Super Admin',  bg: 'rgba(4,173,239,0.15)',   color: '#0284a8' },
}
const CADENCE_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  active:    { label: 'Active',    bg: 'rgba(4,173,239,0.12)',  color: '#0284a8' },
  completed: { label: 'Completed', bg: 'rgba(22,163,74,0.12)',  color: '#15803d' },
  removed:   { label: 'Removed',   bg: 'rgba(0,0,0,0.06)',     color: '#374151' },
  replied:   { label: 'Replied',   bg: 'rgba(180,83,9,0.12)',  color: '#b45309' },
}
const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  student:  { bg: 'rgba(22,163,74,0.12)',  color: '#15803d' },
  active:   { bg: 'rgba(4,173,239,0.12)',  color: '#0284a8' },
  prospect: { bg: 'rgba(0,0,0,0.06)',      color: '#374151' },
  lead:     { bg: 'rgba(180,83,9,0.12)',   color: '#b45309' },
  inactive: { bg: 'rgba(220,38,38,0.1)',   color: '#b91c1c' },
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
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

function StageBadge({ stage }: { stage: string }) {
  const def = SCHOOL_STAGES.find(s => s.value === stage)
  if (!def) return <span className="text-[var(--ink-3)] text-xs">—</span>
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: def.bg, color: def.text }}>
      {def.label}
    </span>
  )
}

function RoleCell({ profile, canEdit }: { profile: AdminProfile; canEdit: boolean }) {
  const [isPending, startTransition] = useTransition()
  const badge = ROLE_BADGE[profile.role] ?? ROLE_BADGE.studio_owner

  if (!canEdit) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: badge.bg, color: badge.color }}>
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

function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-12 text-center text-sm text-[var(--ink-3)]">{msg}</td>
    </tr>
  )
}

export default function AdminClient({
  callerRole,
  stats,
  profiles,
  studios,
  schools,
  contacts,
  financials,
}: {
  callerRole: UserRole
  stats: {
    totalStudios: number
    totalUsers: number
    totalSchoolOutreach: number
    totalContacts: number
    activeCadences: number
    totalFbGroups: number
  }
  profiles: AdminProfile[]
  studios: AdminStudio[]
  schools: AdminSchoolRecord[]
  contacts: AdminContact[]
  financials: AdminFinancial[]
}) {
  const [tab, setTab] = useState<Tab>('users')
  const isSuperAdmin = callerRole === 'otb_admin'

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'users',      label: 'Users',           count: profiles.length },
    { key: 'studios',    label: 'Studios',          count: studios.length },
    { key: 'outreach',   label: 'School Outreach',  count: schools.length },
    { key: 'contacts',   label: 'Contacts',         count: contacts.length },
    { key: 'financials', label: 'Financials',       count: financials.length },
  ]

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

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'Studios',         value: stats.totalStudios },
          { label: 'Users',           value: stats.totalUsers },
          { label: 'School Outreach', value: stats.totalSchoolOutreach },
          { label: 'Contacts',        value: stats.totalContacts },
          { label: 'Active Cadences', value: stats.activeCadences },
          { label: 'FB Groups',       value: stats.totalFbGroups },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 px-4 py-4">
            <p className="text-xs text-[var(--ink-3)] mb-1.5 uppercase tracking-wide font-medium">{label}</p>
            <p className="text-3xl text-[var(--ink)] leading-none" style={{ fontFamily: 'var(--font-heading)' }}>
              {value}
            </p>
          </div>
        ))}
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

      {/* Users tab */}
      {tab === 'users' && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ink)]/8">
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Studio</Th>
                  <Th>Joined</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ink)]/6">
                {profiles.length === 0
                  ? <EmptyRow cols={4} msg="No users found." />
                  : profiles.map(p => (
                    <tr key={p.id} className="hover:bg-[var(--canvas)] transition-colors">
                      <td className="px-4 py-3 font-medium text-[var(--ink)]">{p.email ?? '—'}</td>
                      <td className="px-4 py-3">
                        <RoleCell profile={p} canEdit={isSuperAdmin} />
                      </td>
                      <Td muted>{p.studio_name ?? '—'}</Td>
                      <Td muted nowrap>{formatDate(p.created_at)}</Td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Studios tab */}
      {tab === 'studios' && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ink)]/8">
                  <Th>Studio</Th>
                  <Th>Owner</Th>
                  <Th right>Contacts</Th>
                  <Th right>Schools</Th>
                  <Th right>FB Groups</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ink)]/6">
                {studios.length === 0
                  ? <EmptyRow cols={6} msg="No studios found." />
                  : studios.map(s => (
                    <tr key={s.id} className="hover:bg-[var(--canvas)] transition-colors">
                      <td className="px-4 py-3 font-medium text-[var(--ink)]">{s.name}</td>
                      <td className="px-4 py-3">
                        <p className="text-[var(--ink-2)]">{s.owner_name ?? '—'}</p>
                        {s.owner_email && <p className="text-xs text-[var(--ink-3)]">{s.owner_email}</p>}
                      </td>
                      <Td right>{s.contact_count}</Td>
                      <Td right>{s.school_count}</Td>
                      <Td right>{s.fb_group_count}</Td>
                      <Td muted nowrap>{formatDate(s.created_at)}</Td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* School Outreach tab */}
      {tab === 'outreach' && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ink)]/8">
                  <Th>Studio</Th>
                  <Th>School</Th>
                  <Th>Contact</Th>
                  <Th>Email</Th>
                  <Th>Stage</Th>
                  <Th>Cadence</Th>
                  <Th>Last Contact</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ink)]/6">
                {schools.length === 0
                  ? <EmptyRow cols={7} msg="No school outreach records." />
                  : schools.map(s => {
                    const cadBadge = s.cadence_status ? CADENCE_BADGE[s.cadence_status] : null
                    return (
                      <tr key={s.id} className="hover:bg-[var(--canvas)] transition-colors">
                        <Td muted nowrap>{s.studio_name}</Td>
                        <td className="px-4 py-3 font-medium text-[var(--ink)]">{s.school_name}</td>
                        <Td>{s.contact_name ?? '—'}</Td>
                        <Td muted>{s.email ?? '—'}</Td>
                        <td className="px-4 py-3"><StageBadge stage={s.stage} /></td>
                        <td className="px-4 py-3">
                          {cadBadge
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: cadBadge.bg, color: cadBadge.color }}>{cadBadge.label}</span>
                            : <span className="text-[var(--ink-3)] text-xs">—</span>}
                        </td>
                        <Td muted nowrap>{formatDate(s.last_interacted_date)}</Td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Contacts tab */}
      {tab === 'contacts' && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ink)]/8">
                  <Th>Studio</Th>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Phone</Th>
                  <Th>Status</Th>
                  <Th>Added</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ink)]/6">
                {contacts.length === 0
                  ? <EmptyRow cols={6} msg="No contacts found." />
                  : contacts.map(c => {
                    const statusBadge = c.status ? STATUS_BADGE[c.status] : null
                    return (
                      <tr key={c.id} className="hover:bg-[var(--canvas)] transition-colors">
                        <Td muted nowrap>{c.studio_name}</Td>
                        <td className="px-4 py-3 font-medium text-[var(--ink)]">{c.name}</td>
                        <Td muted>{c.email ?? '—'}</Td>
                        <Td muted>{c.phone ?? '—'}</Td>
                        <td className="px-4 py-3">
                          {statusBadge
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: statusBadge.bg, color: statusBadge.color }}>{c.status}</span>
                            : <span className="text-[var(--ink-3)] text-xs">—</span>}
                        </td>
                        <Td muted nowrap>{formatDate(c.created_at)}</Td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Financials tab */}
      {tab === 'financials' && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ink)]/8">
                  <Th>Studio</Th>
                  <Th>Month</Th>
                  <Th right>Revenue</Th>
                  <Th right>Expenses</Th>
                  <Th right>Net</Th>
                  <Th>Notes</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ink)]/6">
                {financials.length === 0
                  ? <EmptyRow cols={6} msg="No financial records found." />
                  : financials.map(f => {
                    const net = (f.revenue ?? 0) - (f.expenses ?? 0)
                    return (
                      <tr key={f.id} className="hover:bg-[var(--canvas)] transition-colors">
                        <Td muted nowrap>{f.studio_name}</Td>
                        <Td nowrap>{f.month}</Td>
                        <td className="px-4 py-3 text-right text-sm text-[var(--ink-2)]">{formatCurrency(f.revenue)}</td>
                        <td className="px-4 py-3 text-right text-sm text-[var(--ink-2)]">{formatCurrency(f.expenses)}</td>
                        <td className="px-4 py-3 text-right text-sm font-medium" style={{ color: net >= 0 ? '#15803d' : '#b91c1c' }}>
                          {formatCurrency(net)}
                        </td>
                        <Td muted>{f.notes ?? '—'}</Td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
