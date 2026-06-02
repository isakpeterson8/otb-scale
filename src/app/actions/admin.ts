'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { getStudioId } from '@/app/actions/_shared'
import { Resend } from 'resend'
const resend = new Resend(process.env.RESEND_API_KEY)

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

  // Fallback: profiles table lookup can fail when admin profile id doesn't match auth user id
  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase())
  if (user.email && adminEmails.includes(user.email.toLowerCase())) return user

  return null
}

// ── Email helpers ─────────────────────────────────────────────────────────────

function emailShell(bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <img src="https://studio.outsidethebachs.com/otb-logo.png" alt="Outside The Bachs" width="140" style="display:block;" />
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:12px;padding:36px 40px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;font-size:12px;color:#9ca3af;">
              <a href="https://outsidethebachs.com" style="color:#9ca3af;text-decoration:none;">outsidethebachs.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function approvalEmailHtml(): string {
  return emailShell(`
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#111827;">Hi,</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#111827;">
      Great news — your OTB Scale account has been approved!
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#111827;">
      You can now log in and start using the platform.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="background:#04ADEF;border-radius:8px;">
          <a href="https://studio.outsidethebachs.com" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
            Log in to OTB Scale
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 4px;font-size:15px;line-height:1.6;color:#111827;">Welcome aboard!</p>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#6b7280;">The Outside The Bachs Team</p>
  `)
}

function approvalEmailText(): string {
  return `Hi,

Great news — your OTB Scale account has been approved!

You can now log in at: https://studio.outsidethebachs.com

Welcome aboard!
The Outside The Bachs Team`
}

function rejectionEmailHtml(): string {
  return emailShell(`
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#111827;">Hi,</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#111827;">
      Thank you for your interest in OTB Scale. We'd love to connect with you to see if it's the right fit for your studio.
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#111827;">
      Let's schedule a quick strategy session — we'll walk you through the platform and answer any questions you have.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="background:#04ADEF;border-radius:8px;">
          <a href="https://login.outsidethebachs.com/music-lesson-studio-strategy-session-request" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
            Schedule a Strategy Session
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 4px;font-size:15px;line-height:1.6;color:#111827;">Looking forward to connecting!</p>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#6b7280;">The Outside The Bachs Team</p>
  `)
}

function rejectionEmailText(): string {
  return `Hi,

Thank you for your interest in OTB Scale. We'd love to connect with you to see if it's the right fit for your studio.

Schedule a strategy session here:
https://login.outsidethebachs.com/music-lesson-studio-strategy-session-request

Looking forward to connecting!
The Outside The Bachs Team`
}

async function sendAdminEmail(to: string, subject: string, html: string, text: string): Promise<{ error: string | null }> {
  const { error } = await resend.emails.send({
    from: 'Outside The Bachs <noreply@outsidethebachs.com>',
    to: [to],
    subject,
    html,
    text,
  })
  if (error) return { error: error.message }
  return { error: null }
}

// Role assignment is intentionally NOT exposed via the UI.
// To promote a user, run this in the Supabase SQL Editor:
//   UPDATE profiles SET role = 'otb_staff' WHERE email = 'user@example.com';
//   UPDATE profiles SET role = 'otb_admin' WHERE email = 'user@example.com';
// To demote back to studio owner:
//   UPDATE profiles SET role = 'studio_owner' WHERE email = 'user@example.com';

export async function approveUser(userId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'otb_admin' && caller?.role !== 'otb_staff') return { error: 'Insufficient permissions' }

  const { error } = await adminClient.from('profiles').update({ status: 'approved' }).eq('id', userId)
  if (error) return { error: error.message }

  const { data: targetProfile } = await adminClient
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .maybeSingle()

  if (targetProfile?.email) {
    const { error: emailError } = await sendAdminEmail(
      targetProfile.email,
      "You're approved! Welcome to OTB Scale",
      approvalEmailHtml(),
      approvalEmailText(),
    )
    if (emailError) {
      console.error('[approveUser] email send failed:', emailError)
      revalidatePath('/admin')
      return { error: `User approved but email failed: ${emailError}` }
    }
  }

  revalidatePath('/admin')
  return { error: null }
}

export async function rejectUser(userId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'otb_admin' && caller?.role !== 'otb_staff') return { error: 'Insufficient permissions' }

  const { error } = await adminClient.from('profiles').update({ status: 'rejected' }).eq('id', userId)
  if (error) return { error: error.message }

  const { data: targetProfile } = await adminClient
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .maybeSingle()

  if (targetProfile?.email) {
    const { error: emailError } = await sendAdminEmail(
      targetProfile.email,
      'OTB Scale — Next Steps',
      rejectionEmailHtml(),
      rejectionEmailText(),
    )
    if (emailError) {
      console.error('[rejectUser] email send failed:', emailError)
      revalidatePath('/admin')
      return { error: `User rejected but email failed: ${emailError}` }
    }
  }

  revalidatePath('/admin')
  return { error: null }
}

