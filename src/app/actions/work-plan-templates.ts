'use server'

import { revalidatePath } from 'next/cache'
import { getStaffContext } from '@/lib/staff'
import type { TaskInput } from '@/app/actions/work-plans'

/**
 * Template CRUD. Like the plan actions, everything runs on the staff member's
 * own request-scoped client so RLS is the gate — never the service role. The
 * seed script is the only sanctioned bypass, and it only writes the standard
 * template.
 */

type Result = { error: string | null }

const TEMPLATES_PATH = '/admin/work-plans/templates'

export async function createWorkPlanTemplate(
  name: string,
  description: string | null,
): Promise<{ id: string | null; error: string | null }> {
  const ctx = await getStaffContext()
  if (!ctx) return { id: null, error: 'Unauthorized' }

  const { data, error } = await ctx.supabase
    .from('work_plan_templates')
    .insert({ name, description })
    .select('id')
    .single()
  if (error) return { id: null, error: error.message }

  revalidatePath(TEMPLATES_PATH)
  return { id: data.id as string, error: null }
}

export async function updateWorkPlanTemplate(
  id: string,
  patch: { name?: string; description?: string | null; is_active?: boolean },
): Promise<Result> {
  const ctx = await getStaffContext()
  if (!ctx) return { error: 'Unauthorized' }

  const { error } = await ctx.supabase.from('work_plan_templates').update(patch).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(TEMPLATES_PATH)
  return { error: null }
}

/**
 * Deleting a template cascades its tasks. Existing work_plans keep working:
 * their template_id is ON DELETE SET NULL and their tasks were copied, not
 * referenced.
 */
export async function deleteWorkPlanTemplate(id: string): Promise<Result> {
  const ctx = await getStaffContext()
  if (!ctx) return { error: 'Unauthorized' }

  const { error } = await ctx.supabase.from('work_plan_templates').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(TEMPLATES_PATH)
  return { error: null }
}

export async function createTemplateTask(templateId: string, input: TaskInput): Promise<Result> {
  const ctx = await getStaffContext()
  if (!ctx) return { error: 'Unauthorized' }

  const { data: last } = await ctx.supabase
    .from('work_plan_template_tasks')
    .select('sort_order')
    .eq('template_id', templateId)
    .eq('timeframe_group', input.timeframe_group)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await ctx.supabase
    .from('work_plan_template_tasks')
    .insert({ ...input, template_id: templateId, sort_order: (last?.sort_order ?? 0) + 1 })
  if (error) return { error: error.message }

  revalidatePath(TEMPLATES_PATH)
  return { error: null }
}

export async function updateTemplateTask(taskId: string, input: TaskInput): Promise<Result> {
  const ctx = await getStaffContext()
  if (!ctx) return { error: 'Unauthorized' }

  const { error } = await ctx.supabase.from('work_plan_template_tasks').update(input).eq('id', taskId)
  if (error) return { error: error.message }

  revalidatePath(TEMPLATES_PATH)
  return { error: null }
}

export async function deleteTemplateTask(taskId: string): Promise<Result> {
  const ctx = await getStaffContext()
  if (!ctx) return { error: 'Unauthorized' }

  const { error } = await ctx.supabase.from('work_plan_template_tasks').delete().eq('id', taskId)
  if (error) return { error: error.message }

  revalidatePath(TEMPLATES_PATH)
  return { error: null }
}

/** Same ownership re-check as the plan reorder: ids are scoped before writing. */
export async function reorderTemplateTasks(
  templateId: string,
  timeframeGroup: string,
  orderedTaskIds: string[],
): Promise<Result> {
  const ctx = await getStaffContext()
  if (!ctx) return { error: 'Unauthorized' }
  if (orderedTaskIds.length === 0) return { error: null }
  if (new Set(orderedTaskIds).size !== orderedTaskIds.length) {
    return { error: 'Duplicate tasks in the new order' }
  }

  const { data: owned, error: ownershipError } = await ctx.supabase
    .from('work_plan_template_tasks')
    .select('id')
    .eq('template_id', templateId)
    .eq('timeframe_group', timeframeGroup)
    .in('id', orderedTaskIds)
  if (ownershipError) return { error: ownershipError.message }
  if ((owned?.length ?? 0) !== orderedTaskIds.length) {
    return { error: 'The task list changed — reload and try again' }
  }

  const results = await Promise.all(
    orderedTaskIds.map((id, index) =>
      ctx.supabase
        .from('work_plan_template_tasks')
        .update({ sort_order: index })
        .eq('id', id)
        .eq('template_id', templateId),
    ),
  )
  const failed = results.find(r => r.error)
  if (failed?.error) return { error: failed.error.message }

  revalidatePath(TEMPLATES_PATH)
  return { error: null }
}
