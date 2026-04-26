import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'
import EmailTemplatesClient from './EmailTemplatesClient'

export default async function EmailTemplatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('studio_id')
    .eq('id', user.id)
    .single()

  const [settingsRes, customRes] = await Promise.all([
    supabase
      .from('settings')
      .select('display_name, studio_name, location, phone')
      .eq('user_id', user.id)
      .maybeSingle(),
    profile?.studio_id
      ? supabase
          .from('custom_templates')
          .select('template_key, subject, body')
          .eq('studio_id', profile.studio_id)
      : Promise.resolve({ data: [] }),
  ])

  const settings = settingsRes.data

  const capitalize = (s: string) =>
    s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

  const fills: Record<string, string> = {
    MyName: settings?.display_name ? capitalize(settings.display_name) : '',
    StudioName: settings?.studio_name ? capitalize(settings.studio_name) : '',
    Location: settings?.location ?? '',
    phonenumber: settings?.phone ?? '',
  }

  const initialCustomTemplates: Record<string, { subject: string; body: string }> = {}
  for (const row of customRes.data ?? []) {
    initialCustomTemplates[row.template_key] = { subject: row.subject, body: row.body }
  }

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <EmailTemplatesClient fills={fills} initialCustomTemplates={initialCustomTemplates} />
      </main>
    </AppShell>
  )
}
