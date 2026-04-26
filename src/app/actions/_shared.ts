import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

type StudioContext = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
  studioId: string
  userId: string
  viewOnly: boolean
}

export async function getStudioId(): Promise<StudioContext | null> {
  const cookieStore = await cookies()
  const viewAsStudioId = cookieStore.get('view_as_studio_id')?.value

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Admin is viewing as another studio — use service-role client to bypass RLS
  if (viewAsStudioId) {
    return { supabase: adminClient, studioId: viewAsStudioId, userId: user.id, viewOnly: true }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('studio_id, display_name')
    .eq('id', user.id)
    .single()

  // Fast path: profile already has a studio_id
  if (profile?.studio_id) {
    return { supabase, studioId: profile.studio_id, userId: user.id, viewOnly: false }
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
    const { data: created, error } = await supabase
      .from('studios')
      .insert({ owner_user_id: user.id, name: studioName })
      .select('id')
      .single()
    if (error || !created) {
      console.error('[getStudioId] studio insert failed:', error?.message, error?.code, error?.details)
      return null
    }
    studioId = created.id
  }

  // Backfill the profile so future calls hit the fast path
  const { error: profileUpdateError } = await supabase
    .from('profiles')
    .update({ studio_id: studioId })
    .eq('id', user.id)
  if (profileUpdateError) {
    console.error('[getStudioId] profile backfill failed:', profileUpdateError.message, profileUpdateError.code)
  }

  return { supabase, studioId, userId: user.id, viewOnly: false }
}
