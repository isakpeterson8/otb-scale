'use server'

import { revalidatePath } from 'next/cache'
import { getStudioId } from './_shared'
import type { FinancialMonth } from '@/types/database'

type EditableFields = Partial<Pick<FinancialMonth,
  'enrollment' | 'booked_hrs' | 'goal_hrs' | 'avail_hrs' |
  'leads' | 'consults' | 'poss_reg' | 'new_enrollments' | 'disenrollments' |
  'est_revenue' | 'collected_revenue' | 'expenses' | 'notes'
>>

export async function upsertMonth(year: number, month: number, data: EditableFields) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  const { supabase, studioId } = ctx

  const { error } = await supabase
    .from('financial_months')
    .upsert(
      { studio_id: studioId, year, month, ...data, updated_at: new Date().toISOString() },
      { onConflict: 'studio_id,year,month' }
    )

  if (error) return { error: error.message }
  revalidatePath('/financials')
  return { error: null }
}
