import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getStudioId } from '@/app/actions/_shared'
import AppShell from '@/components/layout/AppShell'
import ResourcesClient from './ResourcesClient'
import UpgradeBanner from '@/components/UpgradeBanner'
import { getResources } from '@/app/actions/resources'
import { hasFeatureAccess } from '@/lib/features'

export const metadata: Metadata = { title: 'Resources' }

export default async function ResourcesPage() {
  const ctx = await getStudioId()
  if (!ctx) redirect('/auth/login')
  const { supabase, studioId, isAdmin, viewOnly } = ctx

  const { data: studio } = await supabase
    .from('studios')
    .select('subscription_tier')
    .eq('id', studioId)
    .single()
  const tier = studio?.subscription_tier ?? 'free'

  if (viewOnly ? !hasFeatureAccess(tier, 'resources') : (!isAdmin && !hasFeatureAccess(tier, 'resources'))) {
    return (
      <AppShell>
        <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
          <h2 className="text-2xl text-[var(--ink)] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
            Resources
          </h2>
          <UpgradeBanner feature="Resources" />
        </main>
      </AppShell>
    )
  }

  const { data: resources } = await getResources()

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <ResourcesClient resources={resources} />
      </main>
    </AppShell>
  )
}
