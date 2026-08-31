'use server'

import { revalidatePath } from 'next/cache'
import { getStudioId } from './_shared'

/**
 * Contacts belonging to a school in school_outreach.
 *
 * Every read and write here goes through the authenticated client from
 * getStudioId(), so RLS (studio_owner_school_contacts) does the studio scoping.
 * The service-role client is never used on this path.
 *
 * school_contacts.studio_id is denormalized for RLS, so it must always be taken
 * from the parent school rather than trusted from the form — otherwise a caller
 * could attach a contact to another studio's school by pairing that school_id
 * with their own studio_id, which RLS alone would not catch.
 */

type ContactFields = {
  name: string
  title: string | null
  subject_area: string | null
  email: string | null
  phone: string | null
  is_primary: boolean
}

function readFields(formData: FormData): ContactFields | { error: string } {
  const name = ((formData.get('name') as string) ?? '').trim()
  if (!name) return { error: 'Name is required' }
  const opt = (key: string) => ((formData.get(key) as string) ?? '').trim() || null
  return {
    name,
    title: opt('title'),
    subject_area: opt('subject_area'),
    email: opt('email'),
    phone: opt('phone'),
    is_primary: formData.get('is_primary') === 'on',
  }
}

/**
 * A school has at most one primary contact, so promoting one demotes the rest.
 * Runs after the row is written, so a failed write never leaves a school with
 * no primary at all.
 */
async function demoteOtherPrimaries(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  schoolId: string,
  keepId: string,
) {
  await supabase
    .from('school_contacts')
    .update({ is_primary: false, updated_at: new Date().toISOString() })
    .eq('school_id', schoolId)
    .eq('is_primary', true)
    .neq('id', keepId)
}

export async function createSchoolContact(schoolId: string, formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const fields = readFields(formData)
  if ('error' in fields) return { error: fields.error }

  // Confirms the school exists and belongs to this studio, and gives us the
  // studio_id to stamp on the contact.
  const { data: school, error: schoolError } = await supabase
    .from('school_outreach')
    .select('id, studio_id')
    .eq('id', schoolId)
    .eq('studio_id', studioId)
    .maybeSingle()

  if (schoolError) return { error: schoolError.message }
  if (!school) return { error: 'School not found, or you do not have permission to add contacts to it.' }

  const { data: created, error } = await supabase
    .from('school_contacts')
    .insert({ ...fields, school_id: school.id, studio_id: school.studio_id })
    .select('id')
    .single()

  if (error) return { error: error.message }

  if (fields.is_primary) await demoteOtherPrimaries(supabase, school.id, created.id)

  revalidatePath('/school-outreach')
  return { error: null }
}

export async function updateSchoolContact(id: string, formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const fields = readFields(formData)
  if ('error' in fields) return { error: fields.error }

  // .select() lets us detect an update that matched no rows — without it an RLS
  // policy that blocks the write returns success while changing nothing.
  const { data, error } = await supabase
    .from('school_contacts')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('studio_id', studioId)
    .select('id, school_id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) {
    return { error: 'Contact not found, or you do not have permission to edit it.' }
  }

  if (fields.is_primary) await demoteOtherPrimaries(supabase, data[0].school_id, id)

  revalidatePath('/school-outreach')
  return { error: null }
}

// No delete action by design. Deleting a contact lands in Phase B as a soft
// delete, once outreach events reference contacts.id — a hard delete now would
// orphan that history. Phase A ships add + edit only.
