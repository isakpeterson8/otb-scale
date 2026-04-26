import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import AppShell from '@/components/layout/AppShell'
import AdminClient from './AdminClient'
import type {
  UserRole,
  SchoolOutreachStage,
  CadenceStatus,
} from '@/types/database'

export interface AdminProfile {
  id: string
  email: string | null
  role: UserRole
  studio_name: string | null
  status: 'pending' | 'approved' | 'rejected' | null
  created_at: string
}

export interface AdminStudio {
  id: string
  name: string
  owner_name: string | null
  owner_email: string | null
  contact_count: number
  school_count: number
  fb_group_count: number
  created_at: string
}

export interface AdminSchoolRecord {
  id: string
  studio_name: string
  school_name: string
  contact_name: string | null
  email: string | null
  stage: SchoolOutreachStage
  cadence_status: CadenceStatus | null
  last_interacted_date: string | null
}

export interface AdminContact {
  id: string
  studio_name: string
  name: string
  email: string | null
  phone: string | null
  status: string | null
  created_at: string
}

export interface AdminFinancial {
  id: string
  studio_name: string
  month: string
  revenue: number | null
  expenses: number | null
  notes: string | null
}

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const callerRole = (callerProfile?.role ?? 'studio_owner') as UserRole

  const [
    studiosRes,
    profilesRes,
    contactsRes,
    schoolRes,
    fbRes,
    financialsRes,
    cadenceRes,
  ] = await Promise.all([
    adminClient.from('studios').select('id, name, owner_user_id, created_at').order('created_at', { ascending: false }),
    adminClient.from('profiles').select('id, studio_id, role, email, status, created_at').order('created_at', { ascending: false }),
    adminClient.from('contacts').select('id, studio_id, name, email, phone, status, created_at').order('created_at', { ascending: false }),
    adminClient.from('school_outreach').select('id, studio_id, school_name, contact_name, email, stage, last_interacted_date').order('created_at', { ascending: false }),
    adminClient.from('facebook_groups').select('id, studio_id'),
    adminClient.from('financial_months').select('id, studio_id, month, revenue, expenses, notes').order('month', { ascending: false }),
    adminClient.from('cadence_enrollments').select('id, school_id, status').order('created_at', { ascending: false }),
  ])

  console.log('[admin] studios:',    studiosRes.data?.length,    studiosRes.error?.message)
  console.log('[admin] profiles:',   profilesRes.data?.length,   profilesRes.error?.message)
  console.log('[admin] contacts:',   contactsRes.data?.length,   contactsRes.error?.message)
  console.log('[admin] schools:',    schoolRes.data?.length,     schoolRes.error?.message)
  console.log('[admin] fb_groups:',  fbRes.data?.length,         fbRes.error?.message)
  console.log('[admin] financials:', financialsRes.data?.length, financialsRes.error?.message)
  console.log('[admin] cadence:',    cadenceRes.data?.length,    cadenceRes.error?.message)

  const rawStudios  = (studiosRes.data   ?? []) as { id: string; name: string; owner_user_id: string; created_at: string }[]
  const rawProfiles = (profilesRes.data  ?? []) as { id: string; studio_id: string | null; role: UserRole; email: string | null; status: string | null; created_at: string }[]
  const rawContacts = (contactsRes.data  ?? []) as { id: string; studio_id: string; name: string; email: string | null; phone: string | null; status: string | null; created_at: string }[]
  const rawSchools  = (schoolRes.data    ?? []) as { id: string; studio_id: string; school_name: string; contact_name: string | null; email: string | null; stage: SchoolOutreachStage; last_interacted_date: string | null }[]
  const rawFb       = (fbRes.data        ?? []) as { id: string; studio_id: string }[]
  const rawFin      = (financialsRes.data ?? []) as { id: string; studio_id: string; month: string; revenue: number | null; expenses: number | null; notes: string | null }[]
  const rawCadence  = (cadenceRes.data   ?? []) as { id: string; school_id: string; status: string }[]

  // Build lookup maps
  const studioById = new Map(rawStudios.map(s => [s.id, s]))
  const profileById = new Map(rawProfiles.map(p => [p.id, p]))

  const contactsByStudio = rawContacts.reduce<Record<string, number>>((a, c) => { a[c.studio_id] = (a[c.studio_id] ?? 0) + 1; return a }, {})
  const schoolsByStudio  = rawSchools.reduce<Record<string, number>>((a, s) => { a[s.studio_id] = (a[s.studio_id] ?? 0) + 1; return a }, {})
  const fbByStudio       = rawFb.reduce<Record<string, number>>((a, g) => { a[g.studio_id] = (a[g.studio_id] ?? 0) + 1; return a }, {})
  const latestCadenceBySchool = rawCadence.reduce<Record<string, string>>((a, c) => {
    if (!a[c.school_id]) a[c.school_id] = c.status
    return a
  }, {})

  // --- Shape data for each tab ---

  const adminProfiles: AdminProfile[] = rawProfiles.map(p => ({
    id: p.id,
    email: p.email,
    role: p.role,
    studio_name: p.studio_id ? (studioById.get(p.studio_id)?.name ?? null) : null,
    status: (p.status ?? null) as AdminProfile['status'],
    created_at: p.created_at,
  }))

  const pendingProfiles = adminProfiles.filter(p => p.status === 'pending')

  const adminStudios: AdminStudio[] = rawStudios.map(s => {
    const owner = profileById.get(s.owner_user_id)
    return {
      id: s.id,
      name: s.name,
      owner_name: owner?.email ?? null,
      owner_email: owner?.email ?? null,
      contact_count: contactsByStudio[s.id] ?? 0,
      school_count: schoolsByStudio[s.id] ?? 0,
      fb_group_count: fbByStudio[s.id] ?? 0,
      created_at: s.created_at,
    }
  })

  const adminSchools: AdminSchoolRecord[] = rawSchools.map(s => ({
    id: s.id,
    studio_name: studioById.get(s.studio_id)?.name ?? '—',
    school_name: s.school_name,
    contact_name: s.contact_name,
    email: s.email,
    stage: s.stage,
    cadence_status: (latestCadenceBySchool[s.id] ?? null) as CadenceStatus | null,
    last_interacted_date: s.last_interacted_date,
  }))

  const adminContacts: AdminContact[] = rawContacts.map(c => ({
    id: c.id,
    studio_name: studioById.get(c.studio_id)?.name ?? '—',
    name: c.name,
    email: c.email,
    phone: c.phone,
    status: c.status,
    created_at: c.created_at,
  }))

  const adminFinancials: AdminFinancial[] = rawFin.map(f => ({
    id: f.id,
    studio_name: studioById.get(f.studio_id)?.name ?? '—',
    month: f.month,
    revenue: f.revenue,
    expenses: f.expenses,
    notes: f.notes,
  }))

  const stats = {
    totalStudios: rawStudios.length,
    totalUsers: rawProfiles.length,
    totalSchoolOutreach: rawSchools.length,
    totalContacts: rawContacts.length,
    activeCadences: rawCadence.filter(c => c.status === 'active').length,
    totalFbGroups: rawFb.length,
  }

  return (
    <AppShell>
      <main className="flex-1 px-8 py-7">
        <AdminClient
          callerRole={callerRole}
          stats={stats}
          profiles={adminProfiles}
          pendingProfiles={pendingProfiles}
          studios={adminStudios}
          schools={adminSchools}
          contacts={adminContacts}
          financials={adminFinancials}
        />
      </main>
    </AppShell>
  )
}
