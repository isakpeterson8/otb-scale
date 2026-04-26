'use server'

import { revalidatePath } from 'next/cache'
import { getStudioId } from './_shared'

export async function createPipelineEvent(formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  const { supabase, studioId } = ctx

  const { error } = await supabase.from('pipeline_events').insert({
    studio_id: studioId,
    contact_id: formData.get('contact_id') as string,
    stage: formData.get('stage') as string,
    notes: (formData.get('notes') as string) || null,
    event_date: (formData.get('event_date') as string) || new Date().toISOString(),
  })

  if (error) return { error: error.message }

  revalidatePath('/pipeline')
  return { error: null }
}

export async function updatePipelineEvent(id: string, formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  const { supabase } = ctx

  const { error } = await supabase
    .from('pipeline_events')
    .update({
      stage: formData.get('stage') as string,
      notes: (formData.get('notes') as string) || null,
      event_date: (formData.get('event_date') as string) || new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/pipeline')
  return { error: null }
}

export async function deletePipelineEvent(id: string) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  const { supabase } = ctx

  const { error } = await supabase.from('pipeline_events').delete().eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/pipeline')
  return { error: null }
}
