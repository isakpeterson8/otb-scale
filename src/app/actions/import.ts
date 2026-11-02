'use server'

import { revalidatePath } from 'next/cache'
import { getStudioId } from './_shared'
import { hasFeatureAccess } from '@/lib/features'
import { getCachedStudioTier } from '@/lib/supabase/cached'
import { existingSchoolSourceSpellings } from '@/lib/source-server'
import { cleanSource } from '@/lib/source'
import { FACEBOOK_GROUPS_IMPORT, LEADS_IMPORT, SCHOOLS_IMPORT } from '@/lib/csv-import/configs'
import {
  CSV_IMPORT_SCHOOL_SOURCE,
  DUPLICATE_MESSAGES,
  MAX_IMPORT_ROWS,
  facebookGroupKeys,
  matchOption,
  parseBoolean,
  rowMatchKeys,
  schoolKey,
  validateRow,
  type EntityKind,
  type ImportConfig,
  type MappedRow,
  type RowResult,
  type ValidatedRow,
} from '@/lib/csv-import/core'

// Every batch is re-validated here from the mapped values; the client's
// preview statuses are never trusted. studio_id always comes from the session.

export type DuplicateMode = 'skip' | 'update'

const MAX_BATCH_ROWS = 200

type Ctx = NonNullable<Awaited<ReturnType<typeof getStudioId>>>

async function importContext(entity: EntityKind): Promise<{ ctx: Ctx; error: null } | { ctx: null; error: string }> {
  const ctx = await getStudioId()
  if (!ctx) return { ctx: null, error: 'Unauthorized' }
  if (ctx.viewOnly) return { ctx: null, error: 'View only mode' }
  // Same gates as the /school-outreach and /facebook-groups pages. Leads are ungated.
  const gate = entity === 'schools' ? { feature: 'school_outreach' as const, name: 'School Outreach' }
    : entity === 'facebook_groups' ? { feature: 'facebook_groups' as const, name: 'Facebook Groups' }
    : null
  if (gate && !ctx.isAdmin) {
    const tier = await getCachedStudioTier(ctx.studioId)
    if (!hasFeatureAccess(tier, gate.feature)) {
      return { ctx: null, error: `${gate.name} is not included in your plan.` }
    }
  }
  return { ctx, error: null }
}

/** Keeps only known string fields of well-formed rows, so a crafted payload can't add columns. */
function sanitize(rows: unknown, config: ImportConfig): MappedRow[] | null {
  if (!Array.isArray(rows) || rows.length > MAX_BATCH_ROWS) return null
  const keys = new Set(config.fields.map(f => f.key))
  const out: MappedRow[] = []
  for (const r of rows) {
    if (!r || typeof r !== 'object') return null
    const { row, values } = r as { row?: unknown; values?: unknown }
    if (typeof row !== 'number' || !Number.isInteger(row) || row < 1 || row > MAX_IMPORT_ROWS) return null
    if (!values || typeof values !== 'object') return null
    const clean: Record<string, string> = {}
    for (const [k, v] of Object.entries(values as Record<string, unknown>)) {
      if (keys.has(k) && typeof v === 'string') clean[k] = v.trim()
    }
    out.push({ row, values: clean })
  }
  return out
}

/** Reads every row of a studio-scoped query, past PostgREST's 1,000-row page cap. */
async function fetchAll<T>(ctx: Ctx, table: string, columns: string): Promise<T[]> {
  const page = 1000
  const all: T[] = []
  for (let from = 0; ; from += page) {
    const { data, error } = await ctx.supabase
      .from(table)
      .select(columns)
      .eq('studio_id', ctx.studioId)
      .order('id', { ascending: true })
      .range(from, from + page - 1)
    if (error) throw new Error(error.message)
    all.push(...((data ?? []) as T[]))
    if (!data || data.length < page) return all
  }
}

async function existingLeadEmails(ctx: Ctx): Promise<Map<string, string>> {
  const rows = await fetchAll<{ id: string; email: string | null }>(ctx, 'contacts', 'id, email')
  const map = new Map<string, string>()
  for (const r of rows) {
    const e = r.email?.trim().toLowerCase()
    if (e && !map.has(e)) map.set(e, r.id)
  }
  return map
}

async function existingSchools(ctx: Ctx): Promise<Map<string, string>> {
  const rows = await fetchAll<{ id: string; school_name: string; city: string | null; state: string | null }>(
    ctx, 'school_outreach', 'id, school_name, city, state',
  )
  const map = new Map<string, string>()
  for (const r of rows) {
    const k = schoolKey(r.school_name, r.city, r.state)
    if (!map.has(k)) map.set(k, r.id)
  }
  return map
}

