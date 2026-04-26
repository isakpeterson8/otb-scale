import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'
import SettingsClient from './SettingsClient'
import type { Profile, UserSettings } from '@/types/database'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: profile }, { data: settings }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single<Profile>(),
    supabase.from('settings').select('*').eq('user_id', user.id).maybeSingle(),
  ])

  const fullSettings = (settings ?? null) as UserSettings | null

  // Derive connection status server-side — never send raw tokens to the client
  const gmailConnected = !!(fullSettings?.gmail_access_token)

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
      <main className="flex-1 px-8 py-7 max-w-2xl">
        <SettingsClient
          profile={profile ?? null}
          settings={clientSettings}
          email={user.email ?? ''}
          gmailConnected={gmailConnected}
        />
      </main>
    </AppShell>
  )
}
