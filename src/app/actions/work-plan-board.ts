'use server'

/**
 * The member side of the Work Plan board. Separate from actions/work-plans.ts,
 * which is staff-only and gated by getStaffContext().
 *
 * There is exactly one mutation here, and it goes through the same
 * set_work_plan_task_status RPC the admin editor uses. The RPC re-checks
 * ownership, publication and plan status in the database, so this action is a
 * thin caller rather than the place authorisation lives.
 */

import { revalidatePath } from 'next/cache'
import { getStudioId } from './_shared'
import type { WorkPlanTaskStatus } from '@/types/database'

export async function setMyWorkPlanTaskStatus(
  taskId: string,
  status: WorkPlanTaskStatus,
): Promise<{ error: string | null }> {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }

  // View As is read-only across the app, and the board disables dragging while
  // impersonating. This refuses the write even if that UI guard is bypassed —
  // important here because under View As ctx.supabase is the SERVICE-ROLE
  // client, so an admin would otherwise be writing to a client's board while
  // wearing their identity.
  if (ctx.viewOnly) return { error: 'View only mode' }

  const { error } = await ctx.supabase.rpc('set_work_plan_task_status', {
    p_task_id: taskId,
    p_status: status,
  })
  if (error) return { error: error.message }

  revalidatePath('/work-plan')
  return { error: null }
}
