export type SubscriptionTier = 'free' | 'scale' | 'graduate' | 'lifetime'

export type Feature =
  | 'facebook_groups'
  | 'school_outreach'
  | 'cadence_form'
  | 'gmail_integration'
  | 'education_library'
  | 'resources'

const ACCESS_MATRIX: Record<Feature, SubscriptionTier[]> = {
  facebook_groups:   ['scale', 'graduate', 'lifetime'],
  school_outreach:   ['scale', 'graduate', 'lifetime'],
  cadence_form:      ['scale', 'graduate', 'lifetime'],
  gmail_integration: ['scale', 'graduate', 'lifetime'],
  education_library: ['scale', 'lifetime'],
  resources:         ['scale', 'graduate', 'lifetime'],
}

export function hasFeatureAccess(tier: string, feature: Feature): boolean {
  return (ACCESS_MATRIX[feature] ?? []).includes(tier as SubscriptionTier)
}

/**
 * Routes a Graduate studio cannot reach. Mirrors FREE_TIER_BLOCKED in
 * src/proxy.ts, but lives here so both the proxy (server) and the Sidebar
 * (client) can import it — nav visibility and route gating share this one
 * source of truth and cannot drift.
 *
 * The education library is NOT listed here: it is denied through the
 * education_library row of ACCESS_MATRIX above, which covers all four
 * /education routes at once.
 *
 * Wording note: a Graduate studio is not "below Scale", so these messages
 * deliberately avoid telling the user to upgrade.
 */
export const GRADUATE_BLOCKED: { path: string; toast: string }[] = [
  { path: '/cadence',               toast: "Cadence Check-In isn't part of the Graduate plan." },
  { path: '/canva-edits',           toast: "Canva Edits isn't part of the Graduate plan." },
  { path: '/squarespace-concierge', toast: "Squarespace Concierge isn't part of the Graduate plan." },
]

/**
 * The GRADUATE_BLOCKED entry covering `pathname`, or null when the tier is
 * allowed there. Returns null for every tier other than graduate, so callers
 * can pass any tier and Scale/Lifetime/Free behaviour is untouched.
 *
 * Pass null/undefined for a viewer who bypasses tier restrictions (a real
 * admin outside View As) to get null back.
 */
export function graduateBlockedRoute(
  tier: string | null | undefined,
  pathname: string,
): { path: string; toast: string } | null {
  if (tier !== 'graduate') return null
  return GRADUATE_BLOCKED.find(r => pathname.startsWith(r.path)) ?? null
}

export const FEATURE_LABELS: Record<Feature, string> = {
  facebook_groups:   'Facebook Groups',
  school_outreach:   'School Outreach',
  cadence_form:      'Cadence Form',
  gmail_integration: 'Gmail Integration',
  education_library: 'Education Library',
  resources:         'Resources',
}

export const TIER_LABELS: Record<SubscriptionTier, string> = {
  free:      'Free',
  scale:     'Scale',
  graduate:  'Graduate',
  lifetime:  'Lifetime',
}
