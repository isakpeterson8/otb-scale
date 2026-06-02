import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getStudioId } from '@/app/actions/_shared'
import { getMyCanvaRequests } from '@/app/actions/canva-edits'
import AppShell from '@/components/layout/AppShell'
import CanvaEditsClient from './CanvaEditsClient'

export const metadata: Metadata = { title: 'Canva Edits' }

export default async function CanvaEditsPage() {
  const [ctx, requests] = await Promise.all([getStudioId(), getMyCanvaRequests()])
  if (!ctx) redirect('/auth/login')

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <CanvaEditsClient existingRequests={requests} />
      </main>
    </AppShell>
  )
}
