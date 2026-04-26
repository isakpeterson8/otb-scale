import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import AppShell from '@/components/layout/AppShell'
import AdminClient from './AdminClient'
import type { UserRole } from '@/types/database'

export interface AdminProfile {
  id: string
  studio_id: string | null
  email: string | null
  role: UserRole
  studio_name: string | null
  status: 'pending' | 'approved' | 'rejected' | null
  created_at: string
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

  const [studiosRes, profilesRes] = await Promise.all([
    adminClient.from('studios').select('id, name').order('created_at', { ascending: false }),
    adminClient.from('profiles').select('id, studio_id, role, email, status, created_at').order('created_at', { ascending: false }),
  ])

  const rawStudios  = (studiosRes.data  ?? []) as { id: string; name: string }[]
  const rawProfiles = (profilesRes.data ?? []) as { id: string; studio_id: string | null; role: UserRole; email: string | null; status: string | null; created_at: string }[]

  const studioById = new Map(rawStudios.map(s => [s.id, s]))

  const adminProfiles: AdminProfile[] = rawProfiles.map(p => ({
    id: p.id,
    studio_id: p.studio_id,
    email: p.email,
    role: p.role,
    studio_name: p.studio_id ? (studioById.get(p.studio_id)?.name ?? null) : null,
    status: (p.status ?? null) as AdminProfile['status'],
    created_at: p.created_at,
  }))

  const pendingProfiles = adminProfiles.filter(p => p.status === 'pending')

  return (
    <AppShell>
      <main className="flex-1 px-8 py-7">
        <AdminClient
          callerRole={callerRole}
          profiles={adminProfiles}
          pendingProfiles={pendingProfiles}
        />
      </main>
    </AppShell>
  )
}
