import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getStaffContext } from '@/lib/staff'
import AdminShell from '../../AdminShell'
import NewWorkPlanClient from './NewWorkPlanClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'New Work Plan' }

export default async function NewWorkPlanPage() {
  const ctx = await getStaffContext()
  if (!ctx) redirect('/dashboard')

  // Both reads go through the staff session. The studios read depends on the
  // "Staff can read studios" policy added by 20260909000001 — without it this
  // list is empty and no plan can be created.
  const [studiosRes, templatesRes] = await Promise.all([
    ctx.supabase.from('studios').select('id, name').order('name', { ascending: true }),
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
          studios={(studiosRes.data ?? []) as { id: string; name: string }[]}
          templates={(templatesRes.data ?? []) as { id: string; name: string; description: string | null }[]}
          loadError={studiosRes.error?.message ?? templatesRes.error?.message ?? null}
        />
      </main>
    </AdminShell>
  )
}
