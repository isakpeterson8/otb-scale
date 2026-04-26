'use server'

import { revalidatePath } from 'next/cache'
import { getStudioId } from './_shared'

export async function createSchoolOutreach(formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  const { supabase, studioId } = ctx

  const probRaw = formData.get('probability') as string
  const progRaw = formData.get('progress') as string

  const { error } = await supabase.from('school_outreach').insert({
    studio_id: studioId,
    school_name: formData.get('school_name') as string,
    contact_name: (formData.get('contact_name') as string) || null,
    email: (formData.get('email') as string) || null,
    phone: (formData.get('phone') as string) || null,
    stage: (formData.get('stage') as string) || 'lead',
    first_contact_date: (formData.get('first_contact_date') as string) || null,
    last_interacted_date: (formData.get('last_interacted_date') as string) || null,
    next_step: (formData.get('next_step') as string) || null,
    next_step_due_date: (formData.get('next_step_due_date') as string) || null,
    probability: probRaw ? parseInt(probRaw, 10) : null,
    progress: progRaw ? parseInt(progRaw, 10) : null,
    notes: (formData.get('notes') as string) || null,
  })

  if (error) return { error: error.message }
  revalidatePath('/school-outreach')
  return { error: null }
}

export async function updateSchoolOutreach(id: string, formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  const { supabase } = ctx

  const probRaw = formData.get('probability') as string
  const progRaw = formData.get('progress') as string

  const { error } = await supabase
    .from('school_outreach')
    .update({
      school_name: formData.get('school_name') as string,
      contact_name: (formData.get('contact_name') as string) || null,
      email: (formData.get('email') as string) || null,
      phone: (formData.get('phone') as string) || null,
      stage: (formData.get('stage') as string) || 'lead',
      first_contact_date: (formData.get('first_contact_date') as string) || null,
      last_interacted_date: (formData.get('last_interacted_date') as string) || null,
      next_step: (formData.get('next_step') as string) || null,
      next_step_due_date: (formData.get('next_step_due_date') as string) || null,
      probability: probRaw ? parseInt(probRaw, 10) : null,
      progress: progRaw ? parseInt(progRaw, 10) : null,
      notes: (formData.get('notes') as string) || null,
    })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/school-outreach')
  return { error: null }
}

export async function deleteSchoolOutreach(id: string) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  const { supabase } = ctx

  const { error } = await supabase.from('school_outreach').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/school-outreach')
  return { error: null }
}
