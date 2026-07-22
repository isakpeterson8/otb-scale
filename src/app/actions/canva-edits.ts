'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { getStudioId } from '@/app/actions/_shared'
import { getDesignerEmails, isDesignerEmail } from '@/lib/designer'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

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

  const { supabase, studioId, userId, userEmail } = ctx

  const { error } = await supabase.from('canva_requests').insert({
    studio_id: studioId,
    user_id: userId,
    asset_type: formData.asset_type,
    instructions: formData.instructions,
    canva_link: formData.canva_link,
    reference_url: formData.reference_url?.trim() || null,
  })

  if (error) return { error: error.message }

  // Notify the design team — a failed email must never break submission
  try {
    const [{ data: studio }, { data: setting }] = await Promise.all([
      adminClient.from('studios').select('name').eq('id', studioId).single(),
      adminClient.from('settings').select('display_name').eq('user_id', userId).maybeSingle(),
    ])
    const requesterName = setting?.display_name || studio?.name || 'A member'
    const submittedAt = new Date().toLocaleString('en-US', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago',
    })
    await resend.emails.send({
      from: 'Outside The Bachs <noreply@outsidethebachs.com>',
      to: getDesignerEmails(),
      subject: `New Canva request: ${formData.asset_type}`,
      text: [
        `New Canva edit request`,
        `From: ${requesterName}${userEmail ? ` (${userEmail})` : ''}`,
        `Asset type: ${formData.asset_type}`,
        `Instructions: ${formData.instructions}`,
        `Canva link: ${formData.canva_link}`,
        `Submitted: ${submittedAt}`,
        ``,
        `Review: https://studio.outsidethebachs.com/admin?tab=canva`,
      ].join('\n'),
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td align="center" style="padding-bottom:24px;">
          <img src="https://studio.outsidethebachs.com/otb-logo.png" alt="Outside The Bachs" width="140" style="display:block;"/>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:12px;padding:36px 40px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
          <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">New Canva Request</h2>
          <table style="width:100%;font-size:14px;color:#374151;border-collapse:collapse;">
            <tr><td style="padding:4px 0;color:#6b7280;width:120px;">From</td><td>${esc(requesterName)}${userEmail ? ` (${esc(userEmail)})` : ''}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">Asset type</td><td>${esc(formData.asset_type)}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;vertical-align:top;">Instructions</td><td>${esc(formData.instructions)}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">Canva link</td><td><a href="${esc(formData.canva_link)}" style="color:#0284a8;">${esc(formData.canva_link)}</a></td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">Submitted</td><td>${submittedAt}</td></tr>
          </table>
          <div style="margin-top:24px;">
            <a href="https://studio.outsidethebachs.com/admin?tab=canva"
               style="display:inline-block;padding:10px 20px;background:#0284a8;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
              View in admin →
            </a>
          </div>
        </td></tr>
        <tr><td align="center" style="padding-top:24px;font-size:12px;color:#9ca3af;">
          <a href="https://outsidethebachs.com" style="color:#9ca3af;text-decoration:none;">outsidethebachs.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
    })
  } catch (err) {
    console.error('[canva-edits] designer notification email failed:', err)
  }

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

// Admins plus designer emails (Canva-tab-only access)
async function requireCanvaAccess() {
  const caller = await requireAdmin()
  if (caller) return caller

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user && isDesignerEmail(user.email)) return user

  return null
}

export async function getAdminCanvaRequests(): Promise<AdminCanvaRequest[]> {
  const caller = await requireCanvaAccess()
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
  const caller = await requireCanvaAccess()
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
