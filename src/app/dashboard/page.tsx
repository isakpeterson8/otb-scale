import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'
import DashboardClient from './DashboardClient'
import type { SchoolOutreach, CadenceEnrollment, FacebookGroup, StudioSnapshot } from '@/types/database'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [snapshotRes, schoolsRes, enrollmentsRes, groupsRes] = await Promise.all([
    supabase
      .from('studio_snapshots')
      .select('snapshot_date, enrollment, collected_revenue')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('school_outreach')
      .select('id, school_name, stage')
      .order('school_name', { ascending: true }),
    supabase
      .from('cadence_enrollments')
      .select('id, school_id, status, current_email_number, email_2_due_at, email_3_due_at, email_4_due_at')
      .eq('user_id', user.id)
      .in('status', ['active']),
    supabase
      .from('facebook_groups')
      .select('id, group_name, most_recent_post_date')
      .eq('is_active', true)
      .order('group_name', { ascending: true }),
  ])

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <DashboardClient
          latestSnapshot={(snapshotRes.data ?? null) as Pick<StudioSnapshot, 'snapshot_date' | 'enrollment' | 'collected_revenue'> | null}
          schools={(schoolsRes.data ?? []) as Pick<SchoolOutreach, 'id' | 'school_name' | 'stage'>[]}
          enrollments={(enrollmentsRes.data ?? []) as Pick<CadenceEnrollment, 'id' | 'school_id' | 'status' | 'current_email_number' | 'email_2_due_at' | 'email_3_due_at' | 'email_4_due_at'>[]}
          activeGroups={(groupsRes.data ?? []) as Pick<FacebookGroup, 'id' | 'group_name' | 'most_recent_post_date'>[]}
        />
      </main>
    </AppShell>
  )
}
