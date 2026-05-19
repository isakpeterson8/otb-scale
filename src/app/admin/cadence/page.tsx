import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'
import CadenceAdminClient from './CadenceAdminClient'
import { getLatestAnalysis } from './actions'

export default async function AdminCadencePage() {
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

  const { analysis, rowCount, createdAt } = await getLatestAnalysis()

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7 max-w-5xl">
        <CadenceAdminClient
          initialAnalysis={analysis}
          initialRowCount={rowCount}
          initialCreatedAt={createdAt}
        />
      </main>
    </AppShell>
  )
}
