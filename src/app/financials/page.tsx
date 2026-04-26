import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'
import FinancialsClient from './FinancialsClient'
import type { FinancialMonth } from '@/types/database'

function getLastNMonths(n: number): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

export default async function FinancialsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data } = await supabase
    .from('financial_months')
    .select('*')
    .order('month', { ascending: false })

  const dbMonths = (data ?? []) as FinancialMonth[]

  const last12 = getLastNMonths(12)
  const monthMap = Object.fromEntries(dbMonths.map((m) => [m.month, m]))

  const months: FinancialMonth[] = last12.map((month) => ({
    id: monthMap[month]?.id ?? '',
    studio_id: monthMap[month]?.studio_id ?? '',
    month,
    revenue: monthMap[month]?.revenue ?? null,
    expenses: monthMap[month]?.expenses ?? null,
    notes: monthMap[month]?.notes ?? null,
  }))

  return (
    <AppShell>
      <main className="flex-1 px-8 py-7">
        <FinancialsClient months={months} />
      </main>
    </AppShell>
  )
}
