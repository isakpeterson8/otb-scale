import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getStaffContext } from '@/lib/staff'
import AdminShell from '../AdminShell'
import WorkPlansClient, { type WorkPlanRow } from './WorkPlansClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Work Plans' }

export default async function WorkPlansPage() {
  const ctx = await getStaffContext()
  if (!ctx) redirect('/dashboard')

  // Read on the staff member's own session: RLS is the gate, so a misconfigured
  // is_staff() or a missing studios staff-SELECT policy shows an empty list
  // rather than silently succeeding through the service role.
  const { data, error } = await ctx.supabase
    .from('work_plans')
    .select('id, title, status, is_published, updated_at, studio_id, studios(name), work_plan_tasks(is_done)')
    .order('updated_at', { ascending: false })

  const plans: WorkPlanRow[] = (data ?? []).map(row => {
    const tasks = (row.work_plan_tasks ?? []) as { is_done: boolean }[]
    const studio = row.studios as unknown as { name: string } | null
    return {
      id: row.id as string,
      title: row.title as string,
      status: row.status as WorkPlanRow['status'],
      is_published: row.is_published as boolean,
      updated_at: row.updated_at as string,
      studio_name: studio?.name ?? '—',
      total_tasks: tasks.length,
      done_tasks: tasks.filter(t => t.is_done).length,
    }
  })

  return (
    <AdminShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <WorkPlansClient plans={plans} loadError={error?.message ?? null} />
      </main>
    </AdminShell>
  )
}
