import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { adminClient } from '@/lib/supabase/admin'
import { getCachedUser, getCachedProfile, getCachedStudioTier } from '@/lib/supabase/cached'
import AppShellClient from './AppShellClient'

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getCachedUser()
  if (!user) redirect('/auth/login')

  const profile = await getCachedProfile(user.id)

  const isAdmin = profile?.role === 'otb_admin' || profile?.role === 'otb_staff'

  if (!isAdmin) {
    if (profile?.status === 'rejected') redirect('/rejected')
    if (profile?.status !== 'approved') redirect('/pending')
  }

  // Fetch studio tier for sidebar badge — primes the cache for the page component too
  let studioTier: string | null = null
  if (!isAdmin && profile?.studio_id) {
    studioTier = await getCachedStudioTier(profile.studio_id)
  }

  const displayName =
    user.user_metadata?.full_name ??
    user.email?.split('@')[0] ??
    'User'

  const cookieStore = await cookies()
  const viewAsStudioId = cookieStore.get('view_as_studio_id')?.value ?? null
  const viewAsEmail = cookieStore.get('view_as_email')?.value ?? null
  // The tier of the studio being viewed (set when admin enters View As mode)
  const viewAsTier = viewAsStudioId ? (cookieStore.get('view_as_tier')?.value ?? null) : null

  let viewAsStudioName: string | null = null
  if (viewAsStudioId) {
    const { data: studio } = await adminClient
      .from('studios')
      .select('name')
      .eq('id', viewAsStudioId)
      .single()
    viewAsStudioName = studio?.name ?? viewAsEmail
  }

  return (
    <AppShellClient
      displayName={displayName}
      isAdmin={isAdmin}
      tier={studioTier}
      viewOnly={!!viewAsStudioId}
      viewAsStudioName={viewAsStudioName}
      viewAsTier={viewAsTier}
    >
      {children}
    </AppShellClient>
  )
}
