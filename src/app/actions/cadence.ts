'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import type { CadenceEnrollment } from '@/types/database'

async function isViewOnly(): Promise<boolean> {
  const cookieStore = await cookies()
  return !!cookieStore.get('view_as_studio_id')?.value
}

async function getValidAccessToken(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data: settings } = await supabase
    .from('settings')
    .select('gmail_access_token, gmail_refresh_token, gmail_token_expiry')
    .eq('user_id', userId)
    .single()

  if (!settings?.gmail_access_token || !settings?.gmail_refresh_token) return null

  const expiry = settings.gmail_token_expiry ? new Date(settings.gmail_token_expiry).getTime() : 0
  const needsRefresh = expiry - Date.now() < 60_000

  if (!needsRefresh) return settings.gmail_access_token

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: settings.gmail_refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) return null

  const tokens = await res.json() as { access_token: string; expires_in: number }
  const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await supabase
    .from('settings')
    .update({ gmail_access_token: tokens.access_token, gmail_token_expiry: newExpiry })
    .eq('user_id', userId)

  return tokens.access_token
}

function bodyToHtml(body: string): string {
  const paragraphs = body.split(/\n\n+/)
  const htmlParts: string[] = []

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue

    const lines = trimmed.split('\n')
    const isBulletBlock = lines.every(l => l.trimStart().startsWith('- '))

    if (isBulletBlock) {
      const items = lines.map(l => `<li>${l.trimStart().slice(2).trim()}</li>`).join('\n')
      htmlParts.push(`<ul style="margin: 0 0 12px; padding-left: 20px;">\n${items}\n</ul>`)
    } else {
      const html = lines.map(l => l.trimStart().startsWith('- ')
        ? `• ${l.trimStart().slice(2).trim()}`
        : l
      ).join('<br>')
      htmlParts.push(`<p style="margin: 0 0 12px;">${html}</p>`)
    }
  }

  return `<div style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #000000; max-width: 600px;">\n${htmlParts.join('\n')}\n</div>`
}

function buildRfc2822(to: string, from: string, subject: string, body: string): string {
  const boundary = 'boundary_otb_' + Date.now()

  const plainText = body.trim()
  const htmlBody = bodyToHtml(body)

  const message = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    plainText,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
  ].join('\r\n')

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export async function sendCadenceEmail({
  enrollmentId,
  toEmail,
  toName,
  subject,
  body,
}: {
  enrollmentId: string
  toEmail: string
  toName: string | null
  subject: string
  body: string
}): Promise<{ error: string | null; threadId: string | null }> {
  if (await isViewOnly()) return { error: 'View only mode', threadId: null }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', threadId: null }

  const accessToken = await getValidAccessToken(supabase, user.id)
  if (!accessToken) return { error: 'Gmail not connected. Connect your account in Settings.', threadId: null }

  const { data: settingsRow } = await supabase
    .from('settings')
    .select('sender_name, reply_to_email')
    .eq('user_id', user.id)
    .single()

  const fromName = settingsRow?.sender_name || user.email!
  const fromHeader = settingsRow?.sender_name ? `${fromName} <${user.email}>` : user.email!
  const toHeader = toName ? `${toName} <${toEmail}>` : toEmail

  const raw = buildRfc2822(toHeader, fromHeader, subject, body)

  const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  })

  if (!gmailRes.ok) {
    const err = await gmailRes.json() as { error?: { message?: string } }
    return { error: err?.error?.message ?? 'Gmail send failed', threadId: null }
  }

  const sent = await gmailRes.json() as { threadId: string }
  const threadId = sent.threadId ?? null

  if (threadId) {
    await supabase
      .from('cadence_enrollments')
      .update({ gmail_thread_id: threadId })
      .eq('id', enrollmentId)
      .eq('user_id', user.id)
  }

  revalidatePath('/school-outreach')
  return { error: null, threadId }
}

export async function enrollInCadence(schoolId: string, openingTemplate: string) {
  if (await isViewOnly()) return { error: 'View only mode' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Complete any active enrollment before creating a new one
  await supabase
    .from('cadence_enrollments')
    .update({ status: 'completed' })
    .eq('school_id', schoolId)
    .eq('user_id', user.id)
    .eq('status', 'active')

  const { error } = await supabase.from('cadence_enrollments').insert({
    school_id: schoolId,
    user_id: user.id,
    opening_template: openingTemplate,
    current_email_number: 0,
    status: 'active',
  })

  if (error) return { error: error.message }
  revalidatePath('/school-outreach')
  return { error: null }
}

export async function markEmailSent(enrollmentId: string, emailNumber: number) {
  if (await isViewOnly()) return { error: 'View only mode' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const now = new Date()
  const nextDue = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000)
  const isLast = emailNumber === 4

  const updates: Record<string, unknown> = {
    [`email_${emailNumber}_sent_at`]: now.toISOString(),
    current_email_number: emailNumber,
    status: isLast ? 'completed' : 'active',
  }

  if (!isLast) {
    updates[`email_${emailNumber + 1}_due_at`] = nextDue.toISOString()
  }

  const { error } = await supabase
    .from('cadence_enrollments')
    .update(updates)
    .eq('id', enrollmentId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/school-outreach')
  return { error: null }
}

export async function removeFromCadence(enrollmentId: string, reason: 'manual' | 'reply_detected') {
  if (await isViewOnly()) return { error: 'View only mode' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('cadence_enrollments')
    .update({
      status: reason === 'reply_detected' ? 'replied' : 'removed',
      removed_at: new Date().toISOString(),
      removal_reason: reason,
    })
    .eq('id', enrollmentId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/school-outreach')
  return { error: null }
}

export async function getEnrollmentForSchool(schoolId: string): Promise<CadenceEnrollment | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('cadence_enrollments')
    .select('*')
    .eq('school_id', schoolId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as CadenceEnrollment | null) ?? null
}

export async function checkGmailReplies(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const { data: enrollments } = await supabase
    .from('cadence_enrollments')
    .select('id, gmail_thread_id, school_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .not('gmail_thread_id', 'is', null)

  if (!enrollments?.length) return 0

  const accessToken = await getValidAccessToken(supabase, user.id)
  if (!accessToken) return 0

  let detected = 0
  for (const e of enrollments as { id: string; gmail_thread_id: string; school_id: string }[]) {
    try {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${e.gmail_thread_id}?format=minimal`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!res.ok) continue
      const thread = await res.json() as { messages?: unknown[] }
      if ((thread.messages?.length ?? 0) > 1) {
        await removeFromCadence(e.id, 'reply_detected')
        await supabase
          .from('school_outreach')
          .update({ stage: 'replied' })
          .eq('id', e.school_id)
        detected++
      }
    } catch {
      // ignore per-thread errors
    }
  }

  if (detected > 0) revalidatePath('/school-outreach')
  return detected
}
