import {
  SCHOOL_ACTIVITY_LABELS, SCHOOL_NEXT_STEP_OPTIONS, SCHOOL_SUBJECT_AREAS,
  type SchoolActivityType, type SchoolContact, type SchoolNextStepOption,
  type SchoolOutreachActivity, type SchoolSubjectArea,
} from '@/types/database'

/**
 * Normalise a typed website into something storable and linkable.
 *
 * The database CHECK requires ^https?://[^\s]+$, so a bare domain has to gain a
 * scheme here or the write fails. Returns null for blank input and null for
 * anything that still is not a usable URL, so a typo is rejected rather than
 * stored and later rendered as a dead link.
 */
export function normalizeWebsite(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim()
  if (raw === '') return null

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  // Only http(s) — a mailto: or javascript: value must never reach an href.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  // A hostname with no dot is a typo, not a domain.
  if (!url.hostname.includes('.')) return null
  if (/\s/.test(url.href)) return null

  return url.href
}

/** Hostname only, for showing a link without the noise. */
export function websiteDisplay(website: string): string {
  try {
    return new URL(website).hostname.replace(/^www\./, '')
  } catch {
    return website
  }
}

export function nextStepLabel(option: SchoolNextStepOption | null): string | null {
  if (!option) return null
  return SCHOOL_NEXT_STEP_OPTIONS.find(o => o.value === option)?.label ?? option
}

export function subjectAreaLabel(area: SchoolSubjectArea | null): string | null {
  if (!area) return null
  return SCHOOL_SUBJECT_AREAS.find(a => a.value === area)?.label ?? area
}

export function activityLabel(type: SchoolActivityType): string {
  return SCHOOL_ACTIVITY_LABELS[type] ?? type
}

/**
 * The contact outreach goes to: the primary, or the only one, or nothing.
 *
 * Mirrors the server-side lookup in actions/cadence.ts deliberately — the client
 * uses this to show who will receive a send, the server re-derives it so a
 * forged contactId cannot redirect mail. If you change one, change both.
 */
export function primaryContact(contacts: SchoolContact[]): SchoolContact | null {
  return contacts.find(c => c.is_primary) ?? contacts[0] ?? null
}

/** Contacts with an email, primary first — the order the send picker offers. */
export function emailableContacts(contacts: SchoolContact[]): SchoolContact[] {
  return contacts
    .filter(c => (c.email ?? '').trim() !== '')
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.name.localeCompare(b.name))
}

/** Newest first. occurred_at is what the user set; created_at breaks ties. */
export function sortActivity(rows: SchoolOutreachActivity[]): SchoolOutreachActivity[] {
  return [...rows].sort((a, b) =>
    b.occurred_at.localeCompare(a.occurred_at) || b.created_at.localeCompare(a.created_at))
}
