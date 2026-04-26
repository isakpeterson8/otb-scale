import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  const settingsUrl = `${process.env.GOOGLE_REDIRECT_URI!.split('/api/')[0]}/settings`

  if (error || !code) {
    return NextResponse.redirect(`${settingsUrl}?gmail_error=${error ?? 'missing_code'}`)
  }

  // Confirm there is an authenticated Supabase session
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${settingsUrl}?gmail_error=unauthenticated`)
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(`${settingsUrl}?gmail_error=not_configured`)
  }

  // Exchange authorization code for tokens
  let tokenData: {
    access_token: string
    refresh_token?: string
    expires_in: number
    token_type: string
    error?: string
  }

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    tokenData = await res.json()
  } catch {
    return NextResponse.redirect(`${settingsUrl}?gmail_error=token_fetch_failed`)
  }

  if (tokenData.error || !tokenData.access_token) {
    return NextResponse.redirect(`${settingsUrl}?gmail_error=${tokenData.error ?? 'no_access_token'}`)
  }

  const expiry = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

  // Upsert tokens into settings — never expose them to the client
  const { error: dbError } = await supabase.from('settings').upsert(
    {
      user_id: user.id,
      gmail_access_token: tokenData.access_token,
      // Only overwrite refresh_token when Google sends one (it only sends it on first auth or after disconnect)
      ...(tokenData.refresh_token ? { gmail_refresh_token: tokenData.refresh_token } : {}),
      gmail_token_expiry: expiry,
      gmail_send_enabled: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )

  if (dbError) {
    return NextResponse.redirect(`${settingsUrl}?gmail_error=db_error`)
  }

  return NextResponse.redirect(`${settingsUrl}?gmail_connected=1`)
}