interface ExistingGroup {
  id: string
  group_url: string | null
}

/** Every identity key of every group (see facebookGroupKeys) -> that group. */
async function existingFacebookGroups(ctx: Ctx): Promise<Map<string, ExistingGroup>> {
  const rows = await fetchAll<{ id: string; group_name: string; group_url: string | null }>(
    ctx, 'facebook_groups', 'id, group_name, group_url',
  )
  const map = new Map<string, ExistingGroup>()
  for (const r of rows) {
    for (const k of facebookGroupKeys(r.group_name, r.group_url).identity) {
      if (!map.has(k)) map.set(k, { id: r.id, group_url: r.group_url })
    }
  }
  return map
}

/** Preview step: which of these match keys already exist in the account. */
export async function findExistingImportKeys(
  entity: EntityKind,
  keys: string[],
): Promise<{ keys: string[]; error: string | null }> {
  const { ctx, error } = await importContext(entity)
  if (!ctx) return { keys: [], error }
  // Facebook group rows have up to two match keys each.
  if (!Array.isArray(keys) || keys.length > MAX_IMPORT_ROWS * 2) return { keys: [], error: 'Too many rows.' }
  try {
    const existing: Map<string, unknown> = entity === 'leads' ? await existingLeadEmails(ctx)
      : entity === 'schools' ? await existingSchools(ctx)
      : await existingFacebookGroups(ctx)
    return { keys: keys.filter(k => typeof k === 'string' && existing.has(k)), error: null }
  } catch (e) {
    return { keys: [], error: e instanceof Error ? e.message : 'Lookup failed' }
  }
}

function errorResult(v: ValidatedRow): RowResult {
  return { row: v.row, outcome: 'failed', message: v.messages.join(' ') }
}

// ─── Leads ──────────────────────────────────────────────────────────────────

function recognised(key: string, raw: string): boolean {
  const options = LEADS_IMPORT.fields.find(f => f.key === key)?.options ?? []
  return matchOption(raw, options) !== null
}

function leadRecord(v: ValidatedRow) {
  return {
    name: v.clean.name as string,
    guardian_name: (v.clean.guardian_name as string | null) ?? null,
    email: (v.clean.email as string | null) ?? null,
    phone: (v.clean.phone as string | null) ?? null,
    lead_source: v.clean.source as string,
    status: v.clean.status as string,
    notes: (v.clean.notes as string | null) ?? null,
  }
}

export async function importLeadsBatch(
  rowsInput: MappedRow[],
  mode: DuplicateMode,
): Promise<{ results: RowResult[]; error: string | null }> {
  const { ctx, error } = await importContext('leads')
  if (!ctx) return { results: [], error }
  const rows = sanitize(rowsInput, LEADS_IMPORT)
  if (!rows) return { results: [], error: 'Invalid import batch.' }

  let existing: Map<string, string>
  try {
    existing = await existingLeadEmails(ctx)
  } catch (e) {
    return { results: [], error: e instanceof Error ? e.message : 'Lookup failed' }
  }

  const results: RowResult[] = []
  const toInsert: ValidatedRow[] = []
  // Emails already created or updated by this batch: a later row with the same
  // email is a repeat within the file and must not overwrite the first.
  const handled = new Set<string>()

  for (const r of rows) {
    const v = validateRow(r, LEADS_IMPORT)
    if (v.status === 'error') { results.push(errorResult(v)); continue }

    if (v.dedupeKey && handled.has(v.dedupeKey)) {
      results.push({ row: v.row, outcome: 'skipped', message: 'Same email as an earlier row in this file.' })
      continue
    }
    if (v.dedupeKey) handled.add(v.dedupeKey)
    const existingId = v.dedupeKey ? existing.get(v.dedupeKey) : undefined
    if (!existingId) { toInsert.push(v); continue }

    if (mode === 'skip') { results.push({ row: v.row, outcome: 'skipped', message: 'A lead with this email already exists.' }); continue }

    // Update: only overwrite with values the CSV actually provided, so blank
    // cells and defaulted status/source don't wipe existing data.
    const provided = (key: string) => !!r.values[key]
    const rec = leadRecord(v)
    const patch: Record<string, string | null> = {}
    if (provided('name')) patch.name = rec.name
    if (provided('guardian_name')) patch.guardian_name = rec.guardian_name
    if (provided('phone')) patch.phone = rec.phone
    if (provided('notes')) patch.notes = rec.notes
    // Unknown source/status values default for NEW leads, but must not
    // overwrite what an existing lead already has.
    if (provided('source') && recognised('source', r.values.source)) patch.lead_source = rec.lead_source
    if (provided('status') && recognised('status', r.values.status)) patch.status = rec.status
    if (Object.keys(patch).length === 0) {
      results.push({ row: v.row, outcome: 'skipped', message: 'Already exists; nothing new to update.' })
      continue
    }
    const { error: upErr } = await ctx.supabase
      .from('contacts').update(patch).eq('id', existingId).eq('studio_id', ctx.studioId)
    results.push(upErr ? { row: v.row, outcome: 'failed', message: upErr.message } : { row: v.row, outcome: 'updated' })
  }

  if (toInsert.length) {
    const records = toInsert.map(v => ({ ...leadRecord(v), studio_id: ctx.studioId }))
    const { error: insErr } = await ctx.supabase.from('contacts').insert(records)
    if (!insErr) {
      for (const v of toInsert) results.push({ row: v.row, outcome: 'created' })
    } else {
      // One bad row fails the whole statement; retry one by one to find it.
      for (let i = 0; i < toInsert.length; i++) {
        const { error: oneErr } = await ctx.supabase.from('contacts').insert(records[i])
        results.push(oneErr
          ? { row: toInsert[i].row, outcome: 'failed', message: oneErr.message }
          : { row: toInsert[i].row, outcome: 'created' })
      }
    }
  }

  revalidatePath('/leads')
  return { results: results.sort((a, b) => a.row - b.row), error: null }
}

