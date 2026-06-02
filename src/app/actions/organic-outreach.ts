'use server'

import { revalidatePath } from 'next/cache'
import { getStudioId } from './_shared'

export async function createOrganicOutreach(formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const { error } = await supabase.from('organic_outreach').insert({
    studio_id: studioId,
    name: formData.get('name') as string,
    type: formData.get('type') as string,
    contact_info: (formData.get('contact_info') as string) || null,
    last_contacted_date: (formData.get('last_contacted_date') as string) || null,
    notes: (formData.get('notes') as string) || null,
    status: (formData.get('status') as string) || 'Active',
  })

  if (error) return { error: error.message }

  revalidatePath('/leads')
  return { error: null }
}

export async function updateOrganicOutreach(id: string, formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase } = ctx

  const { error } = await supabase
    .from('organic_outreach')
    .update({
      name: formData.get('name') as string,
      type: formData.get('type') as string,
      contact_info: (formData.get('contact_info') as string) || null,
      last_contacted_date: (formData.get('last_contacted_date') as string) || null,
      notes: (formData.get('notes') as string) || null,
      status: (formData.get('status') as string) || 'Active',
    })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/leads')
  return { error: null }
}

export async function deleteOrganicOutreach(id: string) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase } = ctx

  const { error } = await supabase.from('organic_outreach').delete().eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/leads')
  return { error: null }
}
