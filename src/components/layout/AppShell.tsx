import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import Sidebar from './Sidebar'
import { ViewAsBanner } from './ViewAsBanner'
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

  const displayName =
    user.user_metadata?.full_name ??
    user.email?.split('@')[0] ??
    'User'

  const cookieStore = await cookies()
  const viewAsEmail = cookieStore.get('view_as_email')?.value ?? null

  return (
    <div className="flex min-h-screen bg-[var(--canvas)]">
      <Sidebar displayName={displayName} isAdmin={isAdmin} viewOnly={!!viewAsEmail} />
      <div className="flex-1 flex flex-col min-w-0">
        {viewAsEmail && <ViewAsBanner email={viewAsEmail} />}
        {children}
      </div>
    </div>
  )
}
