'use server'

import { revalidatePath } from 'next/cache'
import { getStudioId } from './_shared'

export async function createFacebookGroup(formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  const { supabase, studioId } = ctx

  const sizeRaw = formData.get('group_membership_size') as string
  const { error } = await supabase.from('facebook_groups').insert({
    studio_id: studioId,
    group_name: formData.get('group_name') as string,
    group_url: (formData.get('group_url') as string) || null,
    group_location: (formData.get('group_location') as string) || null,
    group_membership_size: sizeRaw ? parseInt(sizeRaw, 10) : null,
    shared_with: (formData.get('shared_with') as string) || null,
    application_date: (formData.get('application_date') as string) || null,
    acceptance_date: (formData.get('acceptance_date') as string) || null,
    most_recent_post_date: (formData.get('most_recent_post_date') as string) || null,
    posting_rules: (formData.get('posting_rules') as string) || null,
    post_type: (formData.get('post_type') as string) || null,
    is_active: formData.get('is_active') !== 'false',
  })

  if (error) return { error: error.message }
  revalidatePath('/facebook-groups')
  return { error: null }
}

export async function updateFacebookGroup(id: string, formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  const { supabase } = ctx

  const sizeRaw = formData.get('group_membership_size') as string
  const { error } = await supabase
    .from('facebook_groups')
    .update({
      group_name: formData.get('group_name') as string,
      group_url: (formData.get('group_url') as string) || null,
      group_location: (formData.get('group_location') as string) || null,
      group_membership_size: sizeRaw ? parseInt(sizeRaw, 10) : null,
      shared_with: (formData.get('shared_with') as string) || null,
      application_date: (formData.get('application_date') as string) || null,
      acceptance_date: (formData.get('acceptance_date') as string) || null,
      most_recent_post_date: (formData.get('most_recent_post_date') as string) || null,
      posting_rules: (formData.get('posting_rules') as string) || null,
      post_type: (formData.get('post_type') as string) || null,
      is_active: formData.get('is_active') !== 'false',
    })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/facebook-groups')
  return { error: null }
}

export async function logPost(id: string) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  const { supabase } = ctx

  const today = new Date().toISOString().slice(0, 10)
  const { error } = await supabase
    .from('facebook_groups')
    .update({ most_recent_post_date: today })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/facebook-groups')
  return { error: null }
}

export async function deleteFacebookGroup(id: string) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  const { supabase } = ctx

  const { error } = await supabase.from('facebook_groups').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/facebook-groups')
  return { error: null }
}
