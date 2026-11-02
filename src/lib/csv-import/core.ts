/**
 * Shared CSV import engine for /leads, /school-outreach and /facebook-groups.
 *
 * Everything that decides what a row means lives here and runs in both
 * places: in the browser for the preview, and again in the server action so
 * nothing the client sends is trusted. The downloadable template is built from
 * the same field list, so template and importer cannot drift apart.
 *
 * No server-only or browser-only imports.
 */

export const MAX_IMPORT_ROWS = 2000
export const IMPORT_BATCH_SIZE = 100

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface ImportOption {
  value: string
  label: string
}

/**
 * integer: whole number, "8,800" and "8.8k" accepted. date: YYYY-MM-DD or
 * M/D/YYYY, saved as YYYY-MM-DD. days: list of weekdays, saved as
 * ['mon', 'wed']. fb_group_url: a facebook.com/groups/ link (anything else is
 * an error), saved in canonical form. Unreadable integer, date and day values
 * are warnings and are left blank.
 */
export type FieldKind = 'text' | 'email' | 'enum' | 'boolean' | 'integer' | 'date' | 'days' | 'fb_group_url'

export interface ImportField {
  /** Template header, and the key used for the field everywhere in the import. */
  key: string
  label: string
  kind: FieldKind
  required?: boolean
  /** Other headers that auto-map to this field (compared after normalizeHeader). */
  aliases?: string[]
  example: string
  maxLength?: number
  /** enum fields: accepted values, matched against value or label. */
  options?: ImportOption[]
  /**
   * enum fields other than `status`: value used when the cell is blank or
   * unknown (unknown also warns). Without it they are left blank.
   * boolean fields: value when blank or not understood (default false).
   */
  defaultValue?: string | boolean
}

export type EntityKind = 'leads' | 'schools' | 'facebook_groups'

export interface ImportConfig {
  entity: EntityKind
  /** "lead" / "school", for messages. */
  noun: string
  /** "leads" / "schools", for headings. */
  nounPlural: string
  /** Label of the "update instead of skip" duplicate option. */
  updateLabel: string
  templateFilename: string
  fields: ImportField[]
}

/** One CSV row after column mapping: field key -> trimmed value. */
export interface MappedRow {
  /** 1-based data row number (header excluded), for messages and the error report. */
  row: number
  values: Record<string, string>
}

export type RowStatus = 'ready' | 'warning' | 'error' | 'duplicate'

export type CleanValue = string | boolean | number | string[] | null

export interface ValidatedRow extends MappedRow {
  status: RowStatus
  /** Normalised values ready to write (enum labels resolved, defaults applied). */
  clean: Record<string, CleanValue>
  messages: string[]
  /** Leads: lowercased email. Schools: school_name|city|state. Null when there's nothing to match on. */
  dedupeKey: string | null
  /**
   * Facebook groups only, where a row can match a group in more than one way
   * (see facebookGroupKeys). Other entities match on dedupeKey alone.
   */
  identityKeys?: string[]
  matchKeys?: string[]
  /**
   * Set when status is 'duplicate'. 'account' rows can be updated instead of
   * skipped; 'file' rows (a repeat of an earlier row) are always skipped.
   */
  duplicateOf?: 'account' | 'file'
}

// ─── Headers ────────────────────────────────────────────────────────────────

/**
 * Case-insensitive, ignoring spaces, underscores and any other punctuation,
 * so "E-mail Address", "email_address" and "Primary?" match their fields.
 */
export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** CSV header -> field key (or null = ignored). Exact key matches beat aliases. */
export function autoMapHeaders(headers: string[], config: ImportConfig): Record<string, string | null> {
  const mapping: Record<string, string | null> = {}
  const taken = new Set<string>()
  const pass = (match: (h: string, f: ImportField) => boolean) => {
    for (const header of headers) {
      if (mapping[header]) continue
      const field = config.fields.find(f => !taken.has(f.key) && match(normalizeHeader(header), f))
      if (field) {
        mapping[header] = field.key
        taken.add(field.key)
      }
    }
  }
  pass((h, f) => h === normalizeHeader(f.key) || h === normalizeHeader(f.label))
  pass((h, f) => (f.aliases ?? []).some(a => normalizeHeader(a) === h))
  for (const header of headers) if (!(header in mapping)) mapping[header] = null
  return mapping
}

