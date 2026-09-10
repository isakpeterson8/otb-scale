import { cookies } from 'next/headers'
import { adminClient } from '@/lib/supabase/admin'
import { getCachedClient, getCachedUser, getCachedProfile } from '@/lib/supabase/cached'

type StudioContext = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
  studioId: string
  userId: string
  userEmail: string | null
  viewOnly: boolean
  isAdmin: boolean
}

export async function getStudioId(): Promise<StudioContext | null> {
  const cookieStore = await cookies()
  const viewAsStudioId = cookieStore.get('view_as_studio_id')?.value

  const user = await getCachedUser()
  if (!user) return null
  const supabase = await getCachedClient()

  // Admin is viewing as another studio — use service-role client to bypass RLS
  if (viewAsStudioId) {
    return { supabase: adminClient, studioId: viewAsStudioId, userId: user.id, userEmail: user.email ?? null, viewOnly: true, isAdmin: true }
  }

  const profile = await getCachedProfile(user.id)

  // Three-way admin check: profiles table role, AND ADMIN_EMAILS env var as fallback
  // (admin profiles may have been manually inserted with a UUID that doesn't match auth user ID)
  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase())
  const isAdmin =
    profile?.role === 'otb_admin' ||
    profile?.role === 'otb_staff' ||
    !!(user.email && adminEmails.includes(user.email.toLowerCase()))

  // Fast path: profile already has a studio_id
  if (profile?.studio_id) {
    return { supabase, studioId: profile.studio_id, userId: user.id, userEmail: user.email ?? null, viewOnly: false, isAdmin }
  }

  // Look for a studio this user already owns
  const { data: existing } = await supabase
    .from('studios')
    .select('id')
    .eq('owner_user_id', user.id)
    .limit(1)
    .maybeSingle()

  let studioId: string

  if (existing?.id) {
    studioId = existing.id
  } else {
    // Create one on-demand
    const studioName =
      (profile?.display_name?.trim() || user.email?.split('@')[0] || 'My') + "'s Studio"

    // Check for a pre-existing admin access grant for this email
    let initialTier = 'free'
    if (user.email) {
      const { data: grant } = await adminClient
        .from('admin_access_grants')
        .select('tier')
        .eq('email', user.email.toLowerCase())
        .is('revoked_at', null)
        .order('granted_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (grant?.tier) initialTier = grant.tier
    }

    const { data: created, error } = await supabase
      .from('studios')
      .insert({ owner_user_id: user.id, name: studioName, subscription_tier: initialTier })
      .select('id')
      .single()

    if (error?.code === '23505') {
      // Lost a race: a concurrent call for this same user already created the
      // studio. On a user's first authenticated load several server components
      // call getStudioId() at once, all see no studio, and all insert — which
      // is how this database ended up with 78 duplicate studios. Adopt the
      // winner's row rather than failing; without this the loser would be
      // returned null and bounced to /auth/login on their very first load.
      //
      // No-op until a unique constraint on studios.owner_user_id exists, since
      // nothing raises 23505 before then.
      const { data: winner, error: reselectError } = await supabase
        .from('studios')
        .select('id')
        .eq('owner_user_id', user.id)
        .limit(1)
        .maybeSingle()

      if (reselectError || !winner) {
        console.error('[getStudioId] studio re-select after 23505 failed:', reselectError?.message, reselectError?.code)
        return null
      }
      studioId = winner.id
    } else if (error || !created) {
      // Every other failure behaves exactly as before.
      console.error('[getStudioId] studio insert failed:', error?.message, error?.code, error?.details)
      return null
    } else {
      studioId = created.id
    }
  }

  // Backfill the profile so future calls hit the fast path
  const { error: profileUpdateError } = await supabase
    .from('profiles')
    .update({ studio_id: studioId })
    .eq('id', user.id)
  if (profileUpdateError) {
    console.error('[getStudioId] profile backfill failed:', profileUpdateError.message, profileUpdateError.code)
  }

  return { supabase, studioId, userId: user.id, userEmail: user.email ?? null, viewOnly: false, isAdmin }
}
