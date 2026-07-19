import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getStudioId } from '@/app/actions/_shared'
import AppShell from '@/components/layout/AppShell'
import UpgradeBanner from '@/components/UpgradeBanner'
import SchoolOutreachClient from './SchoolOutreachClient'
import { checkGmailReplies } from '@/app/actions/cadence'
import { hasFeatureAccess } from '@/lib/features'
import { getCachedStudioTier } from '@/lib/supabase/cached'
import type { SchoolOutreach, CadenceEnrollment, UserSettings } from '@/types/database'

export const metadata: Metadata = { title: 'School Outreach' }

export default async function SchoolOutreachPage() {
  const ctx = await getStudioId()
  if (!ctx) redirect('/auth/login')
  const { supabase, studioId, userId, viewOnly, isAdmin: ctxIsAdmin, userEmail } = ctx

  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase())
  const isAdmin = ctxIsAdmin || !!(userEmail && adminEmails.includes(userEmail.toLowerCase()))

  const tier = await getCachedStudioTier(studioId)
  const hasAccess = isAdmin || hasFeatureAccess(tier, 'school_outreach')

  if (!hasAccess) {
    return (
      <AppShell>
        <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
          <h2 className="text-2xl text-[var(--ink)] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
            School Outreach
          </h2>
          <UpgradeBanner feature="School Outreach" />
        </main>
      </AppShell>
    )
  }

  const [{ data: schools }, { data: settings }] = await Promise.all([
    supabase
      .from('school_outreach')
      .select('*')
      .eq('studio_id', studioId)
      .order('next_step_due_date', { ascending: true, nullsFirst: false }),
    viewOnly
      ? Promise.resolve({ data: null, error: null })
      : supabase.from('settings').select('*').eq('user_id', userId).maybeSingle(),
    checkGmailReplies().catch(() => null),
  ])

  const schoolIds = (schools ?? []).map((s: { id: string }) => s.id)
  let enrollments: CadenceEnrollment[] = []
  if (schoolIds.length > 0) {
    const { data: enrollmentsData } = await supabase
      .from('cadence_enrollments')
      .select('*')
      .in('school_id', schoolIds)
      .order('created_at', { ascending: false })
    enrollments = (enrollmentsData ?? []) as CadenceEnrollment[]
  }

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <SchoolOutreachClient
          schools={(schools ?? []) as SchoolOutreach[]}
          enrollments={enrollments}
          settings={(settings ?? null) as UserSettings | null}
        />
      </main>
    </AppShell>
  )
}
