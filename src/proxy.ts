import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const STRATEGY_SESSION_URL = 'https://login.outsidethebachs.com/music-lesson-studio-strategy-session-request'

// Routes that free-tier users cannot access — redirect to /dashboard with a toast
const FREE_TIER_BLOCKED: { path: string; toast: string }[] = [
  { path: '/facebook-groups', toast: 'Facebook Groups is available on the Scale plan.' },
  { path: '/resources',       toast: 'The Resource Library is available on the Scale plan.' },
  { path: '/school-outreach', toast: 'School Outreach is available on the Scale plan.' },
  { path: '/education',       toast: 'The Education Library is available on the Scale plan.' },
  { path: '/cadence',         toast: 'Cadence Check-In is available on the Scale plan.' },
  { path: '/settings',        toast: '' }, // silent redirect
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
    const blocked = FREE_TIER_BLOCKED.find(r => pathname.startsWith(r.path))
    if (blocked) {
      // Fast path: admin in View As mode for a free-tier studio — redirect without a DB query
      const viewAsStudioId = request.cookies.get('view_as_studio_id')?.value
      const viewAsTier = request.cookies.get('view_as_tier')?.value
      if (viewAsStudioId && viewAsTier === 'free') {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        url.searchParams.delete('toast')
        if (blocked.toast) url.searchParams.set('toast', blocked.toast)
        return NextResponse.redirect(url)
      }

      // Regular check: fetch profile role + studio tier (2 small queries, only on these specific routes)
      const { data: profile } = await supabase
        .from('profiles')
        .select('studio_id, role')
        .eq('id', user.id)
        .single()

      const isAdmin = profile?.role === 'otb_admin' || profile?.role === 'otb_staff'

      if (!isAdmin && profile?.studio_id) {
        const { data: studio } = await supabase
          .from('studios')
          .select('subscription_tier')
          .eq('id', profile.studio_id)
          .single()

        if (studio?.subscription_tier === 'free') {
          const url = request.nextUrl.clone()
          url.pathname = '/dashboard'
          url.searchParams.delete('toast')
          if (blocked.toast) url.searchParams.set('toast', blocked.toast)
          return NextResponse.redirect(url)
        }
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
