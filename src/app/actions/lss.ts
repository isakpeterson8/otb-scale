'use server'

import { revalidatePath } from 'next/cache'
import { getStaffContext } from '@/lib/staff'
import { chicagoToUtcIso } from '@/lib/live-support'

type Result = { error: string | null }

function revalidateLss() {
  revalidatePath('/admin/lss')
  revalidatePath('/live-support')
  revalidatePath('/dashboard')
}

function optionalUrl(raw: FormDataEntryValue | null, label: string): { value: string | null; error?: string } {
  const v = typeof raw === 'string' ? raw.trim() : ''
  if (!v) return { value: null }
  try {
    const u = new URL(v)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error()
    return { value: v }
  } catch {
    return { value: null, error: `${label} must be a full link starting with https://` }
  }
}

function text(raw: FormDataEntryValue | null): string | null {
  const v = typeof raw === 'string' ? raw.trim() : ''
  return v || null
}

/** Sets the shared Zoom join URL. Writes go through the staff member's own session (RLS). */
export async function saveZoomJoinUrl(url: string): Promise<Result> {
  const staff = await getStaffContext()
  if (!staff) return { error: 'Unauthorized' }

  const trimmed = url.trim()
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { error: 'Enter the full Zoom link, starting with https://' }
  }
  if (parsed.protocol !== 'https:') return { error: 'The Zoom link must start with https://' }

  const { error } = await staff.supabase
    .from('lss_settings')
    .upsert({ id: true, zoom_join_url: trimmed }, { onConflict: 'id' })
  if (error) return { error: error.message }

  revalidatePath('/admin/lss')
  return { error: null }
}

function parseSessionForm(form: FormData): { row?: Record<string, unknown>; error?: string } {
  const title = text(form.get('title'))
  if (!title) return { error: 'Title is required.' }

  const startsAt = chicagoToUtcIso(String(form.get('date') ?? ''), String(form.get('time') ?? ''))
  if (!startsAt) return { error: 'Enter a valid date and start time.' }

  const duration = Number(form.get('duration_minutes') ?? 60)
  if (!Number.isInteger(duration) || duration <= 0 || duration > 600) {
    return { error: 'Duration must be a whole number of minutes.' }
  }

  const fb = optionalUrl(form.get('facebook_event_url'), 'Facebook event URL')
  if (fb.error) return { error: fb.error }
  const rec = optionalUrl(form.get('recording_url'), 'Recording URL')
  if (rec.error) return { error: rec.error }

  return {
    row: {
      title,
      coach_names: text(form.get('coach_names')),
      starts_at: startsAt,
      duration_minutes: duration,
      description: text(form.get('description')),
      facebook_event_url: fb.value,
      recording_url: rec.value,
    },
  }
}

export async function createLssSession(form: FormData): Promise<Result> {
  const staff = await getStaffContext()
  if (!staff) return { error: 'Unauthorized' }
  const { row, error: parseError } = parseSessionForm(form)
  if (!row) return { error: parseError ?? 'Invalid session.' }

  const { error } = await staff.supabase.from('lss_sessions').insert(row)
  if (error) return { error: error.message }
  revalidateLss()
  return { error: null }
}

export async function updateLssSession(id: string, form: FormData): Promise<Result> {
  const staff = await getStaffContext()
  if (!staff) return { error: 'Unauthorized' }
  const { row, error: parseError } = parseSessionForm(form)
  if (!row) return { error: parseError ?? 'Invalid session.' }

  const { error } = await staff.supabase.from('lss_sessions').update(row).eq('id', id)
  if (error) return { error: error.message }
  revalidateLss()
  return { error: null }
}

export async function deleteLssSession(id: string): Promise<Result> {
  const staff = await getStaffContext()
  if (!staff) return { error: 'Unauthorized' }
  const { error } = await staff.supabase.from('lss_sessions').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidateLss()
  return { error: null }
}
