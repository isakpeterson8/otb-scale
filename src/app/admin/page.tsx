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
  display_name: string | null
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

  const [profilesRes, settingsRes] = await Promise.all([
    adminClient.from('profiles').select('id, studio_id, role, email, status, created_at').order('created_at', { ascending: false }),
    adminClient.from('settings').select('user_id, display_name'),
  ])

  const rawProfiles = (profilesRes.data ?? []) as { id: string; studio_id: string | null; role: UserRole; email: string | null; status: string | null; created_at: string }[]
  const rawSettings = (settingsRes.data ?? []) as { user_id: string; display_name: string | null }[]

  const displayNameById = new Map(rawSettings.map(s => [s.user_id, s.display_name]))

  const adminProfiles: AdminProfile[] = rawProfiles.map(p => ({
    id: p.id,
    studio_id: p.studio_id,
    email: p.email,
    role: p.role,
    display_name: displayNameById.get(p.id) ?? null,
    status: (p.status ?? null) as AdminProfile['status'],
    created_at: p.created_at,
  }))

  const pendingProfiles = adminProfiles.filter(p => p.status === 'pending')

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <AdminClient
          callerRole={callerRole}
          profiles={adminProfiles}
          pendingProfiles={pendingProfiles}
        />
      </main>
    </AppShell>
  )
}
