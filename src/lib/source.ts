/**
 * Source values ("Book", "District directory", …) are compared by key:
 * trimmed and lowercased. Two spellings with the same key are the same source.
 * The database mirrors this in the generated school_outreach.source_key and
 * contacts.lead_source_key columns (lower(nullif(btrim(x), ''))).
 *
 * Imported by both server and client code.
 */

/** Trimmed source, or null when blank. Never an empty string. */
export function cleanSource(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed || null
}

/** Comparison key for a source, or null when blank. */
export function sourceKey(raw: string | null | undefined): string | null {
  return cleanSource(raw)?.toLowerCase() ?? null
}

/**
 * The spelling to use for one source: the most common one, and on a tie the
 * one seen first (rows are expected oldest first). Matches the cleanup
 * migration and the facet functions.
 */
export function preferredSpelling(spellings: string[]): string | null {
  const counts = new Map<string, number>()
  for (const s of spellings) counts.set(s, (counts.get(s) ?? 0) + 1)
  let best: string | null = null
  let bestCount = 0
  // Map iteration follows insertion order, so the earliest spelling wins ties.
  for (const [spelling, n] of counts) {
    if (n > bestCount) { best = spelling; bestCount = n }
  }
  return best
}
