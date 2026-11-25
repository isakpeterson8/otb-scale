import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getStaffContext } from '@/lib/staff'
import { getRequestOrigin } from '@/lib/site-url'
import { LSS_CALENDAR_OWNER, LSS_GOOGLE_SCOPES, LSS_OAUTH_STATE_COOKIE, lssOAuthConfig } from '@/lib/lss-google'

/** Starts "Connect Google Calendar" for the Live Support calendar owner. Staff only. */
export async function GET() {
  const origin = await getRequestOrigin()
  const staff = await getStaffContext()
  if (!staff) return NextResponse.redirect(`${origin}/auth/login?redirectTo=%2Fadmin%2Flss`)

  const cfg = lssOAuthConfig()
  if (!cfg) return NextResponse.redirect(`${origin}/admin/lss?google_error=not_configured`)

  const state = randomBytes(24).toString('base64url')
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: LSS_GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    login_hint: LSS_CALENDAR_OWNER,
    hd: 'outsidethebachs.com',
    state,
  })

  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
  res.cookies.set(LSS_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/callback/google-lss',
    maxAge: 600,
  })
  return res
}