/** Problems that block leaving the mapping step. */
export function mappingErrors(mapping: Record<string, string | null>, config: ImportConfig): string[] {
  const used = Object.values(mapping).filter((k): k is string => !!k)
  const errors: string[] = []
  for (const f of config.fields) {
    if (f.required && !used.includes(f.key)) errors.push(`Map a column to “${f.label}” (required).`)
  }
  const seen = new Set<string>()
  for (const key of used) {
    if (seen.has(key)) {
      const label = config.fields.find(f => f.key === key)?.label ?? key
      errors.push(`“${label}” is mapped from more than one column.`)
    }
    seen.add(key)
  }
  return errors
}

export function applyMapping(
  rawRows: Record<string, string>[],
  mapping: Record<string, string | null>,
): MappedRow[] {
  return rawRows.map((raw, i) => {
    const values: Record<string, string> = {}
    for (const [header, key] of Object.entries(mapping)) {
      if (key) values[key] = String(raw[header] ?? '').trim()
    }
    return { row: i + 1, values }
  })
}

// ─── Template ───────────────────────────────────────────────────────────────

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function toCsv(rows: string[][]): string {
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** Header row + one example row, straight from the field list. */
export function buildTemplateCsv(config: ImportConfig): string {
  return toCsv([config.fields.map(f => f.key), config.fields.map(f => f.example)])
}

// ─── Values ─────────────────────────────────────────────────────────────────

function optionKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function matchOption(value: string, options: ImportOption[]): string | null {
  const k = optionKey(value)
  if (!k) return null
  return options.find(o => optionKey(o.value) === k || optionKey(o.label) === k)?.value ?? null
}

const TRUE_WORDS = new Set(['true', 'yes', 'y', '1', 'x', 'primary'])
const FALSE_WORDS = new Set(['false', 'no', 'n', '0', ''])

/** yes/no words -> boolean; null if not understood. Blank is no. */
export function parseBoolean(raw: string): boolean | null {
  const lower = raw.trim().toLowerCase()
  return TRUE_WORDS.has(lower) ? true : FALSE_WORDS.has(lower) ? false : null
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email)
}

/** "8,800", "8800 members", "8.8k", "1.2M" -> whole number; null if unreadable. */
export function parseCount(raw: string): number | null {
  const m = raw.toLowerCase().replace(/[,\s]/g, '').replace(/members?$/, '').match(/^(\d+(?:\.\d+)?)([km]?)$/)
  if (!m) return null
  const n = Math.round(parseFloat(m[1]) * (m[2] === 'k' ? 1_000 : m[2] === 'm' ? 1_000_000 : 1))
  return Number.isSafeInteger(n) && n <= 2_147_483_647 ? n : null
}

/** YYYY-MM-DD, M/D/YYYY or M/D/YY -> YYYY-MM-DD; null if not a real date. */
export function parseDate(raw: string): string | null {
  let y: number, mo: number, d: number
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
  if (iso) [y, mo, d] = [+iso[1], +iso[2], +iso[3]]
  else if (us) [mo, d, y] = [+us[1], +us[2], us[3].length === 2 ? 2000 + +us[3] : +us[3]]
  else return null
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null
  return date.toISOString().slice(0, 10)
}

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const WEEKDAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

/** "Mon, Wed & Friday" -> days ['mon', 'wed', 'fri'] in week order, plus the words not understood. */
export function parseDays(raw: string): { days: string[]; unknown: string[] } {
  const found = new Set<string>()
  const unknown: string[] = []
  for (const word of raw.toLowerCase().split(/[\s,;/&+|]+/)) {
    const w = word.replace(/\.$/, '')
    if (!w || w === 'and') continue
    const i = WEEKDAY_NAMES.findIndex(name => w.length >= 3 && name.startsWith(w))
    if (i >= 0) found.add(WEEKDAYS[i])
    else unknown.push(word)
  }
  return { days: WEEKDAYS.filter(d => found.has(d)), unknown }
}

