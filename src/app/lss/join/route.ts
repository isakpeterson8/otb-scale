import { NextResponse, type NextRequest } from 'next/server'
import { getLiveSupportAccess, readZoomJoinUrl } from '@/lib/live-support-server'
import { LSS_JOIN_PATH } from '@/lib/live-support'

// Never cache: the answer depends on who is asking.
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' }

function to(request: NextRequest, pathname: string, params: Record<string, string> = {}) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.search = ''
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return NextResponse.redirect(url, { status: 302, headers: NO_STORE })
}

/**
 * The one door to the Live Support Zoom call. Scale and Lifetime members are
 * 302'd straight to the shared Zoom URL, which is read here with the service
 * role and never rendered into a page or API response. Everyone else lands on
 * a friendly gate page that contains no Zoom link at all.
 */
export async function GET(request: NextRequest) {
  const access = await getLiveSupportAccess()

  if (access.status === 'anonymous') {
    return to(request, '/auth/login', { redirectTo: LSS_JOIN_PATH })
  }
  if (access.status === 'denied') {
    return to(request, '/lss/unavailable', { reason: 'tier' })
  }

  const zoomUrl = await readZoomJoinUrl()
  if (!zoomUrl) return to(request, '/lss/unavailable', { reason: 'not-set' })

  return NextResponse.redirect(zoomUrl, { status: 302, headers: NO_STORE })
}
