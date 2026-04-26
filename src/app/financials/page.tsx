import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'
import FinancialsClient from './FinancialsClient'
import type { StudioSnapshot } from '@/types/database'

export default async function FinancialsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('studio_id')
    .eq('id', user.id)
    .single()

  let snapshots: StudioSnapshot[] = []
  if (profile?.studio_id) {
    const { data } = await supabase
      .from('studio_snapshots')
      .select('*')
      .eq('studio_id', profile.studio_id)
      .order('snapshot_date', { ascending: true })
    snapshots = (data ?? []) as StudioSnapshot[]
  }

  return (
    <AppShell>
      <main className="px-4 md:px-8 py-5 md:py-7 pb-16">
        <FinancialsClient initialSnapshots={snapshots} />
      </main>
    </AppShell>
  )
}