/**
 * The group slug of a Facebook group link, or null when it isn't one.
 * Lowercased, without http(s)://, www./m., query string, hash or trailing
 * slashes; anything after the slug (/about, /posts/…) is ignored.
 * "https://m.facebook.com/groups/PianoMoms/?ref=share" -> "pianomoms".
 */
export function facebookGroupSlug(raw: string): string | null {
  const s = raw.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^(www\.|m\.)/, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
  const m = s.match(/^facebook\.com\/groups\/([a-z0-9._-]+)(?:\/.*)?$/)
  return m ? m[1] : null
}

export function canonicalFacebookGroupUrl(slug: string): string {
  return `https://www.facebook.com/groups/${slug}`
}

function groupNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * How Facebook groups are matched.
 *
 * `identity`: what a group (existing, or an earlier row of the file) can be
 * matched by. `match`: what a row is looked up by.
 *
 * - Same URL slug -> same group.
 * - facebook.com/groups/<id> and /groups/<vanity-name> can be the same group,
 *   but nothing here can tell which id belongs to which name. So a numeric
 *   link and a name link count as the same group when the group names match.
 * - A row without a URL matches on the group name alone.
 */
export function facebookGroupKeys(name: string, url: string | null | undefined): { identity: string[]; match: string[] } {
  const n = groupNameKey(name)
  const slug = url ? facebookGroupSlug(url) : null
  const identity = n ? [`name:${n}`] : []
  if (!slug) return { identity, match: identity }
  const kind = /^\d+$/.test(slug) ? 'id' : 'vanity'
  const other = kind === 'id' ? 'vanity' : 'id'
  if (n) identity.push(`${kind}name:${n}`)
  identity.push(`url:${slug}`)
  return { identity, match: [`url:${slug}`, ...(n ? [`${other}name:${n}`] : [])] }
}

/** Keys a validated row is looked up by: its matchKeys, else its dedupeKey. */
export function rowMatchKeys(v: ValidatedRow): string[] {
  return v.matchKeys ?? (v.dedupeKey ? [v.dedupeKey] : [])
}

/**
 * Field-level validation shared by every entity. Entity rules (defaults for
 * status/source, dedupe keys) are layered on top in validateRow.
 */
function validateFields(row: MappedRow, config: ImportConfig) {
  const clean: Record<string, CleanValue> = {}
  const errors: string[] = []
  const warnings: string[] = []

  for (const f of config.fields) {
    const raw = row.values[f.key] ?? ''
    const boolDefault = f.defaultValue === true
    if (!raw) {
      if (f.required) errors.push(`${f.label} is required.`)
      clean[f.key] = f.kind === 'boolean' ? boolDefault : f.kind === 'days' ? [] : null
      continue
    }
    if (f.maxLength && raw.length > f.maxLength) {
      errors.push(`${f.label} is longer than ${f.maxLength} characters.`)
      continue
    }
    switch (f.kind) {
      case 'email':
        if (!isValidEmail(raw)) errors.push(`“${raw}” is not a valid email.`)
        clean[f.key] = raw
        break
      case 'boolean': {
        const value = parseBoolean(raw)
        if (value !== null) clean[f.key] = value
        else {
          warnings.push(`${f.label} “${raw}” not understood; treated as ${boolDefault ? 'yes' : 'no'}.`)
          clean[f.key] = boolDefault
        }
        break
      }
      case 'integer':
        clean[f.key] = parseCount(raw)
        if (clean[f.key] === null) warnings.push(`${f.label} “${raw}” is not a number; will be left blank.`)
        break
      case 'date':
        clean[f.key] = parseDate(raw)
        if (clean[f.key] === null) warnings.push(`${f.label} “${raw}” is not a date (use YYYY-MM-DD); will be left blank.`)
        break
      case 'days': {
        const { days, unknown } = parseDays(raw)
        if (unknown.length) warnings.push(`${f.label}: “${unknown.join(', ')}” not understood; ignored.`)
        clean[f.key] = days
        break
      }
      case 'fb_group_url': {
        const slug = facebookGroupSlug(raw)
        if (!slug) errors.push(`“${raw}” is not a Facebook group link (facebook.com/groups/…).`)
        clean[f.key] = slug ? canonicalFacebookGroupUrl(slug) : null
        break
      }
      case 'enum':
        // Unknown values are resolved per entity in validateRow (they default).
        clean[f.key] = matchOption(raw, f.options ?? [])
        break
      default:
        clean[f.key] = raw
    }
  }
  return { clean, errors, warnings }
}