// ─── Schools ────────────────────────────────────────────────────────────────

function contactRecord(v: ValidatedRow) {
  return {
    name: v.clean.contact_name as string,
    title: (v.clean.contact_title as string | null) ?? null,
    email: (v.clean.contact_email as string | null) ?? null,
    phone: (v.clean.contact_phone as string | null) ?? null,
  }
}

const hasContact = (v: ValidatedRow) => !!v.clean.contact_name

/** First non-empty raw value of `key` across a school's rows. */
function firstProvided(group: ValidatedRow[], key: string): ValidatedRow | undefined {
  return group.find(v => !!v.values[key])
}

export async function importSchoolsBatch(
  rowsInput: MappedRow[],
  mode: DuplicateMode,
): Promise<{ results: RowResult[]; error: string | null }> {
  const { ctx, error } = await importContext('schools')
  if (!ctx) return { results: [], error }
  const rows = sanitize(rowsInput, SCHOOLS_IMPORT)
  if (!rows) return { results: [], error: 'Invalid import batch.' }

  let existing: Map<string, string>
  try {
    existing = await existingSchools(ctx)
  } catch (e) {
    return { results: [], error: e instanceof Error ? e.message : 'Lookup failed' }
  }

  const results: RowResult[] = []
  const groups = new Map<string, ValidatedRow[]>()
  for (const r of rows) {
    const v = validateRow(r, SCHOOLS_IMPORT)
    if (v.status === 'error' || !v.dedupeKey) { results.push(errorResult(v)); continue }
    groups.set(v.dedupeKey, [...(groups.get(v.dedupeKey) ?? []), v])
  }

  // Sources are saved in the studio's existing spelling when one matches
  // case-insensitively; a new source keeps the first spelling seen in the file.
  const groupSource = (group: ValidatedRow[]) =>
    cleanSource(firstProvided(group, 'source')?.clean.source) ?? CSV_IMPORT_SCHOOL_SOURCE
  let sourceSpellings: Map<string, string>
  try {
    sourceSpellings = await existingSchoolSourceSpellings(ctx.supabase, ctx.studioId, [...groups.values()].map(groupSource))
  } catch (e) {
    return { results: [], error: e instanceof Error ? e.message : 'Lookup failed' }
  }
  const spellSource = (raw: string) => {
    const key = raw.toLowerCase()
    if (!sourceSpellings.has(key)) sourceSpellings.set(key, raw)
    return sourceSpellings.get(key) as string
  }

  for (const [key, group] of groups) {
    const existingId = existing.get(key)
    // The row explicitly marked primary goes first, so the insert trigger makes it primary.
    const primaryRow = group.find(v => v.clean.is_primary === true && hasContact(v))

    if (existingId) {
      if (mode === 'skip') {
        for (const v of group) results.push({ row: v.row, outcome: 'skipped', message: 'This school already exists.' })
        continue
      }
      await addContactsToExistingSchool(ctx, existingId, group, primaryRow, results)
      continue
    }

    // New school: school-level fields from the first row that has each one.
    const first = group[0]
    const statusRow = firstProvided(group, 'status') ?? first
    const { data: school, error: schoolErr } = await ctx.supabase
      .from('school_outreach')
      .insert({
        studio_id: ctx.studioId,
        school_name: first.clean.school_name as string,
        city: (first.clean.city as string | null) ?? null,
        state: (first.clean.state as string | null) ?? null,
        school_type: (firstProvided(group, 'school_type')?.clean.school_type as string | undefined) ?? null,
        source: spellSource(groupSource(group)),
        stage: statusRow.clean.status as string,
        notes: (firstProvided(group, 'notes')?.clean.notes as string | undefined) ?? null,
      })
      .select('id')
      .single()

    if (schoolErr || !school) {
      for (const v of group) results.push({ row: v.row, outcome: 'failed', message: schoolErr?.message ?? 'School insert failed.' })
      continue
    }
    existing.set(key, school.id)

    const contactRows = group.filter(hasContact)
    const ordered = primaryRow ? [primaryRow, ...contactRows.filter(v => v !== primaryRow)] : contactRows
    // One insert per contact: keeps "first contact becomes primary" exact and
    // pins any failure to its own row.
    const failedRows = new Map<number, string>()
    for (const v of ordered) {
      const { error: cErr } = await ctx.supabase
        .from('school_contacts')
        .insert({ ...contactRecord(v), school_id: school.id, studio_id: ctx.studioId })
      if (cErr) failedRows.set(v.row, `School created, but this contact failed: ${cErr.message}`)
    }
    for (const v of group) {
      const msg = failedRows.get(v.row)
      results.push(msg ? { row: v.row, outcome: 'failed', message: msg } : { row: v.row, outcome: 'created' })
    }
  }

  revalidatePath('/school-outreach')
  return { results: results.sort((a, b) => a.row - b.row), error: null }
}

