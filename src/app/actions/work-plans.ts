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
 * The row shape a timeframe_group implies. Week 1-6 are one-time launch-sprint
 * tasks; Weekly/Monthly/Semester are recurring cadences. Returns null for a
 * group outside the standard set, meaning "leave week_number and is_recurring
 * alone" rather than guessing.
 */
function shapeForGroup(group: string): { week_number: number | null; is_recurring: boolean } | null {
  const week = group.match(/^Week (\d+)$/)
  if (week) return { week_number: Number(week[1]), is_recurring: false }
  if (group === 'Weekly' || group === 'Monthly' || group === 'Semester') {
    return { week_number: null, is_recurring: true }
  }
  return null
}

/**
 * Move a task into a different timeframe_group and renumber both groups.
 *
 * `orderedTargetIds` is the target group including the moved task in its new
 * position; `orderedSourceIds` is the source group without it, which closes the
 * gap left behind. Both are re-read scoped to this plan before anything is
 * written, so ids from another plan cannot be renumbered through this action.
 */
export async function moveWorkPlanTaskToGroup(
  planId: string,
  taskId: string,
  targetGroup: string,
  orderedTargetIds: string[],
  orderedSourceIds: string[],
): Promise<Result> {
  const ctx = await getStaffContext()
  if (!ctx) return { error: 'Unauthorized' }

  const allIds = [...new Set([...orderedTargetIds, ...orderedSourceIds])]
  if (!orderedTargetIds.includes(taskId)) {
    return { error: 'The moved task is missing from the target order' }
  }
  if (allIds.length !== orderedTargetIds.length + orderedSourceIds.length) {
    return { error: 'Duplicate tasks in the new order' }
  }

  const { data: owned, error: ownershipError } = await ctx.supabase
    .from('work_plan_tasks')
    .select('id')
    .eq('work_plan_id', planId)
    .in('id', allIds)
  if (ownershipError) return { error: ownershipError.message }
  if ((owned?.length ?? 0) !== allIds.length) {
    return { error: 'The task list changed — reload and try again' }
  }

  // Group first, so week_number/is_recurring cannot be left describing the old
  // group if a later renumber fails.
  const shape = shapeForGroup(targetGroup)
  const { error: moveError } = await ctx.supabase
    .from('work_plan_tasks')
    .update({ timeframe_group: targetGroup, ...(shape ?? {}) })
    .eq('id', taskId)
    .eq('work_plan_id', planId)
  if (moveError) return { error: moveError.message }

  const renumber = (ids: string[]) =>
    ids.map((id, index) =>
      ctx.supabase
        .from('work_plan_tasks')
        .update({ sort_order: index })
        .eq('id', id)
        .eq('work_plan_id', planId),
    )

  const results = await Promise.all([...renumber(orderedTargetIds), ...renumber(orderedSourceIds)])
  const failed = results.find(r => r.error)
  if (failed?.error) return { error: failed.error.message }

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
