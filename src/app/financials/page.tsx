import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getStudioId } from '@/app/actions/_shared'
import AppShell from '@/components/layout/AppShell'
import FinancialsClient from './FinancialsClient'
import UpgradeBanner from '@/components/UpgradeBanner'
import { hasFeatureAccess } from '@/lib/features'
import type { StudioSnapshot } from '@/types/database'

export const metadata: Metadata = { title: 'Financials' }

export default async function FinancialsPage() {
  const ctx = await getStudioId()
  if (!ctx) redirect('/auth/login')
  const { supabase, studioId, isAdmin, viewOnly } = ctx

  const { data: studio } = await supabase
    .from('studios')
    .select('subscription_tier')
    .eq('id', studioId)
    .single()
  const tier = studio?.subscription_tier ?? 'free'

  if (viewOnly ? !hasFeatureAccess(tier, 'financials') : (!isAdmin && !hasFeatureAccess(tier, 'financials'))) {
    return (
      <AppShell>
        <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
          <h2 className="text-2xl text-[var(--ink)] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
            Financials
          </h2>
          <UpgradeBanner feature="Financials" />
        </main>
      </AppShell>
    )
  }

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
