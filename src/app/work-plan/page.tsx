import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { loadClientWorkPlan } from '@/lib/work-plans-data'
import WorkPlanBoardClient from './WorkPlanBoardClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Work Plan' }

export default async function WorkPlanPage() {
  // Visibility is publication, not tier: no ACCESS_MATRIX entry and no proxy
  // route block. A studio sees this page exactly when it has a published,
  // active plan — which is also precisely when the sidebar link appears.
  const { plan, tasks, viewOnly, extraPublishedCount, educationTitles, error } = await loadClientWorkPlan()

  if (!plan) redirect('/dashboard')

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <WorkPlanBoardClient
          plan={plan}
          tasks={tasks}
          viewOnly={viewOnly}
          extraPublishedCount={extraPublishedCount}
          educationTitles={educationTitles}
          loadError={error}
        />
      </main>
    </AppShell>
  )
}
