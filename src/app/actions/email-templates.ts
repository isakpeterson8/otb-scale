'use server'

import { revalidatePath } from 'next/cache'
import { getStudioId } from './_shared'

export async function saveCustomTemplate(
  templateKey: string,
  subject: string,
  body: string,
): Promise<{ error: string | null }> {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Unauthorized' }
  const { supabase, studioId } = ctx

  const { error } = await supabase
    .from('custom_templates')
    .upsert(
      { studio_id: studioId, template_key: templateKey, subject, body, updated_at: new Date().toISOString() },
      { onConflict: 'studio_id,template_key' },
    )

  if (error) return { error: error.message }
  revalidatePath('/email-templates')
  return { error: null }
}
