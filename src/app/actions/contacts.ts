'use server'

import { revalidatePath } from 'next/cache'
import { getStudioId } from './_shared'

export async function createContact(formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const { error } = await supabase.from('contacts').insert({
    studio_id: studioId,
    name: formData.get('name') as string,
    email: (formData.get('email') as string) || null,
    phone: (formData.get('phone') as string) || null,
    status: (formData.get('status') as string) || 'prospect',
    notes: (formData.get('notes') as string) || null,
  })

  if (error) return { error: error.message }

  revalidatePath('/contacts')
  return { error: null }
}

export async function updateContact(id: string, formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase } = ctx

  const { error } = await supabase
    .from('contacts')
    .update({
      name: formData.get('name') as string,
      email: (formData.get('email') as string) || null,
      phone: (formData.get('phone') as string) || null,
      status: (formData.get('status') as string) || 'prospect',
      notes: (formData.get('notes') as string) || null,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/contacts')
  return { error: null }
}

export async function deleteContact(id: string) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase } = ctx

  const { error } = await supabase.from('contacts').delete().eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/contacts')
  revalidatePath('/pipeline')
  return { error: null }
}
