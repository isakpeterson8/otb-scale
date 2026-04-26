'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import type { UserRole } from '@/types/database'

// ── Gmail helpers ────────────────────────────────────────────────────────────

async function getAdminAccessToken(): Promise<{ token: string | null; error: string | null }> {
  console.log('[admin-gmail] Step 1: fetching otb_admin profile for Gmail tokens')

  const { data: adminProfile, error: profileErr } = await adminClient
    .from('profiles')
    .select('id')
    .eq('role', 'otb_admin')
    .limit(1)
    .maybeSingle()

  if (profileErr) {
    console.error('[admin-gmail] Step 1 FAILED: could not query profiles:', profileErr.message)
    return { token: null, error: `Profile query failed: ${profileErr.message}` }
  }
  if (!adminProfile?.id) {
    console.error('[admin-gmail] Step 2: no otb_admin profile found')
    return { token: null, error: 'No otb_admin account found' }
  }

  console.log('[admin-gmail] Step 2: found admin profile, fetching Gmail settings for user', adminProfile.id)

  const { data: settings, error: settingsErr } = await adminClient
    .from('settings')
    .select('gmail_access_token, gmail_refresh_token, gmail_token_expiry')
    .eq('user_id', adminProfile.id)
    .maybeSingle()

  if (settingsErr) {
    console.error('[admin-gmail] Step 2 FAILED: could not query settings:', settingsErr.message)
    return { token: null, error: `Settings query failed: ${settingsErr.message}` }
  }
  if (!settings) {
    console.error('[admin-gmail] Step 2: no settings row found for admin user', adminProfile.id)
    return { token: null, error: 'No settings found for admin account' }
  }

  console.log('[admin-gmail] Step 3: settings found. Has access_token:', !!settings.gmail_access_token, '| Has refresh_token:', !!settings.gmail_refresh_token, '| Expiry:', settings.gmail_token_expiry)

  if (!settings.gmail_access_token || !settings.gmail_refresh_token) {
    console.error('[admin-gmail] Step 3: Gmail not connected — missing tokens')
    return { token: null, error: 'Admin Gmail account is not connected. Visit Settings to connect Gmail.' }
  }

  const expiry = settings.gmail_token_expiry ? new Date(settings.gmail_token_expiry).getTime() : 0
  const msUntilExpiry = expiry - Date.now()
  const needsRefresh = msUntilExpiry < 60_000

  console.log('[admin-gmail] Step 3: token expires in', Math.round(msUntilExpiry / 1000), 'seconds. Needs refresh:', needsRefresh)

  if (!needsRefresh) {
    console.log('[admin-gmail] Step 3: using existing access token (still valid)')
    return { token: settings.gmail_access_token, error: null }
  }

  console.log('[admin-gmail] Step 4: refreshing token via Google OAuth...')
  const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: settings.gmail_refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  const refreshBody = await refreshRes.text()
  console.log('[admin-gmail] Step 4: refresh response status:', refreshRes.status, '| body:', refreshBody)

  if (!refreshRes.ok) {
    console.error('[admin-gmail] Step 4 FAILED: token refresh returned', refreshRes.status)
    return { token: null, error: `Token refresh failed (${refreshRes.status}): ${refreshBody}` }
  }

  const tokens = JSON.parse(refreshBody) as { access_token: string; expires_in: number }
  const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await adminClient
    .from('settings')
    .update({ gmail_access_token: tokens.access_token, gmail_token_expiry: newExpiry })
    .eq('user_id', adminProfile.id)

  console.log('[admin-gmail] Step 4: token refreshed successfully, new expiry:', newExpiry)
  return { token: tokens.access_token, error: null }
}

function buildRfc2822(to: string, from: string, subject: string, body: string): string {
  const message = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
  ].join('\r\n')
  return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sendAdminEmail(to: string, subject: string, body: string): Promise<{ error: string | null }> {
  const { token, error: tokenError } = await getAdminAccessToken()
  if (!token) return { error: tokenError ?? 'Could not obtain Gmail token' }

  const { data: adminProfile } = await adminClient
    .from('profiles')
    .select('id, email')
    .eq('role', 'otb_admin')
    .limit(1)
    .maybeSingle()

  const fromEmail = adminProfile?.email ?? 'noreply@outsidethebachs.com'
  const fromHeader = `Outside The Bachs <${fromEmail}>`

  const raw = buildRfc2822(to, fromHeader, subject, body)

  console.log('[admin-gmail] Step 5: sending Gmail API request to:', to, '| subject:', subject)

  const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  })

  const gmailBody = await gmailRes.text()
  console.log('[admin-gmail] Step 5: Gmail API response status:', gmailRes.status, '| body:', gmailBody)

  if (!gmailRes.ok) {
    let errMsg: string
    try {
      errMsg = (JSON.parse(gmailBody) as { error?: { message?: string } }).error?.message ?? gmailBody
    } catch {
      errMsg = gmailBody
    }
    console.error('[admin-gmail] Step 5 FAILED: Gmail send error:', errMsg)
    return { error: `Gmail send failed: ${errMsg}` }
  }

  console.log('[admin-gmail] Step 5: email sent successfully')
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
      'Your Outside The Bachs account has been approved!',
      `Hi,\n\nGreat news — your Outside The Bachs account has been approved. You can now log in and start using the platform.\n\nhttps://otb-scale.vercel.app/auth/login\n\nWelcome aboard!\n\nThe OTB Team`
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
      'Update on your Outside The Bachs account',
      `Hi,\n\nThank you for signing up for Outside The Bachs. Unfortunately, we weren't able to approve your account at this time.\n\nIf you believe this is an error or have any questions, please reply to this email.\n\nThe OTB Team`
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
