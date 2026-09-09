import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getStaffContext } from '@/lib/staff'
import AdminShell from '../../AdminShell'
import NewWorkPlanClient from './NewWorkPlanClient'
import type { StudioOption } from '@/lib/work-plans'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'New Work Plan' }

export default async function NewWorkPlanPage() {
  const ctx = await getStaffContext()
  if (!ctx) redirect('/dashboard')

  // Both reads go through the staff session. The studios read depends on the
  // "Staff can read studios" policy added by 20260909000001 — without it this
  // list is empty and no plan can be created.
  const [studiosRes, templatesRes] = await Promise.all([
    // Reads studios directly — no join, so nothing fans out. Same-named rows
    // are genuinely distinct studios; created_at feeds the picker's
    // disambiguator. Secondary sort keeps the order stable between loads.
    ctx.supabase
      .from('studios')
      .select('id, name, created_at')
      .order('name', { ascending: true })
      .order('created_at', { ascending: true }),
    ctx.supabase
      .from('work_plan_templates')
      .select('id, name, description')
      .eq('is_active', true)
      .order('name', { ascending: true }),
  ])

  return (
    <AdminShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <NewWorkPlanClient
          studios={(studiosRes.data ?? []) as StudioOption[]}
          templates={(templatesRes.data ?? []) as { id: string; name: string; description: string | null }[]}
          loadError={studiosRes.error?.message ?? templatesRes.error?.message ?? null}
        />
      </main>
    </AdminShell>
  )
}