/** school_name + city + state, normalised; how schools are matched. */
export function schoolKey(name: string, city: string | null | undefined, state: string | null | undefined): string {
  const n = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  return `${n(name)}|${n(city)}|${n(state)}`
}

export const CSV_IMPORT_SCHOOL_SOURCE = 'CSV import'
export const CSV_IMPORT_LEAD_SOURCE = 'csv_import'
const PLACEHOLDER_NAME = '(name needed)'

export function validateRow(row: MappedRow, config: ImportConfig): ValidatedRow {
  const { clean, errors, warnings } = validateFields(row, config)
  const field = (key: string) => config.fields.find(f => f.key === key)
  const raw = (key: string) => row.values[key] ?? ''
  let dedupeKey: string | null = null
  let groupKeys: { identity: string[]; match: string[] } | undefined

  // Status / stage: blank -> first pipeline stage quietly; unknown -> first stage with a warning.
  const statusField = field('status')
  if (statusField?.options?.length && clean.status === null) {
    const first = statusField.options[0]
    if (raw('status')) warnings.push(`Unknown ${statusField.label.toLowerCase()} “${raw('status')}”; will be set to “${first.label}”.`)
    clean.status = first.value
  }

  if (config.entity === 'leads') {
    if (clean.source === null) {
      warnings.push(raw('source')
        ? `Unknown source “${raw('source')}”; will be set to “CSV Import”.`
        : 'Source blank; will be set to “CSV Import”.')
      clean.source = CSV_IMPORT_LEAD_SOURCE
    }
    const email = typeof clean.email === 'string' ? clean.email.toLowerCase() : null
    dedupeKey = email && isValidEmail(email) ? email : null
  } else if (config.entity === 'facebook_groups') {
    // Every option field: blank -> its default quietly; unknown -> default with a warning.
    for (const f of config.fields) {
      if (f.kind !== 'enum' || clean[f.key] !== null) continue
      const fallback = typeof f.defaultValue === 'string' ? f.defaultValue : null
      if (raw(f.key)) {
        const label = f.options?.find(o => o.value === fallback)?.label
        warnings.push(`Unknown ${f.label.toLowerCase()} “${raw(f.key)}”; ${label ? `will be set to “${label}”` : 'will be left blank'}.`)
      }
      clean[f.key] = fallback
    }
    if (typeof clean.group_name === 'string') {
      groupKeys = facebookGroupKeys(clean.group_name, clean.group_url as string | null)
      dedupeKey = groupKeys.match[0] ?? null
    }
  } else {
    if (!clean.source) {
      warnings.push(`Source blank; will be set to “${CSV_IMPORT_SCHOOL_SOURCE}”.`)
      clean.source = CSV_IMPORT_SCHOOL_SOURCE
    }
    const hasContact = !!(clean.contact_name || clean.contact_email || clean.contact_phone || clean.contact_title)
    if (hasContact && !clean.contact_name) {
      warnings.push(`Contact has no name; will be saved as “${PLACEHOLDER_NAME}”.`)
      clean.contact_name = PLACEHOLDER_NAME
    }
    if (typeof clean.school_name === 'string') {
      dedupeKey = schoolKey(clean.school_name, clean.city as string | null, clean.state as string | null)
    }
  }

  const status: RowStatus = errors.length ? 'error' : warnings.length ? 'warning' : 'ready'
  return {
    ...row, status, clean, messages: [...errors, ...warnings], dedupeKey,
    ...(groupKeys ? { identityKeys: groupKeys.identity, matchKeys: groupKeys.match } : {}),
  }
}

