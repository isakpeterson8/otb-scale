import { headers } from 'next/headers'

/**
 * The origin the current request actually arrived on, for building auth
 * redirect URLs that come back to wherever the user started.
 *
 * Why not a NEXT_PUBLIC_SITE_URL env var: one value cannot be right for
 * production and for every preview deployment at once, and previews get a fresh
 * hostname per branch. Deriving it per request means no env var to keep in sync.
 *
 * SECURITY — this is the classic host-header injection surface. A password-reset
 * link is built from this value, so an attacker who could set the host would
 * receive a link containing the victim's code. Two things prevent that:
 *
 *   1. The host must match ALLOWED_HOST_PATTERNS below. Anything else falls back
 *      to PRODUCTION_ORIGIN, so an unexpected Host yields a useless-to-attacker
 *      production link rather than an attacker-controlled one.
 *   2. Supabase independently validates redirectTo against its own allowed
 *      redirect list and falls back to the project's Site URL on a miss.
 *
 * Keep both. Neither is load-bearing alone.
 */

const PRODUCTION_ORIGIN = 'https://studio.outsidethebachs.com'

const ALLOWED_HOST_PATTERNS: RegExp[] = [
  /^studio\.outsidethebachs\.com$/,
  /**
   * This project's Vercel hostnames only. The `-isaks-projects-19b4ab7e` team
   * suffix is the security-relevant part: anyone can register a *.vercel.app
   * subdomain, so a bare /^[a-z0-9-]+\.vercel\.app$/ would let a stranger's
   * deployment be treated as ours.
   *
   * Covers both shapes Vercel serves:
   *   branch alias  otb-scale-git-feature-client-wor-907e2f-isaks-projects-19b4ab7e.vercel.app
   *   immutable     otb-scale-83tqtg7ev-isaks-projects-19b4ab7e.vercel.app
   */
  /^otb-scale(?:-[a-z0-9-]+)?-isaks-projects-19b4ab7e\.vercel\.app$/,
  /^localhost(:\d+)?$/,
  /^127\.0\.0\.1(:\d+)?$/,
]

/** x-forwarded-* may be a comma-joined list; the client-nearest value is first. */
function firstValue(header: string | null): string | null {
  if (!header) return null
  const value = header.split(',')[0]?.trim()
  return value && value.length > 0 ? value : null
}

export async function getRequestOrigin(): Promise<string> {
  const h = await headers()

  const host = firstValue(h.get('x-forwarded-host')) ?? firstValue(h.get('host'))
  if (!host || !ALLOWED_HOST_PATTERNS.some(re => re.test(host))) {
    return PRODUCTION_ORIGIN
  }

  const proto =
    firstValue(h.get('x-forwarded-proto')) ??
    (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? 'http' : 'https')

  return `${proto}://${host}`
}

/**
 * Same rules, for a route handler that already has the Request. Falls back to
 * the header-derived origin, then production.
 */
export async function getOriginFromRequest(request: Request): Promise<string> {
  try {
    const { host, protocol } = new URL(request.url)
    if (ALLOWED_HOST_PATTERNS.some(re => re.test(host))) return `${protocol}//${host}`
  } catch {
    // fall through
  }
  return getRequestOrigin()
}
