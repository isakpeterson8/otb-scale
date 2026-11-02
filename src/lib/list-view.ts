/**
 * Shared sort / filter / group "views" for list pages (/leads, /school-outreach).
 *
 * One ListView shape lives in the URL query string, so a view can be
 * bookmarked and the back button walks through view changes. The server page
 * parses it with parseListView() and turns it into a Supabase query with
 * applyListView() — sorting and filtering happen in Postgres, not the browser.
 * The client side (useListView + ListViewToolbar) only reads and writes the URL.
 *
 * Imported by both server and client code, so nothing here may touch
 * server-only modules.
 *
 * Sources are compared by key (trimmed, lowercased; see src/lib/source.ts):
 * source values in the URL are keys, and filtering, grouping and sorting use
 * the generated key column, so "book" and "Book" are always one source.
 */

import { sourceKey } from './source'

export type SortKey =
  | 'created_desc'
  | 'created_asc'
  | 'name_asc'
  | 'name_desc'
  | 'source_asc'
  | 'status_pipeline'
  | 'due_asc'

export type GroupKey = 'none' | 'status' | 'source'

export type PresetKey = 'all' | 'new_week' | 'follow_up'

export interface ListView {
  sort: SortKey
  status: string[]
  source: string[]
  q: string
  group: GroupKey
  preset: PresetKey
}

/** Chip value standing in for NULL (an untriaged lead, a row with no source). */
export const NONE_VALUE = '__none__'

export const DEFAULT_VIEW: ListView = {
  sort: 'created_desc',
  status: [],
  source: [],
  q: '',
  group: 'none',
  preset: 'all',
}

/** The query-string keys a view owns. Anything else in the URL (e.g. ?tab=) is left alone. */
export const VIEW_PARAM_KEYS = ['sort', 'status', 'source', 'q', 'group', 'preset'] as const

export interface FacetOption {
  value: string
  label: string
}

export interface ListViewConfig {
  /** localStorage namespace for the last-used view. */
  storageKey: string
  nameColumn: string
  /** Shown in the sort menu, e.g. "School name". */
  nameLabel: string
  statusColumn: string
  /** Generated pipeline-order column (see the list-views migration). */
  statusRankColumn: string
  /** "Status" on leads, "Stage" on schools. */
  statusLabel: string
  /** In pipeline order. */
  statusOptions: FacetOption[]
  /** Chip label for NULL status, or omit when the column is never NULL. */
  statusNoneLabel?: string
  sourceColumn: string
  /** Generated lower(trim(source)) column; filters, grouping and sorting use it. */
  sourceKeyColumn: string
  /** Fixed source set (values are lowercase keys); omit to build the chips from whatever values exist. */
  sourceOptions?: FacetOption[]
  sourceNoneLabel: string
  /** Columns matched by the text search box. */
  searchColumns: string[]
  searchPlaceholder: string
  /**
   * Column (or PostgREST computed field) holding each row's next due date,
   * NULL when nothing is due. Omit to leave out the "Next due date" sort.
   */
  dueDateColumn?: string
  /** What the "Needs follow-up" preset filters on. */
  followUp:
    | { kind: 'equals'; column: string; value: string }
    | { kind: 'due_by_today'; column: string }
}

export const SORT_OPTIONS: {
  value: SortKey
  label: (c: ListViewConfig) => string
  /** Omit when every page offers it. */
  availableFor?: (c: ListViewConfig) => boolean
}[] = [
  { value: 'created_desc',    label: () => 'Date added, newest' },
  { value: 'created_asc',     label: () => 'Date added, oldest' },
  { value: 'name_asc',        label: c => `${c.nameLabel} A→Z` },
  { value: 'name_desc',       label: c => `${c.nameLabel} Z→A` },
  { value: 'source_asc',      label: () => 'Source A→Z' },
  { value: 'status_pipeline', label: c => `${c.statusLabel} (pipeline order)` },
  { value: 'due_asc',         label: () => 'Next due date', availableFor: c => !!c.dueDateColumn },
]

/** The sort options a page offers, in menu order. */
export function sortOptionsFor(config: ListViewConfig) {
  return SORT_OPTIONS.filter(o => !o.availableFor || o.availableFor(config))
}

export const GROUP_OPTIONS: { value: GroupKey; label: (c: ListViewConfig) => string }[] = [
  { value: 'none',   label: () => 'No grouping' },
  { value: 'status', label: c => `Group by ${c.statusLabel.toLowerCase()}` },
  { value: 'source', label: () => 'Group by source' },
]

export const PRESET_OPTIONS: { value: PresetKey; label: string }[] = [
  { value: 'all',       label: 'All' },
  { value: 'new_week',  label: 'New this week' },
  { value: 'follow_up', label: 'Needs follow-up' },
]

// ─── URL <-> ListView ────────────────────────────────────────────────────────

type ParamSource =
  | URLSearchParams
  | { get(key: string): string | null }
  | Record<string, string | string[] | undefined>