/**
 * Validates every row and marks duplicates: against `existingKeys` (already in
 * the account) and against earlier rows of the same file.
 *
 * Schools are the exception for in-file repeats: several rows with the same
 * school are several contacts of ONE school, not duplicates. A school row is a
 * duplicate only when its school already exists in the account.
 */
export function validateRows(rows: MappedRow[], config: ImportConfig, existingKeys: Set<string>): ValidatedRow[] {
  const seenInFile = new Set<string>()
  return rows.map(r => {
    const v = validateRow(r, config)
    if (v.status === 'error' || !v.dedupeKey) return v
    const matchKeys = rowMatchKeys(v)
    // A repeat of an earlier lead or group row is checked first: only the first
    // row for a lead or group may create or update; later ones are always skipped.
    if (config.entity !== 'schools') {
      if (matchKeys.some(k => seenInFile.has(k))) {
        return { ...v, status: 'duplicate', duplicateOf: 'file', messages: [DUPLICATE_MESSAGES[config.entity].file, ...v.messages] }
      }
      for (const k of v.identityKeys ?? matchKeys) seenInFile.add(k)
    }
    if (matchKeys.some(k => existingKeys.has(k))) {
      return { ...v, status: 'duplicate', duplicateOf: 'account', messages: [DUPLICATE_MESSAGES[config.entity].account, ...v.messages] }
    }
    return v
  })
}

export const DUPLICATE_MESSAGES: Record<EntityKind, { account: string; file: string }> = {
  leads: { account: 'A lead with this email already exists.', file: 'Same email as an earlier row in this file.' },
  // Repeated school rows are more contacts for one school, never duplicates.
  schools: { account: 'This school already exists.', file: '' },
  facebook_groups: { account: 'This group already exists.', file: 'Same group as an earlier row in this file.' },
}

export interface StatusCounts {
  ready: number
  warning: number
  error: number
  duplicate: number
}

export function countStatuses(rows: { status: RowStatus }[]): StatusCounts {
  const counts: StatusCounts = { ready: 0, warning: 0, error: 0, duplicate: 0 }
  for (const r of rows) counts[r.status]++
  return counts
}

// ─── Batching ───────────────────────────────────────────────────────────────

/**
 * Splits rows into batches of about `size`. For schools, rows of the same school
 * always land in the same batch, so one batch can create a school and all its
 * contacts together.
 */
export function makeBatches<T extends { dedupeKey: string | null }>(rows: T[], entity: EntityKind, size = IMPORT_BATCH_SIZE): T[][] {
  if (entity !== 'schools') {
    const out: T[][] = []
    for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
    return out
  }
  const groups = new Map<string, T[]>()
  for (const r of rows) {
    const k = r.dedupeKey ?? ''
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  const out: T[][] = []
  let current: T[] = []
  for (const group of groups.values()) {
    if (current.length && current.length + group.length > size) {
      out.push(current)
      current = []
    }
    current.push(...group)
  }
  if (current.length) out.push(current)
  return out
}

// ─── Results ────────────────────────────────────────────────────────────────

export type RowOutcome = 'created' | 'updated' | 'skipped' | 'failed'

export interface RowResult {
  row: number
  outcome: RowOutcome
  /** Why it was skipped or failed. */
  message?: string
}

/** Original columns of the failed rows plus an `error` column, ready to fix and re-upload. */
export function buildErrorReport(
  headers: string[],
  rawRows: Record<string, string>[],
  failures: { row: number; message: string }[],
): string {
  // Drop an `error` column left over from a previous report, so fixing and
  // re-uploading a report doesn't stack error columns.
  const keep = headers.filter(h => normalizeHeader(h) !== 'error')
  const out: string[][] = [[...keep, 'error']]
  for (const f of failures) {
    const raw = rawRows[f.row - 1] ?? {}
    out.push([...keep.map(h => String(raw[h] ?? '')), f.message])
  }
  return toCsv(out)
}
