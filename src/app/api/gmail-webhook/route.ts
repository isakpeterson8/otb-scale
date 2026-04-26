import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'

export async function GET() {
  return runCheck()
}

export async function POST() {
  return runCheck()
}

async function getTokenForUser(userId: string): Promise<string | null> {
  const { data: settings } = await adminClient
    .from('settings')
    .select('gmail_access_token, gmail_refresh_token, gmail_token_expiry')
    .eq('user_id', userId)
    .single()

  if (!settings?.gmail_access_token || !settings?.gmail_refresh_token) return null

  const expiry = settings.gmail_token_expiry ? new Date(settings.gmail_token_expiry).getTime() : 0
  if (expiry - Date.now() >= 60_000) return settings.gmail_access_token

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
  await adminClient
    .from('settings')
    .update({
      gmail_access_token: tokens.access_token,
      gmail_token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    })
    .eq('user_id', userId)

  return tokens.access_token
}

async function runCheck() {
  const { data: enrollments } = await adminClient
    .from('cadence_enrollments')
    .select('id, user_id, school_id, gmail_thread_id')
    .eq('status', 'active')
    .not('gmail_thread_id', 'is', null)

  if (!enrollments?.length) {
    return NextResponse.json({ detected: 0, checked: 0 })
  }

  // Fetch tokens once per unique user
  const uniqueUserIds = [...new Set(enrollments.map(e => e.user_id as string))]
  const tokenMap = new Map<string, string>()
  await Promise.all(
    uniqueUserIds.map(async userId => {
      const token = await getTokenForUser(userId)
      if (token) tokenMap.set(userId, token)
    })
  )

  let detected = 0
  for (const e of enrollments as { id: string; user_id: string; school_id: string; gmail_thread_id: string }[]) {
    const token = tokenMap.get(e.user_id)
    if (!token) continue

    try {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${e.gmail_thread_id}?format=minimal`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) continue

      const thread = await res.json() as { messages?: unknown[] }
      if ((thread.messages?.length ?? 0) > 1) {
        await adminClient
          .from('cadence_enrollments')
          .update({
            status: 'replied',
            removed_at: new Date().toISOString(),
            removal_reason: 'reply_detected',
          })
          .eq('id', e.id)

        await adminClient
          .from('school_outreach')
          .update({ stage: 'replied' })
          .eq('id', e.school_id)

        detected++
      }
    } catch {
      // ignore per-thread errors
    }
  }

  return NextResponse.json({ detected, checked: enrollments.length })
}
