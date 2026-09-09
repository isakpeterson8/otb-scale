'use server'

import { revalidatePath } from 'next/cache'
import { getStaffContext } from '@/lib/staff'
import type { MilestoneTag, WorkPlanLink, WorkPlanStatus } from '@/types/database'

/**
 * Every action here runs on the staff member's own request-scoped client, so
 * RLS (is_staff) is the gate. None of them may reach for the service role.
 */

type Result = { error: string | null }

export interface TaskInput {
  title: string
  description: string | null
  internal_note: string | null
  timeframe_group: string
  week_number: number | null
  is_recurring: boolean
  starts_after_week: number | null
  milestone_tag: MilestoneTag
  links: WorkPlanLink[]
}

function revalidatePlan(planId?: string) {
  revalidatePath('/admin/work-plans')
  if (planId) revalidatePath(`/admin/work-plans/${planId}`)
}

// ── Plans ────────────────────────────────────────────────────────────────────

/** Clone a template onto a studio. Returns the new plan id for the redirect. */
export async function createWorkPlanFromTemplate(
  templateId: string,
  studioId: string,
): Promise<{ id: string | null; error: string | null }> {
  const ctx = await getStaffContext()
  if (!ctx) return { id: null, error: 'Unauthorized' }

  // The RPC is SECURITY DEFINER and re-checks is_staff internally, so the clone
  // is atomic without this client needing insert rights on every row.
  const { data, error } = await ctx.supabase.rpc('create_work_plan_from_template', {
    p_template_id: templateId,
    p_studio_id: studioId,
  })
  if (error) return { id: null, error: error.message }

  revalidatePlan()
  return { id: data as string, error: null }
}

export async function createBlankWorkPlan(
  studioId: string,
  title: string,
): Promise<{ id: string | null; error: string | null }> {
  const ctx = await getStaffContext()
  if (!ctx) return { id: null, error: 'Unauthorized' }

  const { data, error } = await ctx.supabase
    .from('work_plans')
    .insert({ studio_id: studioId, title, created_by: ctx.userId })
    .select('id')
    .single()
  if (error) return { id: null, error: error.message }

  revalidatePlan()
  return { id: data.id as string, error: null }
}

export async function updateWorkPlan(
  id: string,
  patch: { title?: string; status?: WorkPlanStatus; is_published?: boolean },
): Promise<Result> {
  const ctx = await getStaffContext()
  if (!ctx) return { error: 'Unauthorized' }

  const { error } = await ctx.supabase.from('work_plans').update(patch).eq('id', id)
  if (error) return { error: error.message }

  revalidatePlan(id)
  return { error: null }
}

export async function deleteWorkPlan(id: string): Promise<Result> {
  const ctx = await getStaffContext()
  if (!ctx) return { error: 'Unauthorized' }

  const { error } = await ctx.supabase.from('work_plans').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePlan()
  return { error: null }
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export async function createWorkPlanTask(planId: string, input: TaskInput): Promise<Result> {
  const ctx = await getStaffContext()
  if (!ctx) return { error: 'Unauthorized' }

  // Append to the end of its group rather than colliding on sort_order 0.
  const { data: last } = await ctx.supabase
    .from('work_plan_tasks')
    .select('sort_order')
    .eq('work_plan_id', planId)
    .eq('timeframe_group', input.timeframe_group)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await ctx.supabase
    .from('work_plan_tasks')
    .insert({ ...input, work_plan_id: planId, sort_order: (last?.sort_order ?? 0) + 1 })
  if (error) return { error: error.message }

  revalidatePlan(planId)
  return { error: null }
}

export async function updateWorkPlanTask(
  planId: string,
  taskId: string,
  input: TaskInput,
): Promise<Result> {
  const ctx = await getStaffContext()
  if (!ctx) return { error: 'Unauthorized' }

  const { error } = await ctx.supabase.from('work_plan_tasks').update(input).eq('id', taskId)
  if (error) return { error: error.message }

  revalidatePlan(planId)
  return { error: null }
}

export async function deleteWorkPlanTask(planId: string, taskId: string): Promise<Result> {
  const ctx = await getStaffContext()
  if (!ctx) return { error: 'Unauthorized' }

  const { error } = await ctx.supabase.from('work_plan_tasks').delete().eq('id', taskId)
  if (error) return { error: error.message }

  revalidatePlan(planId)
  return { error: null }
}

/** Team check-in toggle. Phase 1 stamps the staff member into done_by. */
export async function setWorkPlanTaskDone(
  planId: string,
  taskId: string,
  isDone: boolean,
): Promise<Result> {
  const ctx = await getStaffContext()
  if (!ctx) return { error: 'Unauthorized' }

  const { error } = await ctx.supabase
    .from('work_plan_tasks')
    .update({
      is_done: isDone,
      done_at: isDone ? new Date().toISOString() : null,
      done_by: isDone ? ctx.userId : null,
    })
    .eq('id', taskId)
  if (error) return { error: error.message }

  revalidatePlan(planId)
  return { error: null }
}

/**
 * Renumber sort_order 0..n-1 within one timeframe_group after a drag.
 * Ids are re-read scoped to this plan and group first, so a forged id from
 * another plan cannot be renumbered through this action.
 */
export async function reorderWorkPlanTasks(
  planId: string,
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
    .from('work_plan_tasks')
    .select('id')
    .eq('work_plan_id', planId)
    .eq('timeframe_group', timeframeGroup)
    .in('id', orderedTaskIds)
  if (ownershipError) return { error: ownershipError.message }
  if ((owned?.length ?? 0) !== orderedTaskIds.length) {
    return { error: 'The task list changed — reload and try again' }
  }

  const results = await Promise.all(
    orderedTaskIds.map((id, index) =>
      ctx.supabase
        .from('work_plan_tasks')
        .update({ sort_order: index })
        .eq('id', id)
        .eq('work_plan_id', planId),
    ),
  )
  const failed = results.find(r => r.error)
  if (failed?.error) return { error: failed.error.message }

  revalidatePlan(planId)
  return { error: null }
}
