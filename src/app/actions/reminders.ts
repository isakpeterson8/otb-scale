'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { getStudioId } from '@/app/actions/_shared'

export interface Reminder {
  id: string
  studio_id: string
  user_id: string
  type: 'cadence_weekly' | 'data_recap_monthly' | 'admin_manual'
  message: string | null
  is_read: boolean
  created_at: string
}

export async function getUnreadReminders(): Promise<Reminder[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('reminders')
    .select('id, studio_id, user_id, type, message, is_read, created_at')
    .eq('user_id', user.id)
    .eq('is_read', false)
    .order('created_at', { ascending: false })

  return (data ?? []) as Reminder[]
}

export async function markReminderRead(reminderId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('reminders')
    .update({ is_read: true })
    .eq('id', reminderId)
    .eq('user_id', user.id)

  revalidatePath('/', 'layout')
}

// Idempotent — skips if reminder of that type already exists for user in current week/month
export async function generateReminders(): Promise<void> {
  const ctx = await getStudioId()
  if (!ctx) return

  const { supabase, studioId, userId, isAdmin } = ctx
  // Only generate for studio owners with a real studio context
  if (isAdmin) return

  const { data: studio } = await supabase
    .from('studios')
    .select('subscription_tier')
    .eq('id', studioId)
    .single()

  const tier = studio?.subscription_tier ?? 'free'
  const now = new Date()
  const todayUTC = now.toISOString().slice(0, 10)

  // cadence_weekly: only Scale tier, only on Mondays (0=Sun, 1=Mon)
  if (tier === 'scale' && now.getUTCDay() === 1) {
    // Check if one already exists this week (Mon–Sun)
    const weekStart = new Date(now)
    weekStart.setUTCDate(now.getUTCDate() - now.getUTCDay() + 1)
    const weekStartStr = weekStart.toISOString().slice(0, 10)

    const { data: existing } = await supabase
      .from('reminders')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'cadence_weekly')
      .gte('created_at', weekStartStr)
      .maybeSingle()

    if (!existing) {
      await supabase.from('reminders').insert({
        studio_id: studioId,
        user_id: userId,
        type: 'cadence_weekly',
        message: 'Complete your weekly Cadence Check-In form.',
      })
    }
  }

  // data_recap_monthly: all tiers, only on 1st of month
  if (now.getUTCDate() === 1) {
    const monthStart = todayUTC.slice(0, 7) + '-01'

    const { data: existing } = await supabase
      .from('reminders')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'data_recap_monthly')
      .gte('created_at', monthStart)
      .maybeSingle()

    if (!existing) {
      await supabase.from('reminders').insert({
        studio_id: studioId,
        user_id: userId,
        type: 'data_recap_monthly',
        message: 'Complete your monthly data recap to track studio growth.',
      })
    }
  }
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'otb_admin' || profile?.role === 'otb_staff') return user

  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase())
  if (user.email && adminEmails.includes(user.email.toLowerCase())) return user

  return null
}

export async function sendAdminReminder(
  targetUserId: string,
  targetStudioId: string,
  type: 'cadence_weekly' | 'data_recap_monthly' | 'admin_manual',
  message: string
): Promise<{ error?: string }> {
  const caller = await requireAdmin()
  if (!caller) return { error: 'Unauthorized' }

  const { error } = await adminClient.from('reminders').insert({
    studio_id: targetStudioId,
    user_id: targetUserId,
    type,
    message: message.trim() || null,
    created_by: caller.id,
  })

  if (error) return { error: error.message }

  revalidatePath('/admin')
  return {}
}
