'use server'

import { revalidatePath } from 'next/cache'
import { getStudioId } from './_shared'

export async function upsertFinancialMonth(
  month: string,
  field: 'revenue' | 'expenses' | 'notes',
  value: string
) {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  const { supabase, studioId } = ctx

  const updateValue = field === 'notes' ? value : value ? Math.round(parseFloat(value) * 100) : null

  const { data: existing } = await supabase
    .from('financial_months')
    .select('id')
    .eq('studio_id', studioId)
    .eq('month', month)
    .single()

  if (existing) {
    const { error } = await supabase
      .from('financial_months')
      .update({ [field]: updateValue })
      .eq('id', existing.id)

    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('financial_months').insert({
      studio_id: studioId,
      month,
      [field]: updateValue,
    })

    if (error) return { error: error.message }
  }

  revalidatePath('/financials')
  return { error: null }
}
