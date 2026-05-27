import { redirect } from 'next/navigation'
import { getStudioId } from '@/app/actions/_shared'
import AppShell from '@/components/layout/AppShell'
import ResourcesClient from './ResourcesClient'
import { getResources } from '@/app/actions/resources'

export default async function ResourcesPage() {
  const ctx = await getStudioId()
  if (!ctx) redirect('/auth/login')

  const { data: resources } = await getResources()

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <ResourcesClient resources={resources} />
      </main>
    </AppShell>
  )
}
