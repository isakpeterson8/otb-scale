'use server'

import { revalidatePath } from 'next/cache'
import { getStudioId } from './_shared'

// Primary-contact rules live in the database (see the school-contacts
// migration): the first contact of a school becomes primary on insert, and
// deleting the primary promotes the next-oldest. These actions don't repeat
// that logic, so CSV import and any other writer get the same behaviour.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function text(formData: FormData, key: string): string | null {
  const v = formData.get(key)
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function readContact(formData: FormData): { error: string } | {
  name: string
  title: string | null
  email: string | null
  phone: string | null
  notes: string | null
} {
  const name = text(formData, 'name')
  if (!name) return { error: 'Contact name is required.' }
  const email = text(formData, 'email')
  if (email && !EMAIL_RE.test(email)) return { error: `“${email}” is not a valid email address.` }
  return {
    name,
    title: text(formData, 'title'),
    email,
    phone: text(formData, 'phone'),
    notes: text(formData, 'notes'),
  }
}

export async function addSchoolContact(schoolId: string, formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const fields = readContact(formData)
  if ('error' in fields) return { error: fields.error }

  // studio_id comes from the session, never the client; the school must be ours.
  const { data: school } = await supabase
    .from('school_outreach')
    .select('id')
    .eq('id', schoolId)
    .eq('studio_id', studioId)
    .maybeSingle()
  if (!school) return { error: 'School not found.' }

  const { error } = await supabase
    .from('school_contacts')
    .insert({ ...fields, school_id: schoolId, studio_id: studioId })

  if (error) return { error: error.message }
  revalidatePath('/school-outreach')
  return { error: null }
}

export async function updateSchoolContact(id: string, formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const fields = readContact(formData)
  if ('error' in fields) return { error: fields.error }

  const { data, error } = await supabase
    .from('school_contacts')
    .update(fields)
    .eq('id', id)
    .eq('studio_id', studioId)
    .select('id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'Contact not found, or you do not have permission to edit it.' }
  revalidatePath('/school-outreach')
  return { error: null }
}

export async function deleteSchoolContact(id: string) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  // .select() so an RLS-blocked delete is reported instead of silently succeeding.
  const { data, error } = await supabase
    .from('school_contacts')
    .delete()
    .eq('id', id)
    .eq('studio_id', studioId)
    .select('id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'Contact not found, or you do not have permission to delete it.' }
  revalidatePath('/school-outreach')
  return { error: null }
}

export async function makePrimarySchoolContact(id: string) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const { data: contact } = await supabase
    .from('school_contacts')
    .select('id')
    .eq('id', id)
    .eq('studio_id', studioId)
    .maybeSingle()
  if (!contact) return { error: 'Contact not found.' }

  const { error } = await supabase.rpc('set_primary_school_contact', { p_contact_id: id })
  if (error) return { error: error.message }
  revalidatePath('/school-outreach')
  return { error: null }
}
