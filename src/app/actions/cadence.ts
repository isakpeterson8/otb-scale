'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { CONTACT_NAME_PLACEHOLDER, type CadenceEnrollment, type SchoolContact } from '@/types/database'
import { OPENING_TEMPLATES } from '@/lib/emailTemplates'
import { advanceSchoolStage, mapLimit, recordEmailSent, undoEmailSent } from '@/lib/cadence-progress'

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

/**
 * One RFC 5322 mailbox ("Name" <addr>). CR/LF are stripped so a contact name
 * can't inject headers; names with specials are quoted, non-ASCII names are
 * encoded-word so Gmail renders them intact.
 */
function formatMailbox(name: string | null, email: string): string {
  const addr = email.replace(/[\r\n<>]/g, '').trim()
  const display = (name ?? '').replace(/[\r\n]/g, ' ').trim()
  if (!display || display === CONTACT_NAME_PLACEHOLDER) return addr
  if (/[^\x20-\x7e]/.test(display)) {
    return `=?UTF-8?B?${Buffer.from(display, 'utf8').toString('base64')}?= <${addr}>`
  }
  return `"${display.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" <${addr}>`
}

/**
 * Sends the next cadence email to one or more of the school's contacts and
 * logs each recipient in outreach_email_recipients.
 *
 * Recipients are passed as contact ids and re-read here, scoped to the
 * enrollment's school, so the client can't redirect mail to an arbitrary
 * address.
 */
export async function sendCadenceEmail({
  enrollmentId,
  contactIds,
  emailNumber,
  subject,
  body,
}: {
  enrollmentId: string
  contactIds: string[]
  emailNumber: number
  subject: string
  body: string
}): Promise<{ error: string | null; threadId: string | null; stageAdvanced?: boolean; markError?: string | null }> {
  if (await isViewOnly()) return { error: 'View only mode', threadId: null }
  if (contactIds.length === 0) return { error: 'Choose at least one recipient.', threadId: null }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', threadId: null }

  const { data: enrollment } = await supabase
    .from('cadence_enrollments')
    .select('id, school_id, status, current_email_number')
    .eq('id', enrollmentId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!enrollment) return { error: 'Cadence not found.', threadId: null }
  // Refuse before sending rather than send and then fail to record it.
  if (enrollment.status !== 'active') return { error: 'This school is no longer in an active cadence.', threadId: null }
  if (emailNumber !== (enrollment.current_email_number ?? 0) + 1) {
    return { error: `Email ${emailNumber} isn't the next email for this school. Refresh and try again.`, threadId: null }
  }

  const { data: school } = await supabase
    .from('school_outreach')
    .select('studio_id')
    .eq('id', enrollment.school_id)
    .maybeSingle()
  if (!school) return { error: 'School not found.', threadId: null }
  const studioId = school.studio_id as string

  const { data: contactRows, error: contactsError } = await supabase
    .from('school_contacts')
    .select('id, name, email')
    .eq('school_id', enrollment.school_id)
    .in('id', contactIds)
  if (contactsError) return { error: contactsError.message, threadId: null }

  const recipients = ((contactRows ?? []) as Pick<SchoolContact, 'id' | 'name' | 'email'>[])
    .filter((c): c is { id: string; name: string; email: string } => !!c.email?.trim())
  if (recipients.length === 0) {
    return { error: 'None of the selected contacts has an email address.', threadId: null }
  }

  const accessToken = await getValidAccessToken(supabase, user.id)
  if (!accessToken) return { error: 'Gmail not connected. Connect your account in Settings.', threadId: null }

  const { data: settingsRow } = await supabase
    .from('settings')
    .select('sender_name, reply_to_email')
    .eq('user_id', user.id)
    .single()

  const fromName = settingsRow?.sender_name || user.email!
  const fromHeader = settingsRow?.sender_name ? `${fromName} <${user.email}>` : user.email!
  const toHeader = recipients.map(r => formatMailbox(r.name, r.email)).join(', ')

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

  // The email is already sent, so a logging failure is reported in the server
  // log rather than surfaced as a send error.
  const { error: logError } = await supabase.from('outreach_email_recipients').insert(
    recipients.map(r => ({
      studio_id: studioId,
      school_id: enrollment.school_id,
      enrollment_id: enrollmentId,
      school_contact_id: r.id,
      email: r.email,
      name: r.name,
      email_number: emailNumber,
      gmail_thread_id: threadId,
    })),
  )
  if (logError) console.error('[sendCadenceEmail] recipient log insert failed:', logError.message)

  // Same path as "Mark #N sent": steps the cadence and moves Lead → Initial Contact.
  const marked = await recordEmailSent(supabase, user.id, enrollmentId, emailNumber)
  if (marked.error) console.error('[sendCadenceEmail] mark sent failed:', marked.error)

  revalidatePath('/school-outreach')
  return { error: null, threadId, stageAdvanced: marked.stageAdvanced, markError: marked.error }
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
  if (await isViewOnly()) return { error: 'View only mode', stageAdvanced: false }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', stageAdvanced: false }

  const result = await recordEmailSent(supabase, user.id, enrollmentId, emailNumber)
  if (result.error) return { error: result.error, stageAdvanced: false }
  revalidatePath('/school-outreach')
  return { error: null, stageAdvanced: result.stageAdvanced }
}

