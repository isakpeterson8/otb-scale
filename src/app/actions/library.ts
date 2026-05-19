'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
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

export async function createLibraryItem(input: {
  title: string
  description: string
  type: 'video' | 'pdf'
  cf_uid?: string
  pdf_url?: string
  category?: string
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

  const { error } = await adminClient
    .from('education_library_items')
    .insert({
      title: input.title,
      description: input.description || null,
      type: input.type,
      cf_uid: input.cf_uid || null,
      pdf_url: input.pdf_url || null,
      category: input.category || null,
      position,
    })

  if (error) return { error: error.message }

  revalidatePath('/admin/library')
  revalidatePath('/education')
  return { error: null }
}

export async function updateLibraryItem(id: string, input: {
  title: string
  description: string
  category?: string
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

export async function getLibraryItems(): Promise<{ data: EducationLibraryItem[]; error: string | null }> {
  const { data, error } = await adminClient
    .from('education_library_items')
    .select('*')
    .order('position', { ascending: true })

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as EducationLibraryItem[], error: null }
}
