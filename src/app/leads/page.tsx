import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getStudioId } from '@/app/actions/_shared'
import AppShell from '@/components/layout/AppShell'
import LeadsClient from './LeadsClient'
import type { Contact, FacebookGroup, OrganicOutreach } from '@/types/database'

export const metadata: Metadata = { title: 'Leads' }

export default async function LeadsPage() {
  const ctx = await getStudioId()
  if (!ctx) redirect('/auth/login')
  const { supabase, studioId } = ctx

  const [{ data: contacts }, { data: groups }, { data: outreach }] = await Promise.all([
    supabase
      .from('contacts')
      .select('*')
      .eq('studio_id', studioId)
      .order('created_at', { ascending: false }),
    supabase
      .from('facebook_groups')
      .select('id, group_name, is_active')
      .eq('studio_id', studioId)
      .order('group_name', { ascending: true }),
    supabase
      .from('organic_outreach')
      .select('*')
      .eq('studio_id', studioId)
      .order('last_contacted_date', { ascending: false, nullsFirst: false }),
  ])

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <LeadsClient
          contacts={(contacts ?? []) as Contact[]}
          facebookGroups={(groups ?? []) as Pick<FacebookGroup, 'id' | 'group_name' | 'is_active'>[]}
          outreachEntries={(outreach ?? []) as OrganicOutreach[]}
        />
      </main>
    </AppShell>
  )
}
