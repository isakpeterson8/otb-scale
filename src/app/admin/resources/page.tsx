import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'
import ResourcesAdminClient from './ResourcesAdminClient'
import { getResources } from '@/app/actions/resources'

export default async function AdminResourcesPage() {
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

  const { data: resources } = await getResources()

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <ResourcesAdminClient items={resources} />
      </main>
    </AppShell>
  )
}
