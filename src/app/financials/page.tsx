import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'
import FinancialsClient from './FinancialsClient'
import type { FinancialMonth } from '@/types/database'

const YEARS = [2024, 2025, 2026, 2027]

export default async function FinancialsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('studio_id')
    .eq('id', user.id)
    .single()

  let allMonths: FinancialMonth[] = []
  if (profile?.studio_id) {
    const { data } = await supabase
      .from('financial_months')
      .select('*')
      .eq('studio_id', profile.studio_id)
      .in('year', YEARS)
    allMonths = (data ?? []) as FinancialMonth[]
  }

  const byYear: Record<number, Record<number, FinancialMonth>> = {}
  for (const m of allMonths) {
    if (!byYear[m.year]) byYear[m.year] = {}
    byYear[m.year][m.month] = m
  }

  return (
    <AppShell>
      <main className="px-8 py-7 pb-16">
        <FinancialsClient initialData={byYear} />
      </main>
    </AppShell>
  )
}