function readParam(params: ParamSource, key: string): string | null {
  if (typeof (params as URLSearchParams).get === 'function') {
    return (params as URLSearchParams).get(key)
  }
  const raw = (params as Record<string, string | string[] | undefined>)[key]
  if (Array.isArray(raw)) return raw[0] ?? null
  return raw ?? null
}

function readList(params: ParamSource, key: string): string[] {
  const raw = readParam(params, key)
  if (!raw) return []
  return Array.from(new Set(raw.split(',').map(s => s.trim()).filter(Boolean)))
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

/** Parses and validates a view. Unknown values fall back to the default, never throw. */
export function parseListView(params: ParamSource, config: ListViewConfig): ListView {
  const allowedStatus = new Set(config.statusOptions.map(o => o.value))
  if (config.statusNoneLabel) allowedStatus.add(NONE_VALUE)

  const allowedSource = config.sourceOptions
    ? new Set([...config.sourceOptions.map(o => o.value), NONE_VALUE])
    : null

  return {
    sort: oneOf(readParam(params, 'sort'), sortOptionsFor(config).map(o => o.value), DEFAULT_VIEW.sort),
    status: readList(params, 'status').filter(v => allowedStatus.has(v)),
    source: Array.from(new Set(readList(params, 'source').map(v => v.toLowerCase())))
      .filter(v => (allowedSource ? allowedSource.has(v) : v.length <= 100)),
    q: (readParam(params, 'q') ?? '').slice(0, 100),
    group: oneOf(readParam(params, 'group'), GROUP_OPTIONS.map(o => o.value), DEFAULT_VIEW.group),
    preset: oneOf(readParam(params, 'preset'), PRESET_OPTIONS.map(o => o.value), DEFAULT_VIEW.preset),
  }
}

/** Only the keys that differ from DEFAULT_VIEW, so the default view has a clean URL. */
export function serializeListView(view: ListView): Record<string, string> {
  const out: Record<string, string> = {}
  if (view.sort !== DEFAULT_VIEW.sort) out.sort = view.sort
  if (view.status.length) out.status = view.status.join(',')
  if (view.source.length) out.source = view.source.join(',')
  if (view.q.trim()) out.q = view.q.trim()
  if (view.group !== DEFAULT_VIEW.group) out.group = view.group
  if (view.preset !== DEFAULT_VIEW.preset) out.preset = view.preset
  return out
}

export function isDefaultView(view: ListView): boolean {
  return Object.keys(serializeListView(view)).length === 0
}

// ─── ListView -> Supabase query ──────────────────────────────────────────────

/**
 * The subset of the supabase-js filter builder applyListView uses. Every method
 * returns the builder, so any table's query satisfies it.
 */
export interface FilterableQuery<Q> {
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): Q
  in(column: string, values: readonly string[]): Q
  is(column: string, value: null): Q
  or(filters: string): Q
  gte(column: string, value: string): Q
  lte(column: string, value: string): Q
  eq(column: string, value: string): Q
}

/** Double-quotes a value for a PostgREST or()/in() list. */
function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * IN filter where NONE_VALUE in the list also matches NULL. That case needs an
 * OR, which is pushed onto `orGroups` instead of applied directly — see the
 * comment where the groups are combined in applyListView.
 */
function applyIn<Q extends FilterableQuery<Q>>(query: Q, column: string, values: string[], orGroups: string[]): Q {
  if (values.length === 0) return query
  const wantsNull = values.includes(NONE_VALUE)
  const concrete = values.filter(v => v !== NONE_VALUE)
  if (!wantsNull) return query.in(column, concrete)
  if (concrete.length === 0) return query.is(column, null)
  orGroups.push(`${column}.is.null,${column}.in.(${concrete.map(quote).join(',')})`)
  return query
}

