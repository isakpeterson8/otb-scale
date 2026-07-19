import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminShell from '../AdminShell'
import ResourcesAdminClient from './ResourcesAdminClient'
import { getResources } from '@/app/actions/resources'

export const metadata: Metadata = { title: 'Resource Library' }

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
    <AdminShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <ResourcesAdminClient items={resources} />
      </main>
    </AdminShell>
  )
}
