import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAllRequests, getAllSites } from '@/app/actions/squarespace-concierge'
import AdminShell from '../AdminShell'
import ConciergeAdminClient from './ConciergeAdminClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Concierge Pipeline' }

export default async function ConciergePipelinePage() {
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

  const [requests, sites] = await Promise.all([getAllRequests(), getAllSites()])

  return (
    <AdminShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <ConciergeAdminClient requests={requests} allSites={sites} />
      </main>
    </AdminShell>
  )
}
