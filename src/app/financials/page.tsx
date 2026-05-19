import { redirect } from 'next/navigation'
import { getStudioId } from '@/app/actions/_shared'
import AppShell from '@/components/layout/AppShell'
import FinancialsClient from './FinancialsClient'
import type { StudioSnapshot } from '@/types/database'

export default async function FinancialsPage() {
  const ctx = await getStudioId()
  if (!ctx) redirect('/auth/login')
  const { supabase, studioId } = ctx

  const { data } = await supabase
    .from('studio_snapshots')
    .select('*')
    .eq('studio_id', studioId)
    .order('snapshot_date', { ascending: true })
  const snapshots = (data ?? []) as StudioSnapshot[]

  return (
    <AppShell>
      <main className="px-4 md:px-8 py-5 md:py-7 pb-16">
        <FinancialsClient initialSnapshots={snapshots} />
      </main>
    </AppShell>
  )
}
