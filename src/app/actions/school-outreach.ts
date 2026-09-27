'use server'

import { revalidatePath } from 'next/cache'
import { getStudioId } from './_shared'
import { normalizeWebsite } from '@/lib/school-outreach'
import { nextStepLabel } from '@/lib/school-outreach'
import type { SchoolActivityType, SchoolNextStepOption } from '@/types/database'


/**
 * school_outreach.contact_name / email / phone are legacy duplicates of the
 * primary contact. Sending reads school_contacts now, but other code and older
 * exports still read the columns, so they are kept in lockstep with the primary
 * rather than left to drift.
 *
 * Called after anything that can change which contact is primary. Verbatim copy:
 * a backfilled primary named 'Main contact' (2 schools) writes that placeholder
 * into contact_name, which is what the UI shows for them anyway.
 */
async function syncSchoolFromPrimary(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  studioId: string,
  schoolId: string,
): Promise<void> {
  const { data: primary } = await supabase
    .from('school_contacts')
    .select('name, email, phone')
    .eq('school_id', schoolId)
    .eq('studio_id', studioId)
    .eq('is_primary', true)
    .maybeSingle()

  await supabase
    .from('school_outreach')
    .update({
      contact_name: primary?.name ?? null,
      email: primary?.email ?? null,
      phone: primary?.phone ?? null,
    })
    .eq('id', schoolId)
    .eq('studio_id', studioId)
}

/**
 * Write the school form's contact fields onto the primary contact, creating one
 * if the school has none. Does nothing when all three are blank, so a school can
 * still be recorded before anyone at it is known.
 *
 * title and subject_area are deliberately untouched — the school form does not
 * offer them, and clearing them here would discard what was set in the contacts
 * panel.
 */
async function upsertPrimaryFromForm(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  studioId: string,
  schoolId: string,
  fields: { name: string | null; email: string | null; phone: string | null },
): Promise<void> {
  const hasAnything = [fields.name, fields.email, fields.phone].some(v => (v ?? '') !== '')
  if (!hasAnything) return

  const { data: primary } = await supabase
    .from('school_contacts')
    .select('id')
    .eq('school_id', schoolId)
    .eq('studio_id', studioId)
    .eq('is_primary', true)
    .maybeSingle()

  if (primary) {
    await supabase
      .from('school_contacts')
      .update({
        // name is NOT NULL in the database, so a cleared name keeps the
        // placeholder rather than failing the write.
        name: fields.name ?? 'Main contact',
        email: fields.email,
        phone: fields.phone,
      })
      .eq('id', primary.id)
    return
  }

  await supabase.from('school_contacts').insert({
    studio_id: studioId,
    school_id: schoolId,
    name: fields.name ?? 'Main contact',
    email: fields.email,
    phone: fields.phone,
    is_primary: true,
  })
}

export async function createSchoolOutreach(formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const contactFields = {
    name:  ((formData.get('contact_name') as string) || '').trim() || null,
    email: ((formData.get('email') as string) || '').trim() || null,
    phone: ((formData.get('phone') as string) || '').trim() || null,
  }

  const { data: created, error } = await supabase.from('school_outreach').insert({
    studio_id: studioId,
    school_name: formData.get('school_name') as string,
    contact_name: (formData.get('contact_name') as string) || null,
    email: (formData.get('email') as string) || null,
    phone: (formData.get('phone') as string) || null,
    stage: (formData.get('stage') as string) || 'lead',
    first_contact_date: (formData.get('first_contact_date') as string) || null,
    last_interacted_date: (formData.get('last_interacted_date') as string) || null,
    next_step: (formData.get('next_step') as string) || null,
    next_step_option: (formData.get('next_step_option') as string) || null,
    next_step_due_date: (formData.get('next_step_due_date') as string) || null,
    website: normalizeWebsite(formData.get('website') as string | null),
    notes: (formData.get('notes') as string) || null,
  })
    .select('id')
    .single()

  if (error) return { error: error.message }

  // The form's contact fields ARE the primary contact, not a separate copy.
  if (created) {
    await upsertPrimaryFromForm(supabase, studioId, created.id as string, contactFields)
    await syncSchoolFromPrimary(supabase, studioId, created.id as string)
  }

  revalidatePath('/school-outreach')
  return { error: null }
}

