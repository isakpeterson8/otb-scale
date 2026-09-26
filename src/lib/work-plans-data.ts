/**
 * SERVER ONLY — imports the service-role client. Never import this from a
 * 'use client' module. (The pure helpers and the client column lists live in
 * lib/work-plans.ts, which is safe to import from anywhere; this file is split
 * off precisely so Sidebar.tsx can keep importing that one.)
 *
 * The single place that answers "what may this viewer see of their work plan",
 * used by both /work-plan and the sidebar nav check so the two cannot drift.
 *
 * Two read paths, one column list:
 *
 *   Real member — reads work_plans_client / work_plan_tasks_client. The views
 *     are the security boundary: they scope by current_studio_id() and cannot
 *     return internal_note or done_by because they do not select them.
 *
 *   View As — getStudioId() hands back the SERVICE-ROLE client, where
 *     auth.uid() is null, so current_studio_id() is null and both views match
 *     zero rows. Reading them while impersonating would show an empty board
 *     for every studio. So this path reads the base tables instead and applies
 *     the views' predicate by hand — same studio scope, same is_published and
 *     status='active' conditions — while selecting only CLIENT_*_COLUMNS.
 *     Service role bypasses RLS, so that column list is the only thing keeping
 *     internal_note out of an impersonated view. It is shared with the views
 *     on purpose.
 */

import { adminClient } from '@/lib/supabase/admin'
import { getStudioId } from '@/app/actions/_shared'
import { CLIENT_PLAN_COLUMNS, CLIENT_TASK_COLUMNS, CLIENT_TASK_ITEM_COLUMNS } from '@/lib/work-plans'
import type {
  ClientWorkPlan, ClientWorkPlanTask, ClientWorkPlanTaskItem, ClientWorkPlanTaskWithItems,
} from '@/types/database'

export interface ClientWorkPlanData {
  plan: ClientWorkPlan | null
  tasks: ClientWorkPlanTaskWithItems[]
  /** True while an admin is impersonating — the board renders read-only. */
  viewOnly: boolean
  /** Published active plans beyond the one shown. Surfaced so a studio that
   *  somehow has several is visible rather than silently truncated. */
  extraPublishedCount: number
  error: string | null
}

const EMPTY: ClientWorkPlanData = {
  plan: null, tasks: [], viewOnly: false, extraPublishedCount: 0, error: null,
}

/** Published + active plans visible to this viewer, most recently updated first. */
async function selectVisiblePlans(columns: string) {
  const ctx = await getStudioId()
  if (!ctx) return { rows: null, error: 'Unauthorized', viewOnly: false }

  if (ctx.viewOnly) {
    const { data, error } = await adminClient
      .from('work_plans')
      .select(columns)
      .eq('studio_id', ctx.studioId)
      .eq('is_published', true)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
    return { rows: data, error: error?.message ?? null, viewOnly: true }
  }

  const { data, error } = await ctx.supabase
    .from('work_plans_client')
    .select(columns)
    .order('updated_at', { ascending: false })
  return { rows: data, error: error?.message ?? null, viewOnly: false }
}

/**
 * Cheap existence check for the sidebar — selects one id, never task rows.
 * Under View As this reflects the VIEWED studio, so the nav item appears and
 * disappears exactly as it would for that member.
 */
export async function hasPublishedWorkPlan(): Promise<boolean> {
  const { rows } = await selectVisiblePlans('id')
  return (rows?.length ?? 0) > 0
}

/** The board's data: the newest published active plan and its tasks. */
export async function loadClientWorkPlan(): Promise<ClientWorkPlanData> {
  const { rows, error, viewOnly } = await selectVisiblePlans(CLIENT_PLAN_COLUMNS)
  if (error) return { ...EMPTY, viewOnly, error }
  if (!rows || rows.length === 0) return { ...EMPTY, viewOnly }

  // Ordered updated_at desc above, so the first row is the one to show.
  const plan = rows[0] as unknown as ClientWorkPlan
  const extraPublishedCount = rows.length - 1

  const ctx = await getStudioId()
  if (!ctx) return { ...EMPTY, viewOnly }

  const { data: taskRows, error: taskError } = ctx.viewOnly
    ? await adminClient
        .from('work_plan_tasks')
        .select(CLIENT_TASK_COLUMNS)
        .eq('work_plan_id', plan.id)
        .order('sort_order', { ascending: true })
    : await ctx.supabase
        .from('work_plan_tasks_client')
        .select(CLIENT_TASK_COLUMNS)
        .eq('work_plan_id', plan.id)
        .order('sort_order', { ascending: true })

  const tasks = (taskRows ?? []) as unknown as ClientWorkPlanTask[]
  if (tasks.length === 0) {
    return { plan, tasks: [], viewOnly, extraPublishedCount, error: taskError?.message ?? null }
  }

  // Checklist items for exactly these tasks. One query, then grouped in memory —
  // an items-per-task query would be an N+1 across a 49-step plan.
  const taskIds = tasks.map(t => t.id)
  const { data: itemRows, error: itemError } = ctx.viewOnly
    ? await adminClient
        .from('work_plan_task_items')
        .select(CLIENT_TASK_ITEM_COLUMNS)
        .in('task_id', taskIds)
        .order('sort_order', { ascending: true })
    : await ctx.supabase
        .from('work_plan_task_items_client')
        .select(CLIENT_TASK_ITEM_COLUMNS)
        .in('task_id', taskIds)
        .order('sort_order', { ascending: true })

  const byTask = new Map<string, ClientWorkPlanTaskItem[]>()
  for (const row of (itemRows ?? []) as unknown as ClientWorkPlanTaskItem[]) {
    const list = byTask.get(row.task_id)
    if (list) list.push(row)
    else byTask.set(row.task_id, [row])
  }

  return {
    plan,
    tasks: tasks.map(t => ({ ...t, items: byTask.get(t.id) ?? [] })),
    viewOnly,
    extraPublishedCount,
    error: taskError?.message ?? itemError?.message ?? null,
  }
}
