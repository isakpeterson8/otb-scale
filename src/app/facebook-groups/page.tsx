import { redirect } from 'next/navigation'
import { getStudioId } from '@/app/actions/_shared'
import AppShell from '@/components/layout/AppShell'
import UpgradeBanner from '@/components/UpgradeBanner'
import FacebookGroupsClient from './FacebookGroupsClient'
import { hasFeatureAccess } from '@/lib/features'
import type { FacebookGroup } from '@/types/database'

export default async function FacebookGroupsPage() {
  const ctx = await getStudioId()
  if (!ctx) redirect('/auth/login')
  const { supabase, studioId, isAdmin: ctxIsAdmin, userEmail } = ctx

  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase())
  const isAdmin = ctxIsAdmin || !!(userEmail && adminEmails.includes(userEmail.toLowerCase()))

  const { data: studio } = await supabase
    .from('studios')
    .select('subscription_tier')
    .eq('id', studioId)
    .single()

  const tier = studio?.subscription_tier ?? 'free'
  const hasAccess = isAdmin || hasFeatureAccess(tier, 'facebook_groups')

  const groups: FacebookGroup[] = hasAccess
    ? ((await supabase
        .from('facebook_groups')
        .select('*')
        .eq('studio_id', studioId)
        .order('group_name', { ascending: true })).data ?? []) as FacebookGroup[]
    : []

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        {hasAccess ? (
          <FacebookGroupsClient groups={groups} />
        ) : (
          <>
            <h2 className="text-2xl text-[var(--ink)] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
              Facebook Groups
            </h2>
            <UpgradeBanner feature="Facebook Groups" />
          </>
        )}
      </main>
    </AppShell>
  )
}
