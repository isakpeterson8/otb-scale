'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
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

async function fetchSheetData(): Promise<{ headers: string[]; rows: string[][] }> {
  const sheetsId = process.env.GOOGLE_SHEETS_ID
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY

  if (!sheetsId || !serviceAccountKey) {
    throw new Error('GOOGLE_SHEETS_ID or GOOGLE_SERVICE_ACCOUNT_KEY not configured')
  }

  // Parse service account credentials
  const credentials = JSON.parse(serviceAccountKey)
  const { client_email, private_key } = credentials as { client_email: string; private_key: string }

  // Create JWT for Google OAuth2
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }

  const base64url = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')

  const signingInput = `${base64url(header)}.${base64url(payload)}`

  // Sign using Node.js crypto (available in Next.js server environment)
  const { createSign } = await import('crypto')
  const sign = createSign('RSA-SHA256')
  sign.update(signingInput)
  const signature = sign.sign(private_key, 'base64url')

  const jwt = `${signingInput}.${signature}`

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!tokenRes.ok) {
    throw new Error(`Failed to get Google access token: ${await tokenRes.text()}`)
  }

  const { access_token } = await tokenRes.json()

  // Fetch spreadsheet data
  const sheetsRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetsId}/values/A:Z`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  )

  if (!sheetsRes.ok) {
    throw new Error(`Google Sheets API error: ${await sheetsRes.text()}`)
  }

  const sheetsData = await sheetsRes.json()
  const values: string[][] = sheetsData.values ?? []

  if (values.length === 0) return { headers: [], rows: [] }

  const headers = values[0]
  const rows = values.slice(1)
  return { headers, rows }
}

async function runClaudeAnalysis(headers: string[], rows: string[][]): Promise<string> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured')

  // Format sheet data as a readable table
  const rowsText = rows
    .map((row, i) => {
      const fields = headers.map((h, j) => `${h}: ${row[j] ?? ''}`)
      return `--- Response ${i + 1} ---\n${fields.join('\n')}`
    })
    .join('\n\n')

  const prompt = `You are an advisor for Outside the Bachs, a music education business coaching program. Here are the latest cadence check-in responses from studio owners:

${rowsText}

Please provide:
1. **Overall Trends & Sentiment** — Summarize the key themes and the general mood across responses.
2. **Studios Needing Support** — Identify any studios that may need extra encouragement or follow-up, and explain why.
3. **Concerning Patterns** — Flag any issues, red flags, or patterns that need attention from the OTB team.

Be specific and actionable. Reference studio names or specific details where possible.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    throw new Error(`Claude API error: ${await res.text()}`)
  }

  const data = await res.json()
  return data.content?.[0]?.text ?? ''
}

export async function runCadenceAnalysis(): Promise<{
  analysis: string | null
  headers: string[]
  rows: string[][]
  rowCount: number
  error: string | null
  savedAt: string | null
}> {
  if (!await requireAdmin()) {
    return { analysis: null, headers: [], rows: [], rowCount: 0, error: 'Unauthorized', savedAt: null }
  }

  try {
    const { headers, rows } = await fetchSheetData()

    if (rows.length === 0) {
      return { analysis: null, headers, rows, rowCount: 0, error: 'No data found in the Google Sheet', savedAt: null }
    }

    const analysis = await runClaudeAnalysis(headers, rows)

    // Save to DB
    const { data: saved } = await adminClient
      .from('cadence_analyses')
      .insert({ analysis, row_count: rows.length })
      .select('created_at')
      .single()

    revalidatePath('/admin/cadence')

    return {
      analysis,
      headers,
      rows,
      rowCount: rows.length,
      error: null,
      savedAt: saved?.created_at ?? null,
    }
  } catch (err) {
    return {
      analysis: null,
      headers: [],
      rows: [],
      rowCount: 0,
      error: err instanceof Error ? err.message : String(err),
      savedAt: null,
    }
  }
}

export async function getLatestAnalysis(): Promise<{
  analysis: string | null
  rowCount: number | null
  createdAt: string | null
}> {
  const { data } = await adminClient
    .from('cadence_analyses')
    .select('analysis, row_count, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    analysis: data?.analysis ?? null,
    rowCount: data?.row_count ?? null,
    createdAt: data?.created_at ?? null,
  }
}
