'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { getStudioId } from './_shared'
import type { EducationLibraryItem } from '@/types/database'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'otb_admin' && profile?.role !== 'otb_staff') return null
  return user
}

function titleToSlug(title: string): string {
  return title
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base
  let attempt = 1
  while (true) {
    const { data } = await adminClient
      .from('education_library_items')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (!data) return slug
    attempt++
    slug = `${base}-${attempt}`
  }
}

export async function createLibraryItem(input: {
  title: string
  description: string
  type: 'video' | 'pdf'
  cf_uid?: string
  pdf_url?: string
  category?: string
  docLinks?: { label: string; url: string }[]
}) {
  if (!await requireAdmin()) return { error: 'Unauthorized' }

  // Get max position
  const { data: existing } = await adminClient
    .from('education_library_items')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const position = (existing?.position ?? -1) + 1
  const slug = await uniqueSlug(titleToSlug(input.title))

  const { data: newItem, error } = await adminClient
    .from('education_library_items')
    .insert({
      title: input.title,
      description: input.description || null,
      type: input.type,
      cf_uid: input.cf_uid || null,
      pdf_url: input.pdf_url || null,
      category: input.category || null,
      slug,
      position,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  if (newItem?.id && input.docLinks && input.docLinks.length > 0) {
    await adminClient
      .from('video_document_links')
      .insert(
        input.docLinks
          .filter(l => l.label.trim() && l.url.trim())
          .map((l, idx) => ({ video_id: newItem.id, label: l.label.trim(), url: l.url.trim(), sort_order: idx }))
      )
  }

  revalidatePath('/admin/library')
  revalidatePath('/education')
  return { error: null }
}

export async function updateLibraryItem(id: string, input: {
  title: string
  description: string
  category?: string
  docLinks?: { label: string; url: string }[]
}) {
  if (!await requireAdmin()) return { error: 'Unauthorized' }

  const { error } = await adminClient
    .from('education_library_items')
    .update({
      title: input.title,
      description: input.description || null,
      category: input.category || null,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  // Replace document links
  await adminClient.from('video_document_links').delete().eq('video_id', id)
  if (input.docLinks && input.docLinks.length > 0) {
    const validLinks = input.docLinks.filter(l => l.label.trim() && l.url.trim())
    if (validLinks.length > 0) {
      await adminClient
        .from('video_document_links')
        .insert(validLinks.map((l, idx) => ({ video_id: id, label: l.label.trim(), url: l.url.trim(), sort_order: idx })))
    }
  }

  revalidatePath('/admin/library')
  revalidatePath('/education')
  return { error: null }
}

export async function deleteLibraryItem(id: string) {
  if (!await requireAdmin()) return { error: 'Unauthorized' }

  const { error } = await adminClient
    .from('education_library_items')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/admin/library')
  revalidatePath('/education')
  return { error: null }
}

// Attach an uploaded Cloudflare video to an existing placeholder item.
// Also flips is_placeholder → false so the card becomes playable immediately.
export async function attachVideoToItem(id: string, cfUid: string): Promise<{ error: string | null }> {
  if (!await requireAdmin()) return { error: 'Unauthorized' }
  if (!cfUid.trim()) return { error: 'cf_uid is required' }

  const { error } = await adminClient
    .from('education_library_items')
    .update({ cf_uid: cfUid, is_placeholder: false })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/admin/library')
  revalidatePath('/education')
  return { error: null }
}

export async function reorderLibraryItems(orderedIds: string[]) {
  if (!await requireAdmin()) return { error: 'Unauthorized' }

  const updates = orderedIds.map((id, position) =>
    adminClient
      .from('education_library_items')
      .update({ position })
      .eq('id', id)
  )

  await Promise.all(updates)

  revalidatePath('/admin/library')
  revalidatePath('/education')
  return { error: null }
}

// ── Watch progress ────────────────────────────────────────────────────────────

export async function upsertWatchProgress(
  itemId: string,
  watchPct: number,
  secondsWatched: number,
  durationSeconds: number,
): Promise<{ error: string | null }> {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'No studio' }
  if (ctx.viewOnly) return { error: null } // don't record for admin view-as sessions

  const completed = watchPct >= 90

  const { error } = await ctx.supabase
    .from('education_watch_progress')
    .upsert(
      {
        studio_id: ctx.studioId,
        item_id: itemId,
        watch_pct: Math.min(100, Math.max(0, watchPct)),
        seconds_watched: secondsWatched,
        duration_seconds: durationSeconds,
        completed,
        last_watched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'studio_id,item_id' },
    )

  if (error) return { error: error.message }
  return { error: null }
}

export interface WatchStat {
  studio_id: string
  studio_name: string
  item_id: string
  watch_pct: number
  seconds_watched: number
  duration_seconds: number
  completed: boolean
  last_watched_at: string
}

export async function getWatchStats(): Promise<{ data: WatchStat[]; error: string | null }> {
  // Admin-only: uses service role to bypass RLS
  if (!await requireAdmin()) return { data: [], error: 'Unauthorized' }

  const { data, error } = await adminClient
    .from('education_watch_progress')
    .select('studio_id, item_id, watch_pct, seconds_watched, duration_seconds, completed, last_watched_at, studios:studio_id(name)')
    .order('last_watched_at', { ascending: false })

  if (error) return { data: [], error: error.message }

  const stats: WatchStat[] = (data ?? []).map((row: {
    studio_id: string
    item_id: string
    watch_pct: number
    seconds_watched: number
    duration_seconds: number
    completed: boolean
    last_watched_at: string
    studios: { name: string }[] | null
  }) => ({
    studio_id: row.studio_id,
    studio_name: row.studios?.[0]?.name ?? 'Unknown',
    item_id: row.item_id,
    watch_pct: row.watch_pct,
    seconds_watched: row.seconds_watched,
    duration_seconds: row.duration_seconds,
    completed: row.completed,
    last_watched_at: row.last_watched_at,
  }))

  return { data: stats, error: null }
}

export async function getLibraryItems(): Promise<{ data: EducationLibraryItem[]; error: string | null }> {
  const { data, error } = await adminClient
    .from('education_library_items')
    .select('*, document_links:video_document_links(id, label, url, sort_order)')
    .order('position', { ascending: true })

  if (error) return { data: [], error: error.message }

  const items = (data ?? []).map((item: EducationLibraryItem & { document_links?: { id: string; label: string; url: string; sort_order: number }[] }) => ({
    ...item,
    document_links: (item.document_links ?? []).sort((a, b) => a.sort_order - b.sort_order),
  }))

  return { data: items as EducationLibraryItem[], error: null }
}
