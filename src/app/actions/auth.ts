'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getRequestOrigin } from '@/lib/site-url'

export async function signInWithEmail(email: string, password: string) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: error.message }
  redirect('/dashboard')
}

export async function signUpWithEmail(email: string, password: string) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    // Comes back to whichever deployment the signup started on.
    options: { emailRedirectTo: `${await getRequestOrigin()}/auth/callback` },
  })
  if (error) return { error: error.message }
  return { error: null }
}

export async function resetPassword(email: string) {
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await getRequestOrigin()}/auth/callback?type=recovery`,
  })
  if (error) return { error: error.message }
  return { error: null }
}
