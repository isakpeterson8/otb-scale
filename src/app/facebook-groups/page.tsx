import { redirect } from 'next/navigation'
import { getStudioId } from '@/app/actions/_shared'
import AppShell from '@/components/layout/AppShell'
import FacebookGroupsClient from './FacebookGroupsClient'
import type { FacebookGroup } from '@/types/database'

export default async function FacebookGroupsPage() {
  const ctx = await getStudioId()
  if (!ctx) redirect('/auth/login')
  const { supabase, studioId } = ctx

  const { data } = await supabase
    .from('facebook_groups')
    .select('*')
    .eq('studio_id', studioId)
    .order('group_name', { ascending: true })

  const groups = (data ?? []) as FacebookGroup[]

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <FacebookGroupsClient groups={groups} />
      </main>
    </AppShell>
  )
}
