import { cache } from 'react'
import { createClient } from './server'
import type { UserRole } from '@/types/database'

// These are memoized per request within the RSC render tree.
// AppShell and page server components both need auth.getUser() and the
// profiles row — caching here means one DB call each instead of two.

export const getCachedClient = cache(async () => {
  return await createClient()
})

export const getCachedUser = cache(async () => {
  const supabase = await getCachedClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
})

export type CachedProfile = {
  id: string
  studio_id: string | null
  role: UserRole
  email: string | null
  status: 'pending' | 'approved' | 'rejected' | null
  display_name: string | null
}

export const getCachedProfile = cache(async (userId: string): Promise<CachedProfile | null> => {
  const supabase = await getCachedClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, studio_id, role, email, status, display_name')
    .eq('id', userId)
    .single()
  return (data as CachedProfile | null) ?? null
})
