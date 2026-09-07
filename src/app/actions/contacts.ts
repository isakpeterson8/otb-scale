'use server'

import { revalidatePath } from 'next/cache'
import { getStudioId } from './_shared'
import { LEAD_STATUSES, WAITLIST_STATUS } from '@/types/database'
import type { LeadStatus } from '@/types/database'

// Anything not in LEAD_STATUSES — including the five retired values — is stored
// as NULL, so a stale client can never write an unsupported status.
function parseStatus(formData: FormData): LeadStatus | null {
  const raw = (formData.get('status') as string) || ''
  return LEAD_STATUSES.some(s => s.value === raw) ? (raw as LeadStatus) : null
}

export async function createContact(formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const leadSource = (formData.get('lead_source') as string) || null
  const leadSubSource = (formData.get('lead_sub_source') as string) || null
  const sourceFbGroupId = (formData.get('source_facebook_group_id') as string) || null

  const { error } = await supabase.from('contacts').insert({
    studio_id: studioId,
    name: formData.get('name') as string,
    guardian_name: (formData.get('guardian_name') as string) || null,
    email: (formData.get('email') as string) || null,
    phone: (formData.get('phone') as string) || null,
    status: parseStatus(formData),
    notes: (formData.get('notes') as string) || null,
    lead_source: leadSource,
    lead_sub_source: leadSource === 'facebook_group' ? leadSubSource : null,
    source_facebook_group_id: leadSource === 'facebook_group' ? sourceFbGroupId : null,
  })

  if (error) return { error: error.message }

  revalidatePath('/leads')
  revalidatePath('/contacts')
  return { error: null }
}

export async function updateContact(id: string, formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase } = ctx

  const leadSource = (formData.get('lead_source') as string) || null
  const leadSubSource = (formData.get('lead_sub_source') as string) || null
  const sourceFbGroupId = (formData.get('source_facebook_group_id') as string) || null

  const { error } = await supabase
    .from('contacts')
    .update({
      name: formData.get('name') as string,
      guardian_name: (formData.get('guardian_name') as string) || null,
      email: (formData.get('email') as string) || null,
      phone: (formData.get('phone') as string) || null,
      status: parseStatus(formData),
      notes: (formData.get('notes') as string) || null,
      lead_source: leadSource,
      lead_sub_source: leadSource === 'facebook_group' ? leadSubSource : null,
      source_facebook_group_id: leadSource === 'facebook_group' ? sourceFbGroupId : null,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/leads')
  revalidatePath('/contacts')
  return { error: null }
}

/**
 * Persist a manual waitlist ordering by renumbering waitlist_rank 0..n-1.
 *
 * The id list comes from the browser, so it is never trusted: every id is
 * re-read from the DB scoped to this studio and to status = waitlist before
 * anything is written, and each write is scoped to the studio as well. Ids
 * belonging to another studio therefore cannot be touched.
 */
export async function updateWaitlistOrder(orderedContactIds: string[]) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  if (orderedContactIds.length === 0) return { error: null }

  // Reject duplicates outright rather than letting them collapse silently.
  if (new Set(orderedContactIds).size !== orderedContactIds.length) {
    return { error: 'Duplicate leads in the new order' }
  }

  const { data: owned, error: ownershipError } = await supabase
    .from('contacts')
    .select('id')
    .eq('studio_id', studioId)
    .eq('status', WAITLIST_STATUS)
    .in('id', orderedContactIds)

  if (ownershipError) return { error: ownershipError.message }

  const ownedIds = new Set((owned ?? []).map((r: { id: string }) => r.id))
  if (ownedIds.size !== orderedContactIds.length) {
    return { error: 'The waitlist changed — reload and try again' }
  }

  const results = await Promise.all(
    orderedContactIds.map((id, index) =>
      supabase
        .from('contacts')
        .update({ waitlist_rank: index })
        .eq('id', id)
        .eq('studio_id', studioId),
    ),
  )

  const failed = results.find(r => r.error)
  if (failed?.error) return { error: failed.error.message }

  revalidatePath('/leads/waitlist')
  revalidatePath('/leads')
  return { error: null }
}

export async function deleteContact(id: string) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase } = ctx

  const { error } = await supabase.from('contacts').delete().eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/leads')
  revalidatePath('/contacts')
  revalidatePath('/pipeline')
  return { error: null }
}
