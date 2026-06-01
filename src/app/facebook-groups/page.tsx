import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getStudioId } from '@/app/actions/_shared'
import AppShell from '@/components/layout/AppShell'
import UpgradeBanner from '@/components/UpgradeBanner'
import FacebookGroupsClient from './FacebookGroupsClient'
import { hasFeatureAccess } from '@/lib/features'
import type { FacebookGroup, GroupPostCompletion, GroupPostAsset } from '@/types/database'

export const metadata: Metadata = { title: 'Facebook Groups' }

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

  if (!hasAccess) {
    return (
      <AppShell>
        <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
          <h2 className="text-2xl text-[var(--ink)] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
            Facebook Groups
          </h2>
          <UpgradeBanner feature="Facebook Groups" />
        </main>
      </AppShell>
    )
  }

  const today = new Date().toISOString().slice(0, 10)

  const [
    { data: groupsRaw },
    { data: todayCompletionsRaw },
    { data: allCompletionsRaw },
    { data: assetsRaw },
  ] = await Promise.all([
    supabase
      .from('facebook_groups')
      .select('*')
      .eq('studio_id', studioId)
      .order('group_name', { ascending: true }),
    supabase
      .from('group_post_completions')
      .select('*')
      .eq('studio_id', studioId)
      .eq('date', today),
    supabase
      .from('group_post_completions')
      .select('group_id, last_used_asset_id, likes, comments, dms, created_at')
      .eq('studio_id', studioId)
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase
      .from('group_post_assets')
      .select('*')
      .order('created_at', { ascending: true }),
  ])

  const groups = (groupsRaw ?? []) as FacebookGroup[]
  const todayCompletions = (todayCompletionsRaw ?? []) as GroupPostCompletion[]
  const allCompletions = (allCompletionsRaw ?? []) as {
    group_id: string
    last_used_asset_id: string | null
    likes: number
    comments: number
    dms: number
    created_at: string
  }[]
  const assets = (assetsRaw ?? []) as GroupPostAsset[]

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <FacebookGroupsClient
          groups={groups}
          todayCompletions={todayCompletions}
          allCompletions={allCompletions}
          assets={assets}
        />
      </main>
    </AppShell>
  )
}
