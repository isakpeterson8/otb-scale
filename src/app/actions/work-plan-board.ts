'use server'

/**
 * The member side of the Work Plan board. Separate from actions/work-plans.ts,
 * which is staff-only and gated by getStaffContext().
 *
 * Every mutation here is a thin wrapper over a SECURITY DEFINER RPC. The RPCs
 * re-check studio ownership, publication, plan status and — for edits and
 * deletes — that the task was added by the client, so authorisation lives in the
 * database rather than in these functions. None of them can reach internal_note:
 * no RPC names it in a SET list.
 *
 * All of them refuse under View As. That path runs on the SERVICE-ROLE client,
 * where an admin would otherwise be writing to a client's board wearing the
 * client's identity.
 */

import { revalidatePath } from 'next/cache'
import { getStudioId } from './_shared'
import type { WorkPlanTaskStatus } from '@/types/database'

type Result = { error: string | null }

/** Shared preamble: a real member session, never View As. */
async function memberContext() {
  const ctx = await getStudioId()
  if (!ctx) return { ctx: null, error: 'Unauthorized' as const }
  if (ctx.viewOnly) return { ctx: null, error: 'View only mode' as const }
  return { ctx, error: null }
}

function done(): Result {
  revalidatePath('/work-plan')
  return { error: null }
}

// ── Moving a card ────────────────────────────────────────────────────────────

export async function setMyWorkPlanTaskStatus(
  taskId: string,
  status: WorkPlanTaskStatus,
): Promise<Result> {
  const { ctx, error } = await memberContext()
  if (!ctx) return { error }

  const { error: rpcError } = await ctx.supabase.rpc('set_work_plan_task_status', {
    p_task_id: taskId,
    p_status: status,
  })
  if (rpcError) return { error: rpcError.message }
  return done()
}

// ── Checklist ────────────────────────────────────────────────────────────────

export async function setMyWorkPlanTaskItemDone(
  itemId: string,
  isDone: boolean,
): Promise<Result> {
  const { ctx, error } = await memberContext()
  if (!ctx) return { error }

  const { error: rpcError } = await ctx.supabase.rpc('set_work_plan_task_item_done', {
    p_item_id: itemId,
    p_is_done: isDone,
  })
  if (rpcError) return { error: rpcError.message }
  return done()
}

// ── The client's own notes ───────────────────────────────────────────────────

export async function setMyWorkPlanTaskClientNote(
  taskId: string,
  note: string,
): Promise<Result> {
  const { ctx, error } = await memberContext()
  if (!ctx) return { error }

  const { error: rpcError } = await ctx.supabase.rpc('set_work_plan_task_client_note', {
    p_task_id: taskId,
    p_note: note,
  })
  if (rpcError) return { error: rpcError.message }
  // No revalidatePath: this autosaves on a keystroke debounce, and refreshing the
  // route on every save would fight the textarea for the cursor.
  return { error: null }
}

// ── The client's own tasks ───────────────────────────────────────────────────

export async function createMyWorkPlanTask(input: {
  planId: string
  title: string
  description: string
  timeframeGroup: string
}): Promise<{ id: string | null; error: string | null }> {
  const { ctx, error } = await memberContext()
  if (!ctx) return { id: null, error }

  const { data, error: rpcError } = await ctx.supabase.rpc('create_client_work_plan_task', {
    p_plan_id: input.planId,
    p_title: input.title,
    p_description: input.description,
    p_timeframe_group: input.timeframeGroup,
  })
  if (rpcError) return { id: null, error: rpcError.message }

  revalidatePath('/work-plan')
  return { id: (data as string) ?? null, error: null }
}

export async function updateMyWorkPlanTask(input: {
  taskId: string
  title: string
  description: string
  timeframeGroup: string
}): Promise<Result> {
  const { ctx, error } = await memberContext()
  if (!ctx) return { error }

  const { error: rpcError } = await ctx.supabase.rpc('update_client_work_plan_task', {
    p_task_id: input.taskId,
    p_title: input.title,
    p_description: input.description,
    p_timeframe_group: input.timeframeGroup,
  })
  if (rpcError) return { error: rpcError.message }
  return done()
}

export async function deleteMyWorkPlanTask(taskId: string): Promise<Result> {
  const { ctx, error } = await memberContext()
  if (!ctx) return { error }

  const { error: rpcError } = await ctx.supabase.rpc('delete_client_work_plan_task', {
    p_task_id: taskId,
  })
  if (rpcError) return { error: rpcError.message }
  return done()
}
