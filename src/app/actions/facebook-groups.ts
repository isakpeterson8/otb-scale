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

  const { data: created, error } = await supabase.from('facebook_groups').insert({
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
    is_active: formData.get('is_active') === 'true',
    post_frequency: freq,
    post_days: postDays.length > 0 ? postDays : [],
    post_week_pattern: weekPattern,
    qualification_status: (formData.get('qualification_status') as string) || 'active',
    initial_engagement_post_complete: formData.get('initial_engagement_post_complete') === 'true',
    notes: (formData.get('notes') as string) || null,
  }).select('id').single()

  if (error) return { error: error.message }

  // Templates picked from the library while adding the group
  const templateIds = [...new Set(formData.getAll('template_ids') as string[])].filter(Boolean)
  const linkError = await linkTemplates(supabase, studioId, created.id as string, templateIds)
  if (linkError) return { error: `Group added, but its templates were not saved: ${linkError}` }

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
      is_active: formData.get('is_active') === 'true',
      post_frequency: freq,
      post_days: postDays.length > 0 ? postDays : [],
      post_week_pattern: weekPattern,
      qualification_status: (formData.get('qualification_status') as string) || 'active',
      initial_engagement_post_complete: formData.get('initial_engagement_post_complete') === 'true',
      notes: (formData.get('notes') as string) || null,
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
  data: { templateId?: string | null },
) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const templateId = data.templateId || null
  if (templateId) {
    const { data: t } = await supabase
      .from('post_templates').select('id').eq('id', templateId).eq('studio_id', studioId).maybeSingle()
    if (!t) return { error: 'Template not found' }
  }

  const today = new Date().toISOString().slice(0, 10)

  const { error: compError } = await supabase
    .from('group_post_completions')
    .upsert(
      { group_id: groupId, studio_id: studioId, date: today, template_id: templateId },
      { onConflict: 'group_id,date' },
    )

  if (compError) return { error: compError.message }

  const { error: groupError } = await supabase
    .from('facebook_groups')
    .update({ most_recent_post_date: today })
    .eq('id', groupId)

  if (groupError) return { error: groupError.message }

  // A template used in a group shows on that group's card from now on.
  if (templateId) {
    const linkError = await linkTemplates(supabase, studioId, groupId, [templateId])
    if (linkError) return { error: linkError }
  }

  revalidatePath('/facebook-groups')
  return { error: null }
}

// ─── Post templates (shared library) ─────────────────────────────────────────

export interface PostTemplateInput {
  title: string
  body: string
  variantLabel?: string
  /** Comma-separated. */
  tags?: string
  imageUrl?: string
}

function cleanTemplate(input: PostTemplateInput):
  | { error: string; row?: undefined }
  | { error: null; row: { title: string; body: string; variant_label: string | null; tags: string[]; image_url: string | null } } {
  const body = (input.body ?? '').replace(/^\s+|\s+$/g, '')
  const imageUrl = (input.imageUrl ?? '').trim()
  if (!body && !imageUrl) return { error: 'Add the post copy or an image URL.' }
  if (body.length > 10000) return { error: 'Post copy is too long (10,000 characters max).' }
  if (imageUrl && !/^https?:\/\/\S+$/i.test(imageUrl)) return { error: 'Image URL must start with http:// or https://' }
  // No title given: use the first line of the copy.
  const title = ((input.title ?? '').trim() || body.split('\n')[0].trim() || 'Image post').slice(0, 120)
  const tags = [...new Set((input.tags ?? '').split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean))].slice(0, 10)
  return {
    error: null,
    row: { title, body, variant_label: (input.variantLabel ?? '').trim().slice(0, 60) || null, tags, image_url: imageUrl || null },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function linkTemplates(supabase: any, studioId: string, groupId: string, templateIds: string[]): Promise<string | null> {
  if (templateIds.length === 0) return null
  const { error } = await supabase
    .from('group_post_templates')
    .upsert(
      templateIds.map(id => ({ group_id: groupId, template_id: id, studio_id: studioId })),
      { onConflict: 'group_id,template_id', ignoreDuplicates: true },
    )
  return error ? error.message : null
}

export async function createPostTemplate(input: PostTemplateInput): Promise<{ error: string | null; id?: string }> {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const clean = cleanTemplate(input)
  if (clean.error !== null) return { error: clean.error }

  const { data, error } = await supabase
    .from('post_templates')
    .insert({ ...clean.row, studio_id: studioId })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/facebook-groups')
  return { error: null, id: data.id as string }
}

export async function updatePostTemplate(id: string, input: PostTemplateInput): Promise<{ error: string | null; id?: string }> {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const clean = cleanTemplate(input)
  if (clean.error !== null) return { error: clean.error }

  const { data, error } = await supabase
    .from('post_templates')
    .update(clean.row)
    .eq('id', id)
    .eq('studio_id', studioId)
    .select('id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'Template not found' }
  revalidatePath('/facebook-groups')
  return { error: null, id }
}

export async function duplicatePostTemplate(id: string): Promise<{ error: string | null; id?: string }> {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const { data: t } = await supabase
    .from('post_templates')
    .select('title, body, variant_label, tags, image_url')
    .eq('id', id)
    .eq('studio_id', studioId)
    .maybeSingle()
  if (!t) return { error: 'Template not found' }

  const { data, error } = await supabase
    .from('post_templates')
    .insert({ ...t, title: `${t.title} (copy)`.slice(0, 120), studio_id: studioId })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/facebook-groups')
  return { error: null, id: data.id as string }
}

export async function setPostTemplateArchived(id: string, archived: boolean): Promise<{ error: string | null }> {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const { data, error } = await supabase
    .from('post_templates')
    .update({ archived })
    .eq('id', id)
    .eq('studio_id', studioId)
    .select('id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'Template not found' }
  revalidatePath('/facebook-groups')
  return { error: null }
}

export async function linkTemplateToGroup(groupId: string, templateId: string): Promise<{ error: string | null }> {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const linkError = await linkTemplates(supabase, studioId, groupId, [templateId])
  if (linkError) return { error: linkError }
  revalidatePath('/facebook-groups')
  return { error: null }
}

export async function unlinkTemplateFromGroup(groupId: string, templateId: string): Promise<{ error: string | null }> {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  const { error } = await supabase
    .from('group_post_templates')
    .delete()
    .eq('group_id', groupId)
    .eq('template_id', templateId)
    .eq('studio_id', studioId)

  if (error) return { error: error.message }
  revalidatePath('/facebook-groups')
  return { error: null }
}

export async function deleteFacebookGroup(id: string) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  if (ctx.viewOnly) return { error: 'View only mode' }
  const { supabase, studioId } = ctx

  // Cascades to group_post_completions, group_post_templates links and the legacy
  // group_post_assets (all ON DELETE CASCADE). Templates stay in the library.
  // .select() lets us detect a delete that matched no rows — without it an RLS
  // policy that blocks DELETE returns success while silently changing nothing.
  const { data, error } = await supabase
    .from('facebook_groups')
    .delete()
    .eq('id', id)
    .eq('studio_id', studioId)
    .select('id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) {
    return { error: 'Group not found, or you do not have permission to delete it.' }
  }

  revalidatePath('/facebook-groups')
  return { error: null }
}
