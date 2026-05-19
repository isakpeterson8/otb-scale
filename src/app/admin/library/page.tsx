import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'
import LibraryAdminClient from './LibraryAdminClient'
import { getLibraryItems, getWatchStats } from '@/app/actions/library'

export default async function AdminLibraryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'otb_admin' && profile?.role !== 'otb_staff') {
    redirect('/dashboard')
  }

  const [{ data: items }, { data: watchStats }] = await Promise.all([
    getLibraryItems(),
    getWatchStats(),
  ])

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <LibraryAdminClient items={items} watchStats={watchStats} />
      </main>
    </AppShell>
  )
}
