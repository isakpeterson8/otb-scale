import type { SupabaseClient } from '@supabase/supabase-js'
import { LEAD_SOURCES, type LeadSource } from '@/types/database'
import { cleanSource, preferredSpelling, sourceKey } from './source'

/**
 * Maps each school source's key to the spelling already used in this studio,
 * for the given raw values. Keys with no existing school are absent.
 */
export async function existingSchoolSourceSpellings(
  supabase: SupabaseClient,
  studioId: string,
  raws: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const keys = [...new Set(raws.map(sourceKey).filter((k): k is string => !!k))]
  const out = new Map<string, string>()
  if (keys.length === 0) return out

  const { data, error } = await supabase
    .from('school_outreach')
    .select('source, source_key')
    .eq('studio_id', studioId)
    .in('source_key', keys)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(10000)
  if (error) throw new Error(error.message)

  const byKey = new Map<string, string[]>()
  for (const row of (data ?? []) as { source: string; source_key: string }[]) {
    const spelling = cleanSource(row.source)
    if (spelling) byKey.set(row.source_key, [...(byKey.get(row.source_key) ?? []), spelling])
  }
  for (const [key, spellings] of byKey) {
    const best = preferredSpelling(spellings)
    if (best) out.set(key, best)
  }
  return out
}

/**
 * The school source to save: the studio's existing spelling when one matches
 * case-insensitively, otherwise the trimmed input. Blank → null.
 */
export async function normalizeSchoolSource(
  supabase: SupabaseClient,
  studioId: string,
  raw: unknown,
): Promise<string | null> {
  const cleaned = cleanSource(raw)
  if (!cleaned) return null
  const existing = await existingSchoolSourceSpellings(supabase, studioId, [cleaned])
  return existing.get(cleaned.toLowerCase()) ?? cleaned
}

/**
 * Lead sources are a fixed list. Accepts a value or a label in any case;
 * anything else (including blank) → null.
 */
export function normalizeLeadSource(raw: unknown): LeadSource | null {
  const key = sourceKey(typeof raw === 'string' ? raw : null)
  if (!key) return null
  return LEAD_SOURCES.find(s => s.value.toLowerCase() === key || s.label.toLowerCase() === key)?.value ?? null
}
