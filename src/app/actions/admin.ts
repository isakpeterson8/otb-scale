'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import type { UserRole } from '@/types/database'

export async function updateUserRole(profileId: string, role: UserRole) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'otb_admin') return { error: 'Only super admins can change roles' }

  const { error } = await adminClient.from('profiles').update({ role }).eq('id', profileId)
  if (error) return { error: error.message }

  revalidatePath('/admin')
  return { error: null }
}

export async function approveUser(userId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'otb_admin' && caller?.role !== 'otb_staff') return { error: 'Insufficient permissions' }

  const { error } = await adminClient.from('profiles').update({ status: 'approved' }).eq('id', userId)
  if (error) return { error: error.message }

  revalidatePath('/admin')
  return { error: null }
}

export async function rejectUser(userId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'otb_admin' && caller?.role !== 'otb_staff') return { error: 'Insufficient permissions' }

  const { error } = await adminClient.from('profiles').update({ status: 'rejected' }).eq('id', userId)
  if (error) return { error: error.message }

  revalidatePath('/admin')
  return { error: null }
}

export async function enterViewAs(studioId: string, email: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'otb_admin' && caller?.role !== 'otb_staff') return

  const cookieStore = await cookies()
  cookieStore.set('view_as_studio_id', studioId, { httpOnly: true, path: '/', sameSite: 'strict' })
  cookieStore.set('view_as_email', email, { httpOnly: true, path: '/', sameSite: 'strict' })
  redirect('/dashboard')
}

export async function exitViewAs(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('view_as_studio_id')
  cookieStore.delete('view_as_email')
}
