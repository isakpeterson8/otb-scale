'use server'

import { revalidatePath } from 'next/cache'
import { getStudioId } from './_shared'

export async function createTemplate(formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  const { supabase, studioId } = ctx

  const { error } = await supabase.from('email_templates').insert({
    studio_id: studioId,
    name: formData.get('name') as string,
    subject: formData.get('subject') as string,
    body: formData.get('body') as string,
  })

  if (error) return { error: error.message }

  revalidatePath('/emails')
  return { error: null }
}

export async function updateTemplate(id: string, formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  const { supabase } = ctx

  const { error } = await supabase
    .from('email_templates')
    .update({
      name: formData.get('name') as string,
      subject: formData.get('subject') as string,
      body: formData.get('body') as string,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/emails')
  return { error: null }
}

export async function deleteTemplate(id: string) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  const { supabase } = ctx

  const { error } = await supabase.from('email_templates').delete().eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/emails')
  return { error: null }
}

export async function updateCadenceItem(id: string, status: string) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  const { supabase } = ctx

  const { error } = await supabase
    .from('cadence_queue')
    .update({ status })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/emails')
  return { error: null }
}
