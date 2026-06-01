'use server'

import { revalidatePath } from 'next/cache'
import { getStudioId } from './_shared'

export async function createFacebookGroup(formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const sizeRaw = formData.get('group_membership_size') as string
  const postDays = formData.getAll('post_days') as string[]
  const freq = (formData.get('post_frequency') as string) || null
  const weekPattern = (formData.get('post_week_pattern') as string) || null

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
    post_frequency: freq,
    post_days: postDays.length > 0 ? postDays : [],
    post_week_pattern: weekPattern,
    qualification_status: (formData.get('qualification_status') as string) || 'active',
  })

  if (error) return { error: error.message }
  revalidatePath('/facebook-groups')
  return { error: null }
}

export async function updateFacebookGroup(id: string, formData: FormData) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase } = ctx

  const sizeRaw = formData.get('group_membership_size') as string
  const postDays = formData.getAll('post_days') as string[]
  const freq = (formData.get('post_frequency') as string) || null
  const weekPattern = (formData.get('post_week_pattern') as string) || null

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
      post_frequency: freq,
      post_days: postDays.length > 0 ? postDays : [],
      post_week_pattern: weekPattern,
      qualification_status: (formData.get('qualification_status') as string) || 'active',
    })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/facebook-groups')
  return { error: null }
}

export async function logPost(id: string) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
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

export async function markPostCompletion(
  groupId: string,
  data: { assetId?: string | null; likes?: number; comments?: number; dms?: number },
) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const today = new Date().toISOString().slice(0, 10)

  const { error: compError } = await supabase
    .from('group_post_completions')
    .upsert(
      {
        group_id: groupId,
        studio_id: studioId,
        date: today,
        last_used_asset_id: data.assetId ?? null,
        likes: data.likes ?? 0,
        comments: data.comments ?? 0,
        dms: data.dms ?? 0,
      },
      { onConflict: 'group_id,date' },
    )

  if (compError) return { error: compError.message }

  const { error: groupError } = await supabase
    .from('facebook_groups')
    .update({ most_recent_post_date: today })
    .eq('id', groupId)

  if (groupError) return { error: groupError.message }

  revalidatePath('/facebook-groups')
  return { error: null }
}

export async function createPostAsset(
  groupId: string,
  type: 'copy' | 'image',
  content: string,
  label: string,
) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const { data: group } = await supabase
    .from('facebook_groups')
    .select('id')
    .eq('id', groupId)
    .eq('studio_id', studioId)
    .single()
  if (!group) return { error: 'Group not found' }

  const { error } = await supabase
    .from('group_post_assets')
    .insert({ group_id: groupId, type, content, label: label || null })

  if (error) return { error: error.message }
  revalidatePath('/facebook-groups')
  return { error: null }
}

export async function deletePostAsset(assetId: string) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase } = ctx

  const { error } = await supabase
    .from('group_post_assets')
    .delete()
    .eq('id', assetId)

  if (error) return { error: error.message }
  revalidatePath('/facebook-groups')
  return { error: null }
}

export async function deleteFacebookGroup(id: string) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase } = ctx

  const { error } = await supabase.from('facebook_groups').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/facebook-groups')
  return { error: null }
}
