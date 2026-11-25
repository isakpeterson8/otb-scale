import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getStaffContext } from '@/lib/staff'
import { getOriginFromRequest } from '@/lib/site-url'
import { LSS_OAUTH_STATE_COOKIE, exchangeCodeAndStore } from '@/lib/lss-google'

export async function GET(request: NextRequest) {
  const back = `${await getOriginFromRequest(request)}/admin/lss`
  const fail = (code: string) => {
    const res = NextResponse.redirect(`${back}?google_error=${encodeURIComponent(code)}`)
    res.cookies.delete({ name: LSS_OAUTH_STATE_COOKIE, path: '/api/auth/callback/google-lss' })
    return res
  }

  const { searchParams } = new URL(request.url)
  const error = searchParams.get('error')
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  if (error) return fail(error)
  if (!code) return fail('missing_code')

  const expected = request.cookies.get(LSS_OAUTH_STATE_COOKIE)?.value
  if (!expected || !state || state !== expected) return fail('state_mismatch')

  const staff = await getStaffContext()
  if (!staff) return fail('unauthorized')

  try {
    // Throws WrongAccountError (and saves nothing) for any account but the calendar owner.
    await exchangeCodeAndStore(code, staff.userId)
  } catch (err) {
    return fail(err instanceof Error ? err.message.slice(0, 200) : 'token_exchange_failed')
  }

  const res = NextResponse.redirect(`${back}?google_connected=1`)
  res.cookies.delete({ name: LSS_OAUTH_STATE_COOKIE, path: '/api/auth/callback/google-lss' })
  return res
}
