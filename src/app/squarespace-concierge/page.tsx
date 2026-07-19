import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getStudioId } from '@/app/actions/_shared'
import { getMySquarespaceRequests, getMySquaresspaceSites } from '@/app/actions/squarespace-concierge'
import AppShell from '@/components/layout/AppShell'
import SquarespaceConciergClient from './SquarespaceConciergClient'

export const metadata: Metadata = { title: 'Squarespace Concierge' }

export default async function SquarespaceConciergePage() {
  const [ctx, requests, mySites] = await Promise.all([
    getStudioId(),
    getMySquarespaceRequests(),
    getMySquaresspaceSites(),
  ])
  if (!ctx) redirect('/auth/login')

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <SquarespaceConciergClient existingRequests={requests} mySites={mySites} />
      </main>
    </AppShell>
  )
}
