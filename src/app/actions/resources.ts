'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import type { Resource } from '@/types/database'

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

export async function getResources(): Promise<{ data: Resource[]; error: string | null }> {
  const { data, error } = await adminClient
    .from('resources')
    .select('*')
    .order('position', { ascending: true })

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as Resource[], error: null }
}

export async function createResource(input: {
  title: string
  description: string
  url: string
  icon_type: Resource['icon_type']
  category: string
}): Promise<{ error: string | null }> {
  if (!await requireAdmin()) return { error: 'Unauthorized' }

  const { data: existing } = await adminClient
    .from('resources')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const position = (existing?.position ?? -1) + 1

  const { error } = await adminClient
    .from('resources')
    .insert({
      title: input.title,
      description: input.description || null,
      url: input.url,
      icon_type: input.icon_type,
      category: input.category || null,
      position,
    })

  if (error) return { error: error.message }

  revalidatePath('/admin/resources')
  revalidatePath('/resources')
  return { error: null }
}

export async function updateResource(
  id: string,
  input: {
    title: string
    description: string
    url: string
    icon_type: Resource['icon_type']
    category: string
  },
): Promise<{ error: string | null }> {
  if (!await requireAdmin()) return { error: 'Unauthorized' }

  const { error } = await adminClient
    .from('resources')
    .update({
      title: input.title,
      description: input.description || null,
      url: input.url,
      icon_type: input.icon_type,
      category: input.category || null,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/admin/resources')
  revalidatePath('/resources')
  return { error: null }
}

export async function deleteResource(id: string): Promise<{ error: string | null }> {
  if (!await requireAdmin()) return { error: 'Unauthorized' }

  const { error } = await adminClient
    .from('resources')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/admin/resources')
  revalidatePath('/resources')
  return { error: null }
}

export async function reorderResources(orderedIds: string[]): Promise<{ error: string | null }> {
  if (!await requireAdmin()) return { error: 'Unauthorized' }

  await Promise.all(
    orderedIds.map((id, position) =>
      adminClient.from('resources').update({ position }).eq('id', id),
    ),
  )

  revalidatePath('/admin/resources')
  revalidatePath('/resources')
  return { error: null }
}
