'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

async function isViewOnly(): Promise<boolean> {
  const cookieStore = await cookies()
  return !!cookieStore.get('view_as_studio_id')?.value
}

export async function disconnectGmail() {
  if (await isViewOnly()) return { error: 'View only mode' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('settings')
    .update({
      gmail_access_token: null,
      gmail_refresh_token: null,
      gmail_token_expiry: null,
      gmail_send_enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/settings')
  return { error: null }
}

export async function upsertSettings(formData: FormData) {
  if (await isViewOnly()) return { error: 'View only mode' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase.from('settings').upsert(
    {
      user_id: user.id,
      display_name: (formData.get('display_name') as string) || null,
      studio_name: (formData.get('studio_name') as string) || null,
      location: (formData.get('location') as string) || null,
      phone: (formData.get('phone') as string) || null,
      instruments: (formData.get('instruments') as string) || null,
      sender_name: (formData.get('sender_name') as string) || null,
      reply_to_email: (formData.get('reply_to_email') as string) || null,
      gmail_send_enabled: formData.get('gmail_send_enabled') === 'true',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )

  if (error) return { error: error.message }
  revalidatePath('/settings')
  return { error: null }
}
