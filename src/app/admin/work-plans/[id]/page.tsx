import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getStaffContext } from '@/lib/staff'
import AdminShell from '../../AdminShell'
import WorkPlanEditorClient from './WorkPlanEditorClient'
import type { WorkPlan, WorkPlanTask } from '@/types/database'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Work Plan' }

export default async function WorkPlanEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await getStaffContext()
  if (!ctx) redirect('/dashboard')

  // Staff session throughout: if RLS denies, this 404s rather than falling back
  // to a service-role read.
  const [planRes, tasksRes] = await Promise.all([
    ctx.supabase
      .from('work_plans')
      .select('id, studio_id, template_id, title, status, is_published, created_by, created_at, updated_at, studios(name)')
      .eq('id', id)
      .maybeSingle(),
    ctx.supabase
      .from('work_plan_tasks')
      .select('*')
      .eq('work_plan_id', id)
      .order('sort_order', { ascending: true }),
  ])

  if (!planRes.data) notFound()

  const studio = planRes.data.studios as unknown as { name: string } | null

  return (
    <AdminShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <WorkPlanEditorClient
          plan={planRes.data as unknown as WorkPlan}
          studioName={studio?.name ?? '—'}
          tasks={(tasksRes.data ?? []) as WorkPlanTask[]}
          loadError={tasksRes.error?.message ?? null}
        />
      </main>
    </AdminShell>
  )
}