export async function updateSchoolOutreach(id: string, formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId, userId } = ctx

  // Read the current option first so a change can be recorded on the timeline.
  const { data: before } = await supabase
    .from('school_outreach')
    .select('next_step_option, next_step')
    .eq('id', id)
    .maybeSingle()

  const nextOption = ((formData.get('next_step_option') as string) || null) as SchoolNextStepOption | null

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
      next_step_option: nextOption,
      next_step_due_date: (formData.get('next_step_due_date') as string) || null,
      website: normalizeWebsite(formData.get('website') as string | null),
      notes: (formData.get('notes') as string) || null,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  // Edits to the form's contact fields land on the primary contact, then the
  // legacy columns are re-derived from it so the two cannot diverge.
  await upsertPrimaryFromForm(supabase, studioId, id, {
    name:  ((formData.get('contact_name') as string) || '').trim() || null,
    email: ((formData.get('email') as string) || '').trim() || null,
    phone: ((formData.get('phone') as string) || '').trim() || null,
  })
  await syncSchoolFromPrimary(supabase, studioId, id)

  // Timeline entry, only when the option actually moved. Best-effort: a failed
  // history write must not fail the edit the user asked for.
  const priorOption = (before?.next_step_option ?? null) as SchoolNextStepOption | null
  if (priorOption !== nextOption) {
    await supabase.from('school_outreach_activity').insert({
      studio_id: studioId,
      school_id: id,
      activity_type: 'next_step_change' satisfies SchoolActivityType,
      subject: nextStepLabel(nextOption) ?? 'Cleared',
      notes: priorOption
        ? `Changed from "${nextStepLabel(priorOption)}"`
        : 'Next step set',
      created_by: userId,
    })
  }

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

// ── Contacts ─────────────────────────────────────────────────────────────────
// studio_id is always taken from the session, never from the form: the composite
// foreign key added by 20260927000001 then makes a cross-studio contact
// impossible rather than merely disallowed.

export async function createSchoolContact(schoolId: string, formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const name = ((formData.get('name') as string) || '').trim()
  if (name === '') return { error: 'A contact needs a name.' }

  // The unique index allows one primary per school, so demote before promoting.
  const wantsPrimary = formData.get('is_primary') === 'on'
  if (wantsPrimary) {
    await supabase
      .from('school_contacts')
      .update({ is_primary: false })
      .eq('school_id', schoolId)
      .eq('studio_id', studioId)
  }

  // First contact on a school becomes primary whether or not the box was ticked,
  // so a school is never left with contacts and no send address.
  const { count } = await supabase
    .from('school_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId)

  const { error } = await supabase.from('school_contacts').insert({
    studio_id: studioId,
    school_id: schoolId,
    name,
    title: ((formData.get('title') as string) || '').trim() || null,
    subject_area: (formData.get('subject_area') as string) || null,
    email: ((formData.get('email') as string) || '').trim() || null,
    phone: ((formData.get('phone') as string) || '').trim() || null,
    is_primary: wantsPrimary || (count ?? 0) === 0,
  })

  if (error) return { error: error.message }
  await syncSchoolFromPrimary(supabase, studioId, schoolId)
  revalidatePath('/school-outreach')
  return { error: null }
}

export async function updateSchoolContact(contactId: string, formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const name = ((formData.get('name') as string) || '').trim()
  if (name === '') return { error: 'A contact needs a name.' }

  const { data: existing } = await supabase
    .from('school_contacts')
    .select('school_id')
    .eq('id', contactId)
    .eq('studio_id', studioId)
    .maybeSingle()
  if (!existing) return { error: 'Contact not found.' }

  if (formData.get('is_primary') === 'on') {
    await supabase
      .from('school_contacts')
      .update({ is_primary: false })
      .eq('school_id', existing.school_id)
      .eq('studio_id', studioId)
      .neq('id', contactId)
  }

  const { error } = await supabase
    .from('school_contacts')
    .update({
      name,
      title: ((formData.get('title') as string) || '').trim() || null,
      subject_area: (formData.get('subject_area') as string) || null,
      email: ((formData.get('email') as string) || '').trim() || null,
      phone: ((formData.get('phone') as string) || '').trim() || null,
      is_primary: formData.get('is_primary') === 'on',
    })
    .eq('id', contactId)
    .eq('studio_id', studioId)

  if (error) return { error: error.message }
  await syncSchoolFromPrimary(supabase, studioId, existing.school_id as string)
  revalidatePath('/school-outreach')
  return { error: null }
}

export async function deleteSchoolContact(contactId: string) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const { data: target } = await supabase
    .from('school_contacts')
    .select('school_id, is_primary')
    .eq('id', contactId)
    .eq('studio_id', studioId)
    .maybeSingle()
  if (!target) return { error: 'Contact not found.' }

  // .select() so an RLS-blocked delete reports failure instead of silent success.
  const { data, error } = await supabase
    .from('school_contacts')
    .delete()
    .eq('id', contactId)
    .eq('studio_id', studioId)
    .select('id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) {
    return { error: 'Contact not found, or you do not have permission to delete it.' }
  }

  // Deleting the primary would leave the school with no send address, so the
  // oldest remaining contact is promoted.
  if (target.is_primary) {
    const { data: next } = await supabase
      .from('school_contacts')
      .select('id')
      .eq('school_id', target.school_id)
      .eq('studio_id', studioId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (next) {
      await supabase.from('school_contacts').update({ is_primary: true }).eq('id', next.id)
    }
  }

  // Runs whether or not a replacement was promoted: with no contacts left, the
  // legacy columns are cleared rather than left pointing at a deleted person.
  await syncSchoolFromPrimary(supabase, studioId, target.school_id as string)

  revalidatePath('/school-outreach')
  return { error: null }
}

export async function setPrimarySchoolContact(contactId: string) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const { data: target } = await supabase
    .from('school_contacts')
    .select('school_id')
    .eq('id', contactId)
    .eq('studio_id', studioId)
    .maybeSingle()
  if (!target) return { error: 'Contact not found.' }

  // Demote first: the partial unique index permits only one primary per school.
  const { error: demoteError } = await supabase
    .from('school_contacts')
    .update({ is_primary: false })
    .eq('school_id', target.school_id)
    .eq('studio_id', studioId)
    .neq('id', contactId)
  if (demoteError) return { error: demoteError.message }

  const { error } = await supabase
    .from('school_contacts')
    .update({ is_primary: true })
    .eq('id', contactId)
    .eq('studio_id', studioId)

  if (error) return { error: error.message }
  await syncSchoolFromPrimary(supabase, studioId, target.school_id as string)
  revalidatePath('/school-outreach')
  return { error: null }
}

