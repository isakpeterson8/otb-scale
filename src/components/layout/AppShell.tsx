import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from './Sidebar'
import type { Profile } from '@/types/database'

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, role, email')
    .eq('id', user.id)
    .single<Profile>()

  const displayName =
    profile?.display_name ??
    user.user_metadata?.full_name ??
    user.email?.split('@')[0] ??
    'User'

  const isAdmin = profile?.role === 'otb_admin'

  return (
    <div className="flex min-h-screen bg-[var(--canvas)]">
      <Sidebar displayName={displayName} isAdmin={isAdmin} />
      <div className="flex-1 flex flex-col min-w-0">
        {children}
      </div>
    </div>
  )
}
