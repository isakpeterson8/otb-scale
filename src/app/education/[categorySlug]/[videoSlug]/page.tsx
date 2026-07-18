import { redirect } from 'next/navigation'
import { getStudioId } from '@/app/actions/_shared'
import AppShell from '@/components/layout/AppShell'
import UpgradeBanner from '@/components/UpgradeBanner'
import EducationClient from '../../EducationClient'
import { hasFeatureAccess } from '@/lib/features'
import { getCachedStudioTier } from '@/lib/supabase/cached'
import { getLibraryItems } from '@/app/actions/library'

export default async function VideoDeepLinkPage({
  params,
}: {
  params: Promise<{ categorySlug: string; videoSlug: string }>
}) {
  const { categorySlug, videoSlug } = await params
  const ctx = await getStudioId()
  if (!ctx) redirect('/auth/login')
  const { userEmail } = ctx

  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase())
  const isAdmin = !!(userEmail && adminEmails.includes(userEmail.toLowerCase()))

  const tier = await getCachedStudioTier(ctx.studioId)
  const hasAccess = isAdmin || hasFeatureAccess(tier, 'education_library')

  const { data: items } = await getLibraryItems()

  const video = (items ?? []).find(
    i => i.slug === videoSlug && i.category === categorySlug
  )

  if (!video) {
    redirect('/education/videos?error=not-found')
  }

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

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <EducationClient
          items={items ?? []}
          initialVideoId={video.id}
          initialCategorySlug={categorySlug}
        />
      </main>
    </AppShell>
  )
}
