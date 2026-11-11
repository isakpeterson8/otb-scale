'use server'

import { revalidatePath } from 'next/cache'
import { getStudioId } from './_shared'
import { normalizeSchoolSource } from '@/lib/source-server'
import { advanceSchoolStage, isSchoolStage } from '@/lib/cadence-progress'

export async function createSchoolOutreach(formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  // Optional first contact, entered on the Add school form. Validated before
  // the school is created so a bad email doesn't leave a half-made record.
  const contact = {
    name: (formData.get('contact_name') as string)?.trim() || null,
    title: (formData.get('contact_title') as string)?.trim() || null,
    email: (formData.get('contact_email') as string)?.trim() || null,
    phone: (formData.get('contact_phone') as string)?.trim() || null,
  }
  const hasContact = !!(contact.name || contact.email || contact.phone)
  if (hasContact && !contact.name) return { error: 'Add a name for the contact, or leave the contact fields empty.' }
  if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
    return { error: `“${contact.email}” is not a valid email address.` }
  }

  let source: string | null
  try {
    source = await normalizeSchoolSource(supabase, studioId, formData.get('source'))
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not check sources' }
  }

  const { data: created, error } = await supabase.from('school_outreach').insert({
    studio_id: studioId,
    school_name: formData.get('school_name') as string,
    source,
    city: (formData.get('city') as string)?.trim() || null,
    state: (formData.get('state') as string)?.trim() || null,
    school_type: (formData.get('school_type') as string)?.trim() || null,
    stage: (formData.get('stage') as string) || 'lead',
    first_contact_date: (formData.get('first_contact_date') as string) || null,
    last_interacted_date: (formData.get('last_interacted_date') as string) || null,
    next_step: (formData.get('next_step') as string) || null,
    next_step_due_date: (formData.get('next_step_due_date') as string) || null,
    notes: (formData.get('notes') as string) || null,
  }).select('id').single()

  if (error) return { error: error.message }

  if (hasContact) {
    // The school_contacts insert trigger marks the first contact primary.
    const { error: contactError } = await supabase
      .from('school_contacts')
      .insert({ ...contact, school_id: created.id, studio_id: studioId })
    if (contactError) {
      revalidatePath('/school-outreach')
      return { error: `School added, but the contact could not be saved: ${contactError.message}` }
    }
  }

  revalidatePath('/school-outreach')
  return { error: null }
}

export async function updateSchoolOutreach(id: string, formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  let source: string | null
  try {
    source = await normalizeSchoolSource(supabase, studioId, formData.get('source'))
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not check sources' }
  }

  const { error } = await supabase
    .from('school_outreach')
    .update({
      school_name: formData.get('school_name') as string,
      source,
      city: (formData.get('city') as string)?.trim() || null,
      state: (formData.get('state') as string)?.trim() || null,
      school_type: (formData.get('school_type') as string)?.trim() || null,
      stage: (formData.get('stage') as string) || 'lead',
      first_contact_date: (formData.get('first_contact_date') as string) || null,
      last_interacted_date: (formData.get('last_interacted_date') as string) || null,
      next_step: (formData.get('next_step') as string) || null,
      next_step_due_date: (formData.get('next_step_due_date') as string) || null,
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
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  // Cascades to cadence_enrollments (ON DELETE CASCADE).
  // .select() lets us detect a delete that matched no rows — without it an RLS
  // policy that blocks DELETE returns success while silently changing nothing.
  const { data, error } = await supabase
    .from('school_outreach')
    .delete()
    .eq('id', id)
    .eq('studio_id', studioId)
    .select('id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) {
    return { error: 'School not found, or you do not have permission to delete it.' }
  }

  revalidatePath('/school-outreach')
  return { error: null }
}

/**
 * Bulk "Change stage". Forward-only, like the automatic stage moves: schools
 * already at or past `stage` are left as they are and counted as skipped.
 * (A single school can still be moved anywhere from its Edit form.)
 */
export async function bulkSetSchoolStage(schoolIds: string[], stage: string) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized', moved: 0, skipped: 0 }
  if (ctx.viewOnly) return { error: 'View only mode', moved: 0, skipped: 0 }
  if (!isSchoolStage(stage)) return { error: 'Unknown stage.', moved: 0, skipped: 0 }
  if (schoolIds.length > 500) return { error: 'Select at most 500 schools at a time.', moved: 0, skipped: 0 }
  const { supabase, studioId } = ctx

  const { advanced, error } = await advanceSchoolStage(supabase, schoolIds, stage, { studioId })
  if (error) return { error, moved: 0, skipped: 0 }
  revalidatePath('/school-outreach')
  return { error: null, moved: advanced.length, skipped: schoolIds.length - advanced.length }
}
