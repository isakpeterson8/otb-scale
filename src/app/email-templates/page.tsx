import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'
import EmailTemplatesClient from './EmailTemplatesClient'

export default async function EmailTemplatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: settings } = await supabase
    .from('settings')
    .select('display_name, studio_name, location, phone')
    .eq('user_id', user.id)
    .maybeSingle()

  const capitalize = (s: string) =>
    s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

  const fills: Record<string, string> = {
    MyName: settings?.display_name ? capitalize(settings.display_name) : '',
    StudioName: settings?.studio_name ? capitalize(settings.studio_name) : '',
    Location: settings?.location ?? '',
    phonenumber: settings?.phone ?? '',
  }

  return (
    <AppShell>
      <main className="flex-1 px-8 py-7">
        <EmailTemplatesClient fills={fills} />
      </main>
    </AppShell>
  )
}
