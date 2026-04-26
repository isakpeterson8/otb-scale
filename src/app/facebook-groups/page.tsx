import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'
import FacebookGroupsClient from './FacebookGroupsClient'
import type { FacebookGroup } from '@/types/database'

export default async function FacebookGroupsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data } = await supabase
    .from('facebook_groups')
    .select('*')
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