/** "Update" for a school that already exists: add only contacts it doesn't have yet. */
async function addContactsToExistingSchool(
  ctx: Ctx,
  schoolId: string,
  group: ValidatedRow[],
  primaryRow: ValidatedRow | undefined,
  results: RowResult[],
) {
  const { data: current } = await ctx.supabase
    .from('school_contacts')
    .select('name, email')
    .eq('school_id', schoolId)
    .eq('studio_id', ctx.studioId)
  const known = ((current ?? []) as { name: string; email: string | null }[])
  const emails = new Set(known.map(c => c.email?.trim().toLowerCase()).filter(Boolean))
  const names = new Set(known.map(c => c.name.trim().toLowerCase()))

  for (const v of group) {
    if (!hasContact(v)) {
      results.push({ row: v.row, outcome: 'skipped', message: 'School already exists; row has no contact to add.' })
      continue
    }
    const c = contactRecord(v)
    const email = c.email?.toLowerCase()
    // Match on email when there is one, otherwise on name.
    const isKnown = email ? emails.has(email) : names.has(c.name.toLowerCase())
    if (isKnown) {
      results.push({ row: v.row, outcome: 'skipped', message: 'This contact is already on the school.' })
      continue
    }
    const { data: inserted, error: cErr } = await ctx.supabase
      .from('school_contacts')
      .insert({ ...c, school_id: schoolId, studio_id: ctx.studioId })
      .select('id')
      .single()
    if (cErr || !inserted) {
      results.push({ row: v.row, outcome: 'failed', message: cErr?.message ?? 'Contact insert failed.' })
      continue
    }
    if (email) emails.add(email)
    names.add(c.name.toLowerCase())
    if (v === primaryRow) {
      const { error: pErr } = await ctx.supabase.rpc('set_primary_school_contact', { p_contact_id: inserted.id })
      if (pErr) {
        results.push({ row: v.row, outcome: 'updated', message: `Contact added, but could not be made primary: ${pErr.message}` })
        continue
      }
    }
    results.push({ row: v.row, outcome: 'updated' })
  }
}

// ─── Facebook groups ────────────────────────────────────────────────────────

function groupRecord(v: ValidatedRow) {
  return {
    group_name: v.clean.group_name as string,
    group_url: (v.clean.group_url as string | null) ?? null,
    group_location: (v.clean.group_location as string | null) ?? null,
    group_membership_size: (v.clean.group_membership_size as number | null) ?? null,
    post_type: v.clean.post_type as string,
    qualification_status: v.clean.qualification_status as string,
    is_active: v.clean.is_active as boolean,
    post_frequency: (v.clean.post_frequency as string | null) ?? null,
    post_days: (v.clean.post_days as string[] | null) ?? [],
    post_week_pattern: v.clean.post_week_pattern as string,
    shared_with: (v.clean.shared_with as string | null) ?? null,
    posting_rules: (v.clean.posting_rules as string | null) ?? null,
    application_date: (v.clean.application_date as string | null) ?? null,
    acceptance_date: (v.clean.acceptance_date as string | null) ?? null,
    most_recent_post_date: (v.clean.most_recent_post_date as string | null) ?? null,
    notes: (v.clean.notes as string | null) ?? null,
  }
}