// ── Activity log ─────────────────────────────────────────────────────────────

export async function logSchoolActivity(schoolId: string, formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId, userId } = ctx

  const type = (formData.get('activity_type') as string) || 'call'
  if (!['call', 'visit', 'other'].includes(type)) {
    return { error: 'Pick Call, Visit or Other.' }
  }

  // A date input gives YYYY-MM-DD; store it as noon so a timezone shift cannot
  // move it to the previous day in the timeline.
  const day = (formData.get('occurred_on') as string) || ''
  const occurredAt = day ? new Date(`${day}T12:00:00`).toISOString() : new Date().toISOString()

  const contactId = (formData.get('contact_id') as string) || null
  if (contactId) {
    // The composite FK would reject a contact from another school, but checking
    // here turns a constraint violation into a readable message.
    const { data: owned } = await supabase
      .from('school_contacts')
      .select('id')
      .eq('id', contactId)
      .eq('school_id', schoolId)
      .eq('studio_id', studioId)
      .maybeSingle()
    if (!owned) return { error: 'That contact is not on this school.' }
  }

  const { error } = await supabase.from('school_outreach_activity').insert({
    studio_id: studioId,
    school_id: schoolId,
    contact_id: contactId,
    activity_type: type as SchoolActivityType,
    occurred_at: occurredAt,
    notes: ((formData.get('notes') as string) || '').trim() || null,
    created_by: userId,
  })
  if (error) return { error: error.message }

  // Logging contact is itself an interaction, so the school reflects it.
  await supabase
    .from('school_outreach')
    .update({ last_interacted_date: occurredAt.slice(0, 10) })
    .eq('id', schoolId)
    .eq('studio_id', studioId)

  revalidatePath('/school-outreach')
  return { error: null }
}

export async function deleteSchoolActivity(activityId: string) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const { data, error } = await supabase
    .from('school_outreach_activity')
    .delete()
    .eq('id', activityId)
    .eq('studio_id', studioId)
    .select('id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) {
    return { error: 'Entry not found, or you do not have permission to delete it.' }
  }

  revalidatePath('/school-outreach')
  return { error: null }
}
