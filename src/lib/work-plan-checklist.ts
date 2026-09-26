import type { ChecklistInput } from '@/types/database'

/**
 * NOT a server action. Deliberately outside actions/*.ts: every export from a
 * 'use server' module becomes a public endpoint, and this takes a Supabase
 * client as an argument — it belongs to the caller's request, not to the wire.
 */
/**
 * Reconcile a task's checklist against `next`, preserving is_done on rows that
 * survive. Shared by the plan and template task writers.
 */
export async function syncChecklist(
  supabase: { from: (t: string) => any },  // eslint-disable-line @typescript-eslint/no-explicit-any
  table: 'work_plan_task_items' | 'work_plan_template_task_items',
  parentColumn: 'task_id' | 'template_task_id',
  parentId: string,
  next: ChecklistInput[],
): Promise<string | null> {
  const clean = next
    .map((i, index) => ({ ...i, title: i.title.trim(), sort_order: index }))
    .filter(i => i.title.length > 0)

  const { data: existing, error: readError } = await supabase
    .from(table).select('id').eq(parentColumn, parentId)
  if (readError) return readError.message

  const existingIds = new Set(((existing ?? []) as { id: string }[]).map(r => r.id))
  const keptIds = new Set(clean.map(i => i.id).filter((id): id is string => id !== null))

  // Removed rows first, so a re-used title cannot collide on sort_order.
  const toDelete = [...existingIds].filter(id => !keptIds.has(id))
  if (toDelete.length > 0) {
    const { error } = await supabase.from(table).delete().in('id', toDelete)
    if (error) return error.message
  }

  for (const item of clean) {
    if (item.id && existingIds.has(item.id)) {
      const { error } = await supabase
        .from(table).update({ title: item.title, sort_order: item.sort_order }).eq('id', item.id)
      if (error) return error.message
    } else {
      const { error } = await supabase
        .from(table).insert({ [parentColumn]: parentId, title: item.title, sort_order: item.sort_order })
      if (error) return error.message
    }
  }
  return null
}
