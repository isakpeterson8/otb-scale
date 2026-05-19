export type SubscriptionTier = 'free' | 'scale' | 'graduate' | 'lifetime'

export type Feature =
  | 'facebook_groups'
  | 'school_outreach'
  | 'cadence_form'
  | 'gmail_integration'
  | 'education_library'

const ACCESS_MATRIX: Record<Feature, SubscriptionTier[]> = {
  facebook_groups:   ['scale', 'lifetime'],
  school_outreach:   ['scale', 'lifetime'],
  cadence_form:      ['scale'],
  gmail_integration: ['scale', 'lifetime'],
  education_library: ['scale', 'lifetime'],
}

export function hasFeatureAccess(tier: string, feature: Feature): boolean {
  return (ACCESS_MATRIX[feature] ?? []).includes(tier as SubscriptionTier)
}

export const FEATURE_LABELS: Record<Feature, string> = {
  facebook_groups:   'Facebook Groups',
  school_outreach:   'School Outreach',
  cadence_form:      'Cadence Form',
  gmail_integration: 'Gmail Integration',
  education_library: 'Education Library',
}

export const TIER_LABELS: Record<SubscriptionTier, string> = {
  free:      'Free',
  scale:     'Scale',
  graduate:  'Graduate',
  lifetime:  'Lifetime',
}
