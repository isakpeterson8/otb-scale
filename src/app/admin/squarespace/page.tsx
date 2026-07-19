import type { Metadata } from 'next'
import { getAllSites, getSyncLog } from '@/app/actions/squarespace-concierge'
import AppShell from '@/components/layout/AppShell'
import SquarespaceRegistryClient from './SquarespaceRegistryClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Squarespace Sites Registry' }

export default async function SquarespaceRegistryPage() {
  const [sites, syncLog] = await Promise.all([getAllSites(), getSyncLog()])

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <SquarespaceRegistryClient sites={sites} syncLog={syncLog} />
      </main>
    </AppShell>
  )
}
