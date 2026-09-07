import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { GRADUATE_BLOCKED, graduateBlockedRoute } from '@/lib/features'

const STRATEGY_SESSION_URL = 'https://login.outsidethebachs.com/music-lesson-studio-strategy-session-request'

// Cached tier cookie: set after the first DB query on a blocked route, valid for 5 minutes.
// Value format: `${userId}:${tier}` — scoped to user so a shared browser can't reuse stale data.
const TIER_COOKIE = '_tier'
const TIER_COOKIE_MAX_AGE = 60 * 5

// Routes that free-tier users cannot access — redirect to /dashboard with a toast
const FREE_TIER_BLOCKED: { path: string; toast: string }[] = [
  { path: '/facebook-groups', toast: 'Facebook Groups is available on the Scale plan.' },
  { path: '/resources',       toast: 'The Resource Library is available on the Scale plan.' },
  { path: '/school-outreach', toast: 'School Outreach is available on the Scale plan.' },
  { path: '/education',       toast: 'The Education Library is available on the Scale plan.' },
  { path: '/cadence',         toast: 'Cadence Check-In is available on the Scale plan.' },
  // /settings is intentionally NOT blocked — free tier users can access it
]

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  if (!user && !pathname.startsWith('/auth')) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
  }

  // Tier-based route protection — only runs for logged-in users on blocked paths
  if (user) {
    const freeBlocked = FREE_TIER_BLOCKED.find(r => pathname.startsWith(r.path))
    const graduateCandidate = GRADUATE_BLOCKED.some(r => pathname.startsWith(r.path))

    if (freeBlocked || graduateCandidate) {
      const cookieOpts = { httpOnly: true, path: '/', sameSite: 'lax' as const, maxAge: TIER_COOKIE_MAX_AGE }

      // The route this tier may not reach, or null when it is allowed through.
      // Free keeps its existing list; graduate uses the shared GRADUATE_BLOCKED set.
      const blockedFor = (tier: string) =>
        tier === 'free' ? (freeBlocked ?? null) : graduateBlockedRoute(tier, pathname)

      const bounce = (hit: { toast: string }, extraCookie?: { value: string }) => {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        url.searchParams.delete('toast')
        if (hit.toast) url.searchParams.set('toast', hit.toast)
        const redirectResponse = NextResponse.redirect(url)
        if (extraCookie) redirectResponse.cookies.set(TIER_COOKIE, extraCookie.value, cookieOpts)
        return redirectResponse
      }

      // Fast path: admin in View As — the viewed studio's tier decides, so an
      // admin viewing a graduate studio sees its restrictions, exactly as
      // View-As-free already worked.
      const viewAsStudioId = request.cookies.get('view_as_studio_id')?.value
      const viewAsTier = request.cookies.get('view_as_tier')?.value
      if (viewAsStudioId && viewAsTier) {
        const hit = blockedFor(viewAsTier)
        if (hit) return bounce(hit)
        return supabaseResponse
      }

      // Fast path: cached tier from a previous DB query (5-minute window, user-scoped)
      const cachedTierValue = request.cookies.get(TIER_COOKIE)?.value
      if (cachedTierValue) {
        const colonIdx = cachedTierValue.indexOf(':')
        const cachedUserId = cachedTierValue.slice(0, colonIdx)
        const cachedTier = cachedTierValue.slice(colonIdx + 1)
        if (cachedUserId === user.id && cachedTier) {
          // 'admin' is written for real admins below and bypasses every block.
          const hit = cachedTier === 'admin' ? null : blockedFor(cachedTier)
          if (hit) return bounce(hit)
          return supabaseResponse
        }
      }

      // Regular check: fetch profile role + studio tier (2 small queries, only on these specific routes)
      const { data: profile } = await supabase
        .from('profiles')
        .select('studio_id, role')
        .eq('id', user.id)
        .single()

      const isAdmin = profile?.role === 'otb_admin' || profile?.role === 'otb_staff'

      if (isAdmin) {
        supabaseResponse.cookies.set(TIER_COOKIE, `${user.id}:admin`, cookieOpts)
      } else if (profile?.studio_id) {
        const { data: studio } = await supabase
          .from('studios')
          .select('subscription_tier')
          .eq('id', profile.studio_id)
          .single()

        const tier = studio?.subscription_tier ?? 'free'
        const hit = blockedFor(tier)
        if (hit) return bounce(hit, { value: `${user.id}:${tier}` })
        supabaseResponse.cookies.set(TIER_COOKIE, `${user.id}:${tier}`, cookieOpts)
      }
    }
  }

  return supabaseResponse
}

export { STRATEGY_SESSION_URL }

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|fonts|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
