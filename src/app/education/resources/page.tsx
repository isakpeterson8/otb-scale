import { redirect } from 'next/navigation'
import { getStudioId } from '@/app/actions/_shared'
import AppShell from '@/components/layout/AppShell'
import UpgradeBanner from '@/components/UpgradeBanner'
import EducationTabBar from '../TabBar'
import { hasFeatureAccess } from '@/lib/features'
import { getCachedStudioTier } from '@/lib/supabase/cached'
import { getResources } from '@/app/actions/resources'
import ResourcesClient from '@/app/resources/ResourcesClient'

export default async function EducationResourcesPage() {
  const ctx = await getStudioId()
  if (!ctx) redirect('/auth/login')
  const { userEmail } = ctx

  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase())
  const isAdmin = !!(userEmail && adminEmails.includes(userEmail.toLowerCase()))

  const tier = await getCachedStudioTier(ctx.studioId)
  const hasAccess = isAdmin || hasFeatureAccess(tier, 'education_library')

  if (!hasAccess) {
    return (
      <AppShell>
        <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
          <h2 className="text-2xl text-[var(--ink)] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
            Education Library
          </h2>
          <UpgradeBanner feature="Education Library" />
        </main>
      </AppShell>
    )
  }

  const { data: resources } = await getResources()

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <div className="space-y-5">
          <div>
            <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
              Education Library
            </h2>
            <p className="text-sm text-[var(--ink-3)] mt-0.5">Videos and shared resources from OTB</p>
          </div>
          <EducationTabBar />
          <ResourcesClient resources={resources ?? []} />
        </div>
      </main>
    </AppShell>
  )
}
