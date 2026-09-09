import { getCachedClient, getCachedProfile, getCachedUser } from '@/lib/supabase/cached'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface StaffContext {
  supabase: SupabaseClient
  userId: string
  role: 'otb_admin' | 'otb_staff'
}

/**
 * The staff caller plus their REQUEST-SCOPED Supabase client.
 *
 * The client carries the staff member's own session, so RLS — is_staff() on the
 * work_plan tables — is the real gate and these surfaces fail closed (empty) if
 * the gate is misconfigured. Deliberately never the service role: the existing
 * /admin pages reach for adminClient, and this feature does not follow them.
 * The seed script is the only sanctioned service-role bypass.
 *
 * Returns null for anyone who is not staff; callers redirect or refuse.
 */
export async function getStaffContext(): Promise<StaffContext | null> {
  const user = await getCachedUser()
  if (!user) return null

  const profile = await getCachedProfile(user.id)
  if (profile?.role !== 'otb_admin' && profile?.role !== 'otb_staff') return null

  return { supabase: await getCachedClient(), userId: user.id, role: profile.role }
}
