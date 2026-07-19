import type { Metadata } from 'next'
import { getAllRequests, getAllSites } from '@/app/actions/squarespace-concierge'
import AppShell from '@/components/layout/AppShell'
import ConciergeAdminClient from './ConciergeAdminClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Concierge Pipeline' }

export default async function ConciergePipelinePage() {
  const [requests, sites] = await Promise.all([getAllRequests(), getAllSites()])

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <ConciergeAdminClient requests={requests} allSites={sites} />
      </main>
    </AppShell>
  )
}
