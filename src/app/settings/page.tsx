import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getStudioId } from '@/app/actions/_shared'
import AppShell from '@/components/layout/AppShell'
import SettingsClient from './SettingsClient'
import type { Profile, UserSettings } from '@/types/database'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  // Use getStudioId() so View As mode correctly resolves to the viewed studio's tier
  const ctx = await getStudioId()
  if (!ctx) redirect('/auth/login')

  // Profile + settings always belong to the real logged-in user (admin edits their own settings)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: profile }, { data: settings }, { data: studio }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single<Profile>(),
    supabase.from('settings').select('*').eq('user_id', user.id).maybeSingle(),
    // ctx.supabase is the admin client in View As mode — reads the viewed studio's tier
    ctx.supabase.from('studios').select('subscription_tier').eq('id', ctx.studioId).single(),
  ])

  const fullSettings = (settings ?? null) as UserSettings | null

  // Derive connection status server-side — never send raw tokens to the client
  const gmailConnected = !!(fullSettings?.gmail_access_token)
  const subscriptionTier = studio?.subscription_tier ?? 'free'

  // Strip token fields before passing to client component
  const clientSettings = fullSettings
    ? {
        ...fullSettings,
        gmail_access_token: null,
        gmail_refresh_token: null,
        gmail_token_expiry: null,
      }
    : null

  return (
    <AppShell>
      <main className="px-4 md:px-8 py-5 md:py-7 pb-16 max-w-2xl">
        <SettingsClient
          profile={profile ?? null}
          settings={clientSettings}
          email={user.email ?? ''}
          gmailConnected={gmailConnected}
          subscriptionTier={subscriptionTier}
        />
      </main>
    </AppShell>
  )
}
