import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getStaffContext } from '@/lib/staff'
import AdminShell from '../../AdminShell'
import TemplatesClient from './TemplatesClient'
import type {
  WorkPlanTemplate, WorkPlanTemplateTask, WorkPlanTemplateTaskItem,
} from '@/types/database'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Work Plan Templates' }

export default async function WorkPlanTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>
}) {
  const { template } = await searchParams
  const ctx = await getStaffContext()
  if (!ctx) redirect('/dashboard')

  // Staff session, RLS as the gate — same as every other work plan surface.
  const { data: templates, error } = await ctx.supabase
    .from('work_plan_templates')
    .select('*')
    .order('name', { ascending: true })

  const list = (templates ?? []) as WorkPlanTemplate[]
  const selectedId = template && list.some(t => t.id === template) ? template : list[0]?.id ?? null

  let tasks: WorkPlanTemplateTask[] = []
  if (selectedId) {
    const { data } = await ctx.supabase
      .from('work_plan_template_tasks')
      .select('*')
      .eq('template_id', selectedId)
      .order('sort_order', { ascending: true })
    tasks = (data ?? []) as WorkPlanTemplateTask[]
  }

  // Checklist items for these template tasks, in one query.
  const itemsByTask: Record<string, WorkPlanTemplateTaskItem[]> = {}
  if (tasks.length > 0) {
    const { data: itemRows } = await ctx.supabase
      .from('work_plan_template_task_items')
      .select('*')
      .in('template_task_id', tasks.map(t => t.id))
      .order('sort_order', { ascending: true })
    for (const row of (itemRows ?? []) as WorkPlanTemplateTaskItem[]) {
      ;(itemsByTask[row.template_task_id] ??= []).push(row)
    }
  }

  return (
    <AdminShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <TemplatesClient
          templates={list}
          selectedId={selectedId}
          tasks={tasks}
          itemsByTask={itemsByTask}
          loadError={error?.message ?? null}
        />
      </main>
    </AdminShell>
  )
}
