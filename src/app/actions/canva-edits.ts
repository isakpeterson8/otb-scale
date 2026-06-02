'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { getStudioId } from '@/app/actions/_shared'

export interface CanvaRequest {
  id: string
  studio_id: string
  user_id: string
  asset_type: string
  instructions: string
  canva_link: string
  reference_url: string | null
  status: 'pending' | 'in_progress' | 'complete'
  assigned_to: string | null
  created_at: string
  completed_at: string | null
}

export interface AdminCanvaRequest extends CanvaRequest {
  studio_name: string | null
}

export async function submitCanvaRequest(formData: {
  asset_type: string
  instructions: string
  canva_link: string
  reference_url?: string
}): Promise<{ error?: string }> {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Not authenticated' }
  if (ctx.viewOnly) return { error: 'Cannot submit requests in View As mode' }

  const { supabase, studioId, userId } = ctx

  const { error } = await supabase.from('canva_requests').insert({
    studio_id: studioId,
    user_id: userId,
    asset_type: formData.asset_type,
    instructions: formData.instructions,
    canva_link: formData.canva_link,
    reference_url: formData.reference_url?.trim() || null,
  })

  if (error) return { error: error.message }

  revalidatePath('/canva-edits')
  return {}
}

export async function getMyCanvaRequests(): Promise<CanvaRequest[]> {
  const ctx = await getStudioId()
  if (!ctx) return []

  const { supabase, studioId } = ctx

  const { data } = await supabase
    .from('canva_requests')
    .select('id, studio_id, user_id, asset_type, instructions, canva_link, reference_url, status, assigned_to, created_at, completed_at')
    .eq('studio_id', studioId)
    .order('created_at', { ascending: false })

  return (data ?? []) as CanvaRequest[]
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'otb_admin' || profile?.role === 'otb_staff') return user

  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase())
  if (user.email && adminEmails.includes(user.email.toLowerCase())) return user

  return null
}

export async function getAdminCanvaRequests(): Promise<AdminCanvaRequest[]> {
  const caller = await requireAdmin()
  if (!caller) return []

  const { data: requests } = await adminClient
    .from('canva_requests')
    .select('id, studio_id, user_id, asset_type, instructions, canva_link, reference_url, status, assigned_to, created_at, completed_at')
    .order('created_at', { ascending: false })

  if (!requests || requests.length === 0) return []

  const studioIds = [...new Set(requests.map((r: CanvaRequest) => r.studio_id))]
  const { data: studios } = await adminClient
    .from('studios')
    .select('id, name')
    .in('id', studioIds)

  const nameById = new Map((studios ?? []).map((s: { id: string; name: string }) => [s.id, s.name]))

  return (requests as CanvaRequest[]).map(r => ({
    ...r,
    studio_name: nameById.get(r.studio_id) ?? null,
  }))
}

export async function updateCanvaRequest(
  id: string,
  data: { assigned_to?: string; status?: 'pending' | 'in_progress' | 'complete' }
): Promise<{ error?: string }> {
  const caller = await requireAdmin()
  if (!caller) return { error: 'Unauthorized' }

  const update: Record<string, unknown> = {}
  if (data.assigned_to !== undefined) update.assigned_to = data.assigned_to || null
  if (data.status !== undefined) {
    update.status = data.status
    if (data.status === 'complete') update.completed_at = new Date().toISOString()
  }

  const { error } = await adminClient.from('canva_requests').update(update).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin')
  return {}
}
