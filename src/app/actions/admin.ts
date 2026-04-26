'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'
import type { UserRole } from '@/types/database'

const resend = new Resend(process.env.RESEND_API_KEY)

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

export async function updateUserRole(profileId: string, role: UserRole) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'otb_admin') return { error: 'Only super admins can change roles' }

  const { error } = await adminClient.from('profiles').update({ role }).eq('id', profileId)
  if (error) return { error: error.message }

  revalidatePath('/admin')
  return { error: null }
}

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

export async function enterViewAs(studioId: string, email: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'otb_admin' && caller?.role !== 'otb_staff') return

  const cookieStore = await cookies()
  cookieStore.set('view_as_studio_id', studioId, { httpOnly: true, path: '/', sameSite: 'strict' })
  cookieStore.set('view_as_email', email, { httpOnly: true, path: '/', sameSite: 'strict' })
  redirect('/dashboard')
}

export async function exitViewAs(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('view_as_studio_id')
  cookieStore.delete('view_as_email')
}
