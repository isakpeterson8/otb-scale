import { redirect } from 'next/navigation'
import { getStudioId } from '@/app/actions/_shared'
import AppShell from '@/components/layout/AppShell'
import DashboardClient from './DashboardClient'
import type { SchoolOutreach, CadenceEnrollment, FacebookGroup, StudioSnapshot } from '@/types/database'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ toast?: string }>
}) {
  const ctx = await getStudioId()
  if (!ctx) redirect('/auth/login')
  const { supabase, studioId, isAdmin } = ctx

  const { data: studio } = await supabase
    .from('studios')
    .select('subscription_tier')
    .eq('id', studioId)
    .single()
  const tier = studio?.subscription_tier ?? 'free'
  const isFreeTier = !isAdmin && tier === 'free'

  const { toast } = await searchParams

  // Free tier: only fetch snapshot data
  if (isFreeTier) {
    const { data: snapshotData } = await supabase
      .from('studio_snapshots')
      .select('snapshot_date, enrollment, collected_revenue')
      .eq('studio_id', studioId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    return (
      <AppShell>
        <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
          <DashboardClient
            isFreeTier
            toastMessage={toast}
            latestSnapshot={(snapshotData ?? null) as Pick<StudioSnapshot, 'snapshot_date' | 'enrollment' | 'collected_revenue'> | null}
            schools={[]}
            enrollments={[]}
            activeGroups={[]}
          />
        </main>
      </AppShell>
    )
  }

  // Paid tier: fetch all data
  const [snapshotRes, schoolsRes, groupsRes] = await Promise.all([
    supabase
      .from('studio_snapshots')
      .select('snapshot_date, enrollment, collected_revenue')
      .eq('studio_id', studioId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('school_outreach')
      .select('id, school_name, stage')
      .eq('studio_id', studioId)
      .order('school_name', { ascending: true }),
    supabase
      .from('facebook_groups')
      .select('id, group_name, most_recent_post_date')
      .eq('studio_id', studioId)
      .eq('is_active', true)
      .order('group_name', { ascending: true }),
  ])

  const schoolIds = (schoolsRes.data ?? []).map((s: { id: string }) => s.id)
  let enrollmentsData: Pick<CadenceEnrollment, 'id' | 'school_id' | 'status' | 'current_email_number' | 'email_2_due_at' | 'email_3_due_at' | 'email_4_due_at'>[] = []
  if (schoolIds.length > 0) {
    const enrollmentsRes = await supabase
      .from('cadence_enrollments')
      .select('id, school_id, status, current_email_number, email_2_due_at, email_3_due_at, email_4_due_at')
      .in('school_id', schoolIds)
      .in('status', ['active'])
    enrollmentsData = (enrollmentsRes.data ?? []) as typeof enrollmentsData
  }

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <DashboardClient
          isFreeTier={false}
          toastMessage={toast}
          latestSnapshot={(snapshotRes.data ?? null) as Pick<StudioSnapshot, 'snapshot_date' | 'enrollment' | 'collected_revenue'> | null}
          schools={(schoolsRes.data ?? []) as Pick<SchoolOutreach, 'id' | 'school_name' | 'stage'>[]}
          enrollments={enrollmentsData}
          activeGroups={(groupsRes.data ?? []) as Pick<FacebookGroup, 'id' | 'group_name' | 'most_recent_post_date'>[]}
        />
      </main>
    </AppShell>
  )
}
