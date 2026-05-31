import { redirect } from 'next/navigation'
import { getStudioId } from '@/app/actions/_shared'
import AppShell from '@/components/layout/AppShell'
import UpgradeBanner from '@/components/UpgradeBanner'
import EducationClient from '../EducationClient'
import { hasFeatureAccess } from '@/lib/features'
import { getLibraryItems } from '@/app/actions/library'
import { getResources } from '@/app/actions/resources'

export default async function CategoryPage({
  params,
}: {
  params: { categorySlug: string }
}) {
  const ctx = await getStudioId()
  if (!ctx) redirect('/auth/login')
  const { supabase, studioId, userEmail } = ctx

  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase())
  const isAdmin = !!(userEmail && adminEmails.includes(userEmail.toLowerCase()))

  const { data: studio } = await supabase
    .from('studios')
    .select('subscription_tier')
    .eq('id', studioId)
    .single()

  const tier = studio?.subscription_tier ?? 'free'
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

  const [{ data: items }, { data: resources }] = await Promise.all([
    getLibraryItems(),
    getResources(),
  ])

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <EducationClient
          items={items}
          resources={resources}
          initialCategorySlug={params.categorySlug}
        />
      </main>
    </AppShell>
  )
}