/**
 * Steps a cadence back one email ("Undo" toast, "Undo last sent").
 * `expectedEmailNumber` guards against undoing a different email than the
 * one the member is looking at.
 */
export async function undoLastEmailSent(enrollmentId: string, expectedEmailNumber?: number) {
  if (await isViewOnly()) return { error: 'View only mode', emailNumber: null, stageReverted: false }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', emailNumber: null, stageReverted: false }

  const result = await undoEmailSent(supabase, user.id, enrollmentId, expectedEmailNumber)
  if (result.error) return { error: result.error, emailNumber: null, stageReverted: false }
  revalidatePath('/school-outreach')
  return { error: null, emailNumber: result.emailNumber, stageReverted: result.stageReverted }
}

const BULK_LIMIT = 500
const BULK_CONCURRENCY = 8

export type BulkSentItem = { enrollmentId: string; emailNumber: number }

/**
 * Bulk "Mark next email sent". The client picks which enrollments and which
 * email each is on (it applies the same-day confirmation); each item goes
 * through the same recordEmailSent as a single mark.
 */
export async function markEmailsSent(items: BulkSentItem[]) {
  const empty = { marked: [] as BulkSentItem[], failed: [] as { enrollmentId: string; error: string }[], stageAdvanced: 0 }
  if (await isViewOnly()) return { error: 'View only mode', ...empty }
  if (items.length > BULK_LIMIT) return { error: `Select at most ${BULK_LIMIT} schools at a time.`, ...empty }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', ...empty }

  const now = new Date()
  const results = await mapLimit(items, BULK_CONCURRENCY, async item => ({
    item,
    result: await recordEmailSent(supabase, user.id, item.enrollmentId, item.emailNumber, now),
  }))

  const out = { ...empty }
  for (const { item, result } of results) {
    if (result.error) out.failed.push({ enrollmentId: item.enrollmentId, error: result.error })
    else {
      out.marked.push(item)
      if (result.stageAdvanced) out.stageAdvanced++
    }
  }
  revalidatePath('/school-outreach')
  return { error: null, ...out }
}

/** Undo for a bulk mark: steps each enrollment back, if it is still on the email that was marked. */
export async function undoEmailsSent(items: BulkSentItem[]) {
  if (await isViewOnly()) return { error: 'View only mode', undone: 0, failed: 0 }
  if (items.length > BULK_LIMIT) return { error: `At most ${BULK_LIMIT} at a time.`, undone: 0, failed: 0 }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', undone: 0, failed: 0 }

  const results = await mapLimit(items, BULK_CONCURRENCY, item =>
    undoEmailSent(supabase, user.id, item.enrollmentId, item.emailNumber),
  )
  const undone = results.filter(r => !r.error).length
  revalidatePath('/school-outreach')
  return { error: null, undone, failed: results.length - undone }
}

/**
 * Bulk "Enroll in cadence". Schools already in an active cadence are skipped
 * rather than restarted; everything else gets a fresh enrollment at Email 1.
 */
export async function bulkEnrollInCadence(schoolIds: string[], openingTemplate: string) {
  if (await isViewOnly()) return { error: 'View only mode', enrolled: 0, skipped: 0 }
  if (schoolIds.length > BULK_LIMIT) return { error: `Select at most ${BULK_LIMIT} schools at a time.`, enrolled: 0, skipped: 0 }
  if (!Object.prototype.hasOwnProperty.call(OPENING_TEMPLATES, openingTemplate)) return { error: 'Unknown opening email.', enrolled: 0, skipped: 0 }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', enrolled: 0, skipped: 0 }

  const { data: active, error: activeError } = await supabase
    .from('cadence_enrollments')
    .select('school_id')
    .in('school_id', schoolIds)
    .eq('user_id', user.id)
    .eq('status', 'active')
  if (activeError) return { error: activeError.message, enrolled: 0, skipped: 0 }
  const activeIds = new Set(((active ?? []) as { school_id: string }[]).map(r => r.school_id))

  // Only schools this member can see (RLS), so ids from elsewhere are dropped.
  const { data: visible, error: visibleError } = await supabase
    .from('school_outreach')
    .select('id')
    .in('id', schoolIds)
  if (visibleError) return { error: visibleError.message, enrolled: 0, skipped: 0 }
  const toEnroll = ((visible ?? []) as { id: string }[]).map(r => r.id).filter(id => !activeIds.has(id))

  if (toEnroll.length > 0) {
    const { error } = await supabase.from('cadence_enrollments').insert(
      toEnroll.map(id => ({
        school_id: id,
        user_id: user.id,
        opening_template: openingTemplate,
        current_email_number: 0,
        status: 'active',
      })),
    )
    if (error) return { error: error.message, enrolled: 0, skipped: 0 }
  }

  revalidatePath('/school-outreach')
  return { error: null, enrolled: toEnroll.length, skipped: schoolIds.length - toEnroll.length }
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
        // Forward-only: a school already past Replied keeps its stage.
        await advanceSchoolStage(supabase, e.school_id, 'replied')
        detected++
      }
    } catch {
      // ignore per-thread errors
    }
  }

  if (detected > 0) revalidatePath('/school-outreach')
  return detected
}