type GroupRecord = ReturnType<typeof groupRecord>

/**
 * Columns an update may write: only cells the CSV filled in with a value that
 * was understood, so blanks, defaults and unreadable values never overwrite
 * what an existing group already has. The URL is only filled in, never changed.
 */
function groupPatch(v: ValidatedRow, raw: Record<string, string>, existing: ExistingGroup): Partial<GroupRecord> {
  const rec = groupRecord(v)
  const patch: Partial<GroupRecord> = {}
  const set = <K extends keyof GroupRecord>(key: K) => { patch[key] = rec[key] }
  for (const f of FACEBOOK_GROUPS_IMPORT.fields) {
    const key = f.key as keyof GroupRecord
    const value = raw[f.key]
    if (!value) continue
    switch (f.kind) {
      case 'enum': if (matchOption(value, f.options ?? []) !== null) set(key); break
      case 'boolean': if (parseBoolean(value) !== null) set(key); break
      case 'days': if (rec.post_days.length > 0) set(key); break
      case 'fb_group_url': if (!existing.group_url && rec.group_url) set(key); break
      case 'integer':
      case 'date': if (rec[key] !== null) set(key); break
      default: set(key)
    }
  }
  return patch
}

export async function importFacebookGroupsBatch(
  rowsInput: MappedRow[],
  mode: DuplicateMode,
): Promise<{ results: RowResult[]; error: string | null }> {
  const { ctx, error } = await importContext('facebook_groups')
  if (!ctx) return { results: [], error }
  const rows = sanitize(rowsInput, FACEBOOK_GROUPS_IMPORT)
  if (!rows) return { results: [], error: 'Invalid import batch.' }

  let existing: Map<string, ExistingGroup>
  try {
    existing = await existingFacebookGroups(ctx)
  } catch (e) {
    return { results: [], error: e instanceof Error ? e.message : 'Lookup failed' }
  }

  const results: RowResult[] = []
  const toInsert: ValidatedRow[] = []
  // Identity keys of groups already created or updated by this batch: a later
  // row for the same group is a repeat within the file and must not overwrite the first.
  const handled = new Set<string>()
  const messages = DUPLICATE_MESSAGES.facebook_groups

  for (const r of rows) {
    const v = validateRow(r, FACEBOOK_GROUPS_IMPORT)
    if (v.status === 'error') { results.push(errorResult(v)); continue }

    const matchKeys = rowMatchKeys(v)
    if (matchKeys.some(k => handled.has(k))) {
      results.push({ row: v.row, outcome: 'skipped', message: messages.file })
      continue
    }
    for (const k of v.identityKeys ?? matchKeys) handled.add(k)
    const match = matchKeys.map(k => existing.get(k)).find(Boolean)
    if (!match) { toInsert.push(v); continue }

    if (mode === 'skip') { results.push({ row: v.row, outcome: 'skipped', message: messages.account }); continue }

    const patch = groupPatch(v, r.values, match)
    if (Object.keys(patch).length === 0) {
      results.push({ row: v.row, outcome: 'skipped', message: 'Already exists; nothing new to update.' })
      continue
    }
    const { error: upErr } = await ctx.supabase
      .from('facebook_groups').update(patch).eq('id', match.id).eq('studio_id', ctx.studioId)
    results.push(upErr ? { row: v.row, outcome: 'failed', message: upErr.message } : { row: v.row, outcome: 'updated' })
  }

  if (toInsert.length) {
    const records = toInsert.map(v => ({ ...groupRecord(v), studio_id: ctx.studioId }))
    const { error: insErr } = await ctx.supabase.from('facebook_groups').insert(records)
    if (!insErr) {
      for (const v of toInsert) results.push({ row: v.row, outcome: 'created' })
    } else {
      // One bad row fails the whole statement; retry one by one to find it.
      for (let i = 0; i < toInsert.length; i++) {
        const { error: oneErr } = await ctx.supabase.from('facebook_groups').insert(records[i])
        results.push(oneErr
          ? { row: toInsert[i].row, outcome: 'failed', message: oneErr.message }
          : { row: toInsert[i].row, outcome: 'created' })
      }
    }
  }

  revalidatePath('/facebook-groups')
  return { results: results.sort((a, b) => a.row - b.row), error: null }
}