/** ISO date (YYYY-MM-DD) for "today" in UTC. */
function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/** Search text with wildcard/quoting characters removed; '' when there's nothing to search. */
export function searchTerm(view: ListView): string {
  return view.q.replace(/[%*"\\]/g, '').trim()
}

/** A PostgREST `ilike` condition for a search term, for use inside or(). */
export function ilikeCondition(column: string, term: string): string {
  return `${column}.ilike.${quote(`%${term}%`)}`
}

/**
 * @param extraSearchMatch  An extra PostgREST condition OR-ed into the text
 *   search, for matches the base table's columns can't express — e.g.
 *   `id.in.(…)` for schools whose contacts match.
 */
export function applyListView<Q extends FilterableQuery<Q>>(
  query: Q,
  view: ListView,
  config: ListViewConfig,
  now: Date = new Date(),
  extraSearchMatch?: string,
): Q {
  let q = query
  const orGroups: string[] = []

  q = applyIn(q, config.statusColumn, view.status, orGroups)
  q = applyIn(q, config.sourceKeyColumn, view.source, orGroups)

  // Wildcards and quoting characters are stripped rather than escaped: a search
  // box has no use for them, and it keeps the or() string unambiguous.
  const term = searchTerm(view)
  if (term) {
    const conditions = config.searchColumns.map(col => ilikeCondition(col, term))
    if (extraSearchMatch) conditions.push(extraSearchMatch)
    orGroups.push(conditions.join(','))
  }

  // supabase-js appends a separate `or=` param per .or() call; rather than rely
  // on PostgREST AND-ing repeated params, AND the groups explicitly in one.
  if (orGroups.length === 1) q = q.or(orGroups[0])
  else if (orGroups.length > 1) q = q.or(`and(${orGroups.map(g => `or(${g})`).join(',')})`)

  if (view.preset === 'new_week') {
    q = q.gte('created_at', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString())
  } else if (view.preset === 'follow_up') {
    const f = config.followUp
    q = f.kind === 'equals' ? q.eq(f.column, f.value) : q.lte(f.column, todayIso(now))
  }

  // Grouped views order by the group key first so each section is contiguous;
  // the chosen sort then applies within each section.
  if (view.group === 'status') q = q.order(config.statusRankColumn, { ascending: true })
  if (view.group === 'source') q = q.order(config.sourceKeyColumn, { ascending: true, nullsFirst: false })

  switch (view.sort) {
    case 'created_asc':
      q = q.order('created_at', { ascending: true })
      break
    case 'name_asc':
      q = q.order(config.nameColumn, { ascending: true })
      break
    case 'name_desc':
      q = q.order(config.nameColumn, { ascending: false })
      break
    case 'source_asc':
      q = q.order(config.sourceKeyColumn, { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })
      break
    case 'status_pipeline':
      q = q.order(config.statusRankColumn, { ascending: true }).order('created_at', { ascending: false })
      break
    case 'due_asc':
      // Ascending dates already run overdue (oldest first) → today → upcoming;
      // rows with nothing due go last. Same-day ties and the no-date rows
      // are ordered by name.
      if (config.dueDateColumn) {
        q = q.order(config.dueDateColumn, { ascending: true, nullsFirst: false }).order(config.nameColumn, { ascending: true })
      }
      break
    case 'created_desc':
    default:
      q = q.order('created_at', { ascending: false })
  }

  // Stable order for ties (same name, same timestamp from a bulk import).
  return q.order('id', { ascending: true })
}

// ─── Facet counts ────────────────────────────────────────────────────────────

/**
 * Row counts per status / source across the whole studio. NULL is keyed as
 * NONE_VALUE; sources are keyed by sourceKey(), with `sourceLabels` holding
 * each key's preferred spelling.
 */
export interface ListFacets {
  total: number
  status: Record<string, number>
  source: Record<string, number>
  sourceLabels: Record<string, string>
}

export const EMPTY_FACETS: ListFacets = { total: 0, status: {}, source: {}, sourceLabels: {} }

/** The key a row's source is grouped and filtered under. */
export function sourceGroupKey(source: string | null | undefined): string {
  return sourceKey(source) ?? NONE_VALUE
}

/**
 * Folds the rows returned by a *_list_facets() SQL function into ListFacets.
 * The function already merges case variants; summing by key here keeps the
 * chips merged even if it returns more than one spelling of a source.
 */
export function toFacets(rows: { facet: string; value: string | null; n: number | string }[] | null): ListFacets {
  const out: ListFacets = { total: 0, status: {}, source: {}, sourceLabels: {} }
  for (const row of rows ?? []) {
    const n = Number(row.n)
    if (row.facet === 'status') {
      out.status[row.value ?? NONE_VALUE] = n
      out.total += n
    } else if (row.facet === 'source') {
      const key = sourceGroupKey(row.value)
      out.source[key] = (out.source[key] ?? 0) + n
      if (row.value && !(key in out.sourceLabels)) out.sourceLabels[key] = row.value.trim()
    }
  }
  return out
}

/** Existing free-text sources as { value: preferred spelling, label }, A→Z. */
export function existingSourceSpellings(facets: ListFacets): FacetOption[] {
  return Object.values(facets.sourceLabels)
    .sort((a, b) => a.localeCompare(b))
    .map(label => ({ value: label, label }))
}

/** Source chips (value = key): the fixed option list, or every source present in the data. */
export function sourceChipOptions(config: ListViewConfig, facets: ListFacets): FacetOption[] {
  const base = config.sourceOptions
    ?? Object.entries(facets.sourceLabels)
      .sort(([, a], [, b]) => a.localeCompare(b))
      .map(([value, label]) => ({ value, label }))
  return [...base, { value: NONE_VALUE, label: config.sourceNoneLabel }]
}

export function statusChipOptions(config: ListViewConfig): FacetOption[] {
  return config.statusNoneLabel
    ? [...config.statusOptions, { value: NONE_VALUE, label: config.statusNoneLabel }]
    : config.statusOptions
}
