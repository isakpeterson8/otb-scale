import type { Metadata } from 'next'
import AppShell from '@/components/layout/AppShell'
import MembersOnlyCard from '@/components/live-support/MembersOnlyCard'

export const metadata: Metadata = { title: 'Live Support Sessions' }

export default async function LssUnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const { reason } = await searchParams
  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <MembersOnlyCard notSet={reason === 'not-set'} />
      </main>
    </AppShell>
  )
}
