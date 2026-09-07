import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getStudioId } from '@/app/actions/_shared'
import AppShell from '@/components/layout/AppShell'
import WaitlistClient from './WaitlistClient'
import type { Contact } from '@/types/database'
import { WAITLIST_STATUS } from '@/types/database'

export const metadata: Metadata = { title: 'Waitlist' }

export default async function WaitlistPage() {
  const ctx = await getStudioId()
  if (!ctx) redirect('/auth/login')
  const { supabase, studioId } = ctx

  // Ranked leads first, then unranked (a newly waitlisted lead has no rank and
  // sits at the bottom until dragged). Name A–Z is the tiebreaker: updated_at is
  // not maintained in this repo, so it would only reproduce creation order.
  const [waitlistRes, leadsCountRes, outreachCountRes] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, name, email, phone, status, waitlist_rank, created_at')
      .eq('studio_id', studioId)
      .eq('status', WAITLIST_STATUS)
      .order('waitlist_rank', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true }),
    supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId),
    supabase
      .from('organic_outreach')
      .select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId),
  ])

  const waitlist = (waitlistRes.data ?? []) as WaitlistLead[]

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <WaitlistClient
          leads={waitlist}
          counts={{
            leads: leadsCountRes.count ?? 0,
            outreach: outreachCountRes.count ?? 0,
            waitlist: waitlist.length,
          }}
        />
      </main>
    </AppShell>
  )
}

type WaitlistLead = Pick<Contact, 'id' | 'name' | 'email' | 'phone' | 'status' | 'waitlist_rank' | 'created_at'>
