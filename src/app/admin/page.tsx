import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import AppShell from '@/components/layout/AppShell'
import AdminClient from './AdminClient'
import type { UserRole } from '@/types/database'

const getCachedAuthUsers = unstable_cache(
  async () => {
    const all: { id: string; last_sign_in_at?: string | null }[] = []
    let page = 1
    while (true) {
      const { data } = await adminClient.auth.admin.listUsers({ perPage: 1000, page })
      const users = data?.users ?? []
      all.push(...users)
      if (users.length < 1000) break
      page++
    }
    return all
  },
  ['auth-users'],
  { revalidate: 60 }
)

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Admin Overview' }

export interface AdminProfile {
  id: string
  studio_id: string | null
  email: string | null
  role: UserRole
  display_name: string | null
  status: 'pending' | 'approved' | 'rejected' | null
  created_at: string
  subscription_tier: string | null
  requested_tier: string | null
  last_sign_in_at: string | null
}

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [callerProfileRes, profilesRes, settingsRes, studiosRes, authUsers] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    adminClient.from('profiles').select('id, studio_id, role, email, status, created_at').order('created_at', { ascending: false }),
    adminClient.from('settings').select('user_id, display_name'),
    adminClient.from('studios').select('id, subscription_tier, requested_tier'),
    getCachedAuthUsers(),
  ])

  const callerRole = (callerProfileRes.data?.role ?? 'studio_owner') as UserRole

  const rawProfiles = (profilesRes.data ?? []) as { id: string; studio_id: string | null; role: UserRole; email: string | null; status: string | null; created_at: string }[]
  const rawSettings = (settingsRes.data ?? []) as { user_id: string; display_name: string | null }[]
  const rawStudios = (studiosRes.data ?? []) as { id: string; subscription_tier: string; requested_tier: string | null }[]

  const displayNameById = new Map(rawSettings.map(s => [s.user_id, s.display_name]))
  const tierByStudioId = new Map(rawStudios.map(s => [s.id, s.subscription_tier]))
  const requestedTierByStudioId = new Map(rawStudios.map(s => [s.id, s.requested_tier]))
  const lastSignInById = new Map(
    authUsers.map(u => [u.id, u.last_sign_in_at ?? null])
  )

  const adminProfiles: AdminProfile[] = rawProfiles.map(p => {
    let subscription_tier: string | null = null
    if (p.studio_id) {
      // 'unknown' = studio_id set on profile but no matching row in studios table
      subscription_tier = tierByStudioId.has(p.studio_id)
        ? (tierByStudioId.get(p.studio_id) ?? 'free')
        : 'unknown'
    }
    return {
      id: p.id,
      studio_id: p.studio_id,
      email: p.email,
      role: p.role,
      display_name: displayNameById.get(p.id) ?? null,
      status: (p.status ?? null) as AdminProfile['status'],
      created_at: p.created_at,
      subscription_tier,
      requested_tier: p.studio_id ? (requestedTierByStudioId.get(p.studio_id) ?? null) : null,
      last_sign_in_at: lastSignInById.get(p.id) ?? null,
    }
  })

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