export async function updateStudioTier(studioId: string, tier: string) {
  if (!await requireAdmin()) return { error: 'Unauthorized' }

  const validTiers = ['free', 'scale', 'graduate', 'lifetime']
  if (!validTiers.includes(tier)) return { error: 'Invalid tier' }

  const { error } = await adminClient.from('studios').update({ subscription_tier: tier }).eq('id', studioId)
  if (error) return { error: error.message }

  revalidatePath('/admin')
  return { error: null }
}

export async function enterViewAs(studioId: string, email: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'otb_admin' && caller?.role !== 'otb_staff') return

  // Fetch the viewed studio's tier so we can mirror their tier restrictions
  const { data: studio } = await adminClient
    .from('studios')
    .select('subscription_tier')
    .eq('id', studioId)
    .single()
  const viewedTier = studio?.subscription_tier ?? 'free'

  const cookieStore = await cookies()
  cookieStore.set('view_as_studio_id', studioId, { httpOnly: true, path: '/', sameSite: 'strict' })
  cookieStore.set('view_as_email', email, { httpOnly: true, path: '/', sameSite: 'strict' })
  cookieStore.set('view_as_tier', viewedTier, { httpOnly: true, path: '/', sameSite: 'strict' })
  redirect('/dashboard')
}

export async function exitViewAs(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('view_as_studio_id')
  cookieStore.delete('view_as_email')
  cookieStore.delete('view_as_tier')
}

// ── Tier upgrade requests ─────────────────────────────────────────────────────

export async function requestTierUpgrade(requestedTier: string) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  const { studioId, userEmail } = ctx

  const validTiers = ['scale', 'graduate', 'lifetime']
  if (!validTiers.includes(requestedTier)) return { error: 'Invalid tier' }

  const { error } = await adminClient
    .from('studios')
    .update({ requested_tier: requestedTier })
    .eq('id', studioId)
  if (error) return { error: error.message }

  // Notify OTB admins by email
  const adminNotifyEmails = (process.env.ADMIN_NOTIFY_EMAILS ?? process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim()).filter(Boolean)
  if (adminNotifyEmails.length > 0) {
    await resend.emails.send({
      from: 'Outside The Bachs <noreply@outsidethebachs.com>',
      to: adminNotifyEmails,
      subject: `Tier upgrade request — ${userEmail ?? studioId}`,
      text: `A studio has requested a tier upgrade.\n\nStudio ID: ${studioId}\nUser: ${userEmail ?? 'unknown'}\nRequested tier: ${requestedTier}\n\nApprove in the admin panel: https://studio.outsidethebachs.com/admin`,
    })
  }

  revalidatePath('/admin')
  return { error: null }
}

export interface WatchHistoryEntry {
  id: string
  watch_pct: number
  completed: boolean
  last_watched_at: string
  title: string
  category: string | null
}

export async function getWatchHistory(studioId: string): Promise<{ data: WatchHistoryEntry[] | null; error: string | null }> {
  if (!await requireAdmin()) return { data: null, error: 'Unauthorized' }

  const { data, error } = await adminClient
    .from('education_watch_progress')
    .select('id, watch_pct, completed, last_watched_at, education_library_items(title, category)')
    .eq('studio_id', studioId)
    .order('last_watched_at', { ascending: false })

  if (error) return { data: null, error: error.message }

  const rows: WatchHistoryEntry[] = (data ?? []).map((row: Record<string, unknown>) => {
    const item = (row.education_library_items ?? {}) as { title?: string; category?: string | null }
    return {
      id: row.id as string,
      watch_pct: row.watch_pct as number,
      completed: row.completed as boolean,
      last_watched_at: row.last_watched_at as string,
      title: item.title ?? 'Unknown',
      category: item.category ?? null,
    }
  })

  return { data: rows, error: null }
}

export async function approveTierRequest(studioId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'otb_admin' && caller?.role !== 'otb_staff') return { error: 'Insufficient permissions' }

  const { data: studio } = await adminClient
    .from('studios')
    .select('requested_tier')
    .eq('id', studioId)
    .single()
  if (!studio?.requested_tier) return { error: 'No upgrade request found for this studio' }

  const { error } = await adminClient
    .from('studios')
    .update({
      subscription_tier: studio.requested_tier,
      requested_tier: null,
      tier_updated_at: new Date().toISOString(),
      tier_updated_by: user.id,
    })
    .eq('id', studioId)
  if (error) return { error: error.message }

  revalidatePath('/admin')
  return { error: null }
}
