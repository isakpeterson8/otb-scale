'use server'

import { revalidatePath } from 'next/cache'
import { getStudioId } from './_shared'
import type { StudioSnapshot } from '@/types/database'

type SnapshotFields = Partial<Omit<StudioSnapshot, 'id' | 'studio_id' | 'created_at'>>

export async function createSnapshot(data: SnapshotFields): Promise<{ data: StudioSnapshot | null; error: string | null }> {
  const ctx = await getStudioId()
  if (!ctx) return { data: null, error: 'Unauthorized' }
  if (ctx.viewOnly) return { data: null, error: 'View only mode' }
  const { supabase, studioId } = ctx

  const { data: created, error } = await supabase
    .from('studio_snapshots')
    .insert({ studio_id: studioId, ...data })
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  revalidatePath('/financials')
  return { data: created as StudioSnapshot, error: null }
}

export async function updateSnapshot(id: string, data: SnapshotFields): Promise<{ error: string | null }> {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const { error } = await supabase
    .from('studio_snapshots')
    .update(data)
    .eq('id', id)
    .eq('studio_id', studioId)

  if (error) return { error: error.message }
  revalidatePath('/financials')
  return { error: null }
}

export async function deleteSnapshot(id: string): Promise<{ error: string | null }> {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const { error } = await supabase
    .from('studio_snapshots')
    .delete()
    .eq('id', id)
    .eq('studio_id', studioId)

  if (error) return { error: error.message }
  revalidatePath('/financials')
  return { error: null }
}
