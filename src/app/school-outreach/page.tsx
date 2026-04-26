import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'
import SchoolOutreachClient from './SchoolOutreachClient'
import type { SchoolOutreach, CadenceEnrollment, UserSettings } from '@/types/database'

export default async function SchoolOutreachPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: schools }, { data: enrollments }, { data: settings }] = await Promise.all([
    supabase
      .from('school_outreach')
      .select('*')
      .order('next_step_due_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('cadence_enrollments')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  return (
    <AppShell>
      <main className="flex-1 px-8 py-7">
        <SchoolOutreachClient
          schools={(schools ?? []) as SchoolOutreach[]}
          enrollments={(enrollments ?? []) as CadenceEnrollment[]}
          settings={(settings ?? null) as UserSettings | null}
        />
      </main>
    </AppShell>
  )
}
