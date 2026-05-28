import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import AppShellClient from './AppShellClient'
import type { Profile } from '@/types/database'

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, studio_id, role, email, status')
    .eq('id', user.id)
    .single<Profile>()

  const isAdmin = profile?.role === 'otb_admin' || profile?.role === 'otb_staff'

  if (!isAdmin) {
    if (profile?.status === 'rejected') redirect('/rejected')
    if (profile?.status !== 'approved') redirect('/pending')
  }

  // Fetch studio tier for sidebar badge (only for studio owners with a linked studio)
  let studioTier: string | null = null
  if (!isAdmin && profile?.studio_id) {
    const { data: studio } = await supabase
      .from('studios')
      .select('subscription_tier')
      .eq('id', profile.studio_id)
      .single()
    studioTier = studio?.subscription_tier ?? 'free'
  }

  const displayName =
    user.user_metadata?.full_name ??
    user.email?.split('@')[0] ??
    'User'

  const cookieStore = await cookies()
  const viewAsStudioId = cookieStore.get('view_as_studio_id')?.value ?? null
  const viewAsEmail = cookieStore.get('view_as_email')?.value ?? null

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
    >
      {children}
    </AppShellClient>
  )
}
