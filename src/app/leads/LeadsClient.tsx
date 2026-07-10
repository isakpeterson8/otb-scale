'use client'

import { useState, useTransition } from 'react'
import { formatDate, daysAgo } from '@/lib/utils'
import { createContact, updateContact, deleteContact } from '@/app/actions/contacts'
import { createOrganicOutreach, updateOrganicOutreach, deleteOrganicOutreach } from '@/app/actions/organic-outreach'
import type { Contact, OrganicOutreach, OutreachType, OutreachStatus } from '@/types/database'
import { LEAD_SOURCES, LEAD_SUB_SOURCES, OUTREACH_TYPES } from '@/types/database'

interface FacebookGroupOption {
  id: string
  group_name: string
  is_active: boolean
}

interface LeadsClientProps {
  contacts: Contact[]
  facebookGroups: FacebookGroupOption[]
  outreachEntries: OrganicOutreach[]
}

const STATUS_OPTIONS = ['prospect', 'lead', 'active', 'inactive', 'student']

function formatLeadSource(
  contact: Contact,
  groups: FacebookGroupOption[],
): string | null {
  if (!contact.lead_source) return null
  const sourceLabel =
    LEAD_SOURCES.find(s => s.value === contact.lead_source)?.label ??
    contact.lead_source
  if (contact.lead_source !== 'facebook_group') return sourceLabel

  const parts = [sourceLabel]
  if (contact.lead_sub_source) {
    parts.push(
      LEAD_SUB_SOURCES.find(s => s.value === contact.lead_sub_source)?.label ??
        contact.lead_sub_source,
    )
  }
  if (contact.source_facebook_group_id) {
    const group = groups.find(g => g.id === contact.source_facebook_group_id)
    if (group) parts.push(group.group_name)
  }
  return parts.join(' → ')
}

// ── Lead Form ─────────────────────────────────────────────────────────────────

function LeadForm({
  contact,
  facebookGroups,
  onClose,
}: {
  contact?: Contact
  facebookGroups: FacebookGroupOption[]
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [leadSource, setLeadSource] = useState<string>(
    contact?.lead_source ?? '',
  )
  const [leadSubSource, setLeadSubSource] = useState<string>(
    contact?.lead_sub_source ?? '',
  )
  const [groupId, setGroupId] = useState<string>(
    contact?.source_facebook_group_id ?? '',
  )

  const activeGroups = facebookGroups.filter(g => g.is_active)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = contact
        ? await updateContact(contact.id, formData)
        : await createContact(formData)
      if (result.error) {
        setError(result.error)
      } else {
        onClose()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs text-[var(--ink-3)] mb-1">Name *</label>
        <input
          name="name"
          required
          defaultValue={contact?.name}
          className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
          placeholder="Jane Smith"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[var(--ink-3)] mb-1">Email</label>
          <input
            name="email"
            type="email"
            defaultValue={contact?.email ?? ''}
            className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
            placeholder="jane@example.com"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--ink-3)] mb-1">Phone</label>
          <input
            name="phone"
            type="tel"
            defaultValue={contact?.phone ?? ''}
            className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
            placeholder="(555) 000-0000"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-[var(--ink-3)] mb-1">Status</label>
        <select
          name="status"
          defaultValue={contact?.status ?? 'prospect'}
          className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s} className="bg-[var(--surface)]">
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Lead source cascade */}
      <div>
        <label className="block text-xs text-[var(--ink-3)] mb-1">
          Lead Source
        </label>
        <select
          name="lead_source"
          value={leadSource}
          onChange={e => {
            setLeadSource(e.target.value)
            setLeadSubSource('')
            setGroupId('')
          }}
          className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
        >
          <option value="">— Select source —</option>
          {LEAD_SOURCES.map(s => (
            <option key={s.value} value={s.value} className="bg-[var(--surface)]">
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {leadSource === 'facebook_group' && (
        <>
          <div>
            <label className="block text-xs text-[var(--ink-3)] mb-1">
              Post Type
            </label>
            <select
              name="lead_sub_source"
              value={leadSubSource}
              onChange={e => setLeadSubSource(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
            >
              <option value="">— Select type —</option>
              {LEAD_SUB_SOURCES.map(s => (
                <option key={s.value} value={s.value} className="bg-[var(--surface)]">
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {activeGroups.length > 0 && (
            <div>
              <label className="block text-xs text-[var(--ink-3)] mb-1">
                Facebook Group
              </label>
              <select
                name="source_facebook_group_id"
                value={groupId}
                onChange={e => setGroupId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
              >
                <option value="">— Select group —</option>
                {activeGroups.map(g => (
                  <option key={g.id} value={g.id} className="bg-[var(--surface)]">
                    {g.group_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      <div>
        <label className="block text-xs text-[var(--ink-3)] mb-1">Notes</label>
        <textarea
          name="notes"
          defaultValue={contact?.notes ?? ''}
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)] resize-none"
          placeholder="Any notes…"
        />
      </div>

      {error && (
        <p className="text-xs text-[var(--red)] bg-[var(--red-l)] px-3 py-2 rounded-lg">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--ink)] text-sm font-medium hover:bg-[var(--accent-text)] hover:text-[var(--canvas)] disabled:opacity-60 transition-colors"
        >
          {isPending ? 'Saving…' : contact ? 'Save changes' : 'Add lead'}
        </button>
      </div>
    </form>
  )
}

// ── Organic Outreach Form ─────────────────────────────────────────────────────

function OutreachForm({
  entry,
  onClose,
}: {
  entry?: OrganicOutreach
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = entry
        ? await updateOrganicOutreach(entry.id, formData)
        : await createOrganicOutreach(formData)
      if (result.error) setError(result.error)
      else onClose()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs text-[var(--ink-3)] mb-1">Name *</label>
        <input
          name="name"
          required
          defaultValue={entry?.name}
          className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
          placeholder="Name of organization or person"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[var(--ink-3)] mb-1">Type *</label>
          <select
            name="type"
            required
            defaultValue={entry?.type ?? 'organization'}
            className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
          >
            {OUTREACH_TYPES.map(({ value, label }) => (
              <option key={value} value={value} className="bg-[var(--surface)]">{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--ink-3)] mb-1">Status</label>
          <select
            name="status"
            defaultValue={entry?.status ?? 'active'}
            className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
          >
            <option value="active" className="bg-[var(--surface)]">Active</option>
            <option value="inactive" className="bg-[var(--surface)]">Inactive</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-[var(--ink-3)] mb-1">Contact Info</label>
        <input
          name="contact_info"
          defaultValue={entry?.contact_info ?? ''}
          className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
          placeholder="Email, phone, website…"
        />
      </div>

      <div>
        <label className="block text-xs text-[var(--ink-3)] mb-1">Last Contacted Date</label>
        <input
          name="last_contacted_date"
          type="date"
          defaultValue={entry?.last_contacted_date ?? ''}
          className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
        />
      </div>

      <div>
        <label className="block text-xs text-[var(--ink-3)] mb-1">Notes</label>
        <textarea
          name="notes"
          defaultValue={entry?.notes ?? ''}
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)] resize-none"
          placeholder="Any notes…"
        />
      </div>

      {error && (
        <p className="text-xs text-[var(--red)] bg-[var(--red-l)] px-3 py-2 rounded-lg">{error}</p>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--ink)] text-sm font-medium hover:bg-[var(--accent-text)] hover:text-[var(--canvas)] disabled:opacity-60 transition-colors"
        >
          {isPending ? 'Saving…' : entry ? 'Save changes' : 'Add entry'}
        </button>
      </div>
    </form>
  )
}

// ── Leads Tab ─────────────────────────────────────────────────────────────────

function LeadsTab({ contacts, facebookGroups }: { contacts: Contact[]; facebookGroups: FacebookGroupOption[] }) {
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editContact, setEditContact] = useState<Contact | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = contacts.filter(c => {
    const q = search.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q)
    )
  })

  function handleDelete(id: string) {
    if (!confirm('Delete this lead? This cannot be undone.')) return
    setDeletingId(id)
    startTransition(async () => {
      await deleteContact(id)
      setDeletingId(null)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--ink-3)]">{contacts.length} total</p>
        <button
          onClick={() => { setEditContact(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--ink)] text-sm font-medium hover:bg-[var(--accent-text)] hover:text-[var(--canvas)] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Add lead
        </button>
      </div>

      <div className="relative">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-3)]" aria-hidden>
          <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          placeholder="Search leads…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[var(--ink)]/15 bg-[var(--surface)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
        />
      </div>

      {(showForm || editContact) && (
        <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:bg-black/50 sm:px-4">
          <div className="flex-1 overflow-y-auto bg-[var(--surface)] sm:flex-none sm:rounded-2xl sm:border sm:border-[var(--ink)]/8 sm:max-h-[90vh] sm:w-full sm:max-w-md p-6 flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-medium text-[var(--ink)]">
                {editContact ? 'Edit lead' : 'New lead'}
              </h3>
              <button
                onClick={() => { setShowForm(false); setEditContact(null) }}
                className="p-2 text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <LeadForm
              contact={editContact ?? undefined}
              facebookGroups={facebookGroups}
              onClose={() => { setShowForm(false); setEditContact(null) }}
            />
          </div>
        </div>
      )}

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-sm text-[var(--ink-3)]">
              {search ? 'No leads match your search.' : 'No leads yet.'}
            </p>
          </div>
        ) : (
          <>
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-[var(--ink)]/6">
              {filtered.map(contact => {
                const sourceLabel = formatLeadSource(contact, facebookGroups)
                return (
                  <div key={contact.id} className="flex items-center gap-3 px-4 py-3.5">
                    <div className="w-9 h-9 rounded-full bg-[var(--accent-light)] text-[var(--accent-text)] text-xs font-semibold flex items-center justify-center shrink-0">
                      {contact.name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join('')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-[var(--ink)] text-sm truncate">{contact.name}</p>
                        {contact.status && (
                          <span className={['inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium shrink-0',
                            contact.status === 'student' ? 'bg-[var(--green-l)] text-[var(--green)]'
                              : contact.status === 'active' ? 'bg-[var(--accent-light)] text-[var(--accent-text)]'
                              : 'bg-white/8 text-[var(--ink-2)]',
                          ].join(' ')}>{contact.status}</span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--ink-3)] mt-0.5 truncate">{contact.email ?? '—'}</p>
                      {sourceLabel && <p className="text-xs text-[var(--ink-3)] mt-0.5 truncate">{sourceLabel}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setEditContact(contact)} className="p-2 rounded-lg text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors" title="Edit">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                          <path d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button onClick={() => handleDelete(contact.id)} disabled={deletingId === contact.id || isPending} className="p-2 rounded-lg text-[var(--ink-3)] hover:text-[var(--red)] transition-colors disabled:opacity-50" title="Delete">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                          <path d="M2 4h10M5 4V2h4v2M5.5 6.5v4M8.5 6.5v4M3 4l.7 7.3A1 1 0 004.7 12h4.6a1 1 0 001-.7L11 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--ink)]/8">
                    <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Name</th>
                    <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Email</th>
                    <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Phone</th>
                    <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Status</th>
                    <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide hidden lg:table-cell">Source</th>
                    <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide hidden lg:table-cell">Added</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ink)]/6">
                  {filtered.map(contact => {
                    const sourceLabel = formatLeadSource(contact, facebookGroups)
                    return (
                      <tr key={contact.id} className="hover:bg-[var(--canvas)] transition-colors group">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-[var(--accent-light)] text-[var(--accent-text)] text-xs font-semibold flex items-center justify-center shrink-0">
                              {contact.name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join('')}
                            </div>
                            <span className="font-medium text-[var(--ink)] truncate max-w-[140px]">{contact.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-[var(--ink-2)]">{contact.email ?? '—'}</td>
                        <td className="px-5 py-3 text-[var(--ink-2)]">{contact.phone ?? '—'}</td>
                        <td className="px-5 py-3">
                          {contact.status && (
                            <span className={['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                              contact.status === 'student' ? 'bg-[var(--green-l)] text-[var(--green)]'
                                : contact.status === 'active' ? 'bg-[var(--accent-light)] text-[var(--accent-text)]'
                                : 'bg-white/8 text-[var(--ink-2)]',
                            ].join(' ')}>{contact.status}</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-[var(--ink-3)] text-xs hidden lg:table-cell max-w-[180px]">
                          {sourceLabel ? <span className="truncate block" title={sourceLabel}>{sourceLabel}</span> : '—'}
                        </td>
                        <td className="px-5 py-3 text-[var(--ink-3)] text-xs hidden lg:table-cell">{formatDate(contact.created_at)}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setEditContact(contact)} className="p-1.5 rounded-lg text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-white/8 transition-colors" title="Edit">
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                                <path d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                              </svg>
                            </button>
                            <button onClick={() => handleDelete(contact.id)} disabled={deletingId === contact.id || isPending} className="p-1.5 rounded-lg text-[var(--ink-3)] hover:text-[var(--red)] hover:bg-[var(--red-l)] transition-colors disabled:opacity-50" title="Delete">
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                                <path d="M2 4h10M5 4V2h4v2M5.5 6.5v4M8.5 6.5v4M3 4l.7 7.3A1 1 0 004.7 12h4.6a1 1 0 001-.7L11 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Organic Outreach Tab ──────────────────────────────────────────────────────

const TYPE_BADGE: Record<OutreachType, { bg: string; color: string }> = {
  'organization':        { bg: 'rgba(4,173,239,0.12)',    color: '#0284a8' },
  'independent_teacher': { bg: 'rgba(109,40,217,0.1)',    color: '#6d28d9' },
  'referral_partner':    { bg: 'rgba(22,163,74,0.12)',    color: '#15803d' },
  'other':               { bg: 'rgba(0,0,0,0.06)',        color: '#6b7280' },
}

const TYPE_LABEL: Record<OutreachType, string> = {
  'organization':        'Organization',
  'independent_teacher': 'Independent Teacher',
  'referral_partner':    'Referral Partner',
  'other':               'Other',
}

function OutreachTab({ entries: initial }: { entries: OrganicOutreach[] }) {
  const [showForm, setShowForm] = useState(false)
  const [editEntry, setEditEntry] = useState<OrganicOutreach | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleDelete(id: string) {
    if (!confirm('Delete this entry? This cannot be undone.')) return
    setDeletingId(id)
    startTransition(async () => {
      await deleteOrganicOutreach(id)
      setDeletingId(null)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--ink-3)]">{initial.length} total · sorted by last contacted</p>
        <button
          onClick={() => { setEditEntry(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--ink)] text-sm font-medium hover:bg-[var(--accent-text)] hover:text-[var(--canvas)] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Add entry
        </button>
      </div>

      {(showForm || editEntry) && (
        <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:bg-black/50 sm:px-4">
          <div className="flex-1 overflow-y-auto bg-[var(--surface)] sm:flex-none sm:rounded-2xl sm:border sm:border-[var(--ink)]/8 sm:max-h-[90vh] sm:w-full sm:max-w-md p-6 flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-medium text-[var(--ink)]">
                {editEntry ? 'Edit entry' : 'New outreach entry'}
              </h3>
              <button
                onClick={() => { setShowForm(false); setEditEntry(null) }}
                className="p-2 text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <OutreachForm
              entry={editEntry ?? undefined}
              onClose={() => { setShowForm(false); setEditEntry(null) }}
            />
          </div>
        </div>
      )}

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
        {initial.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-sm text-[var(--ink-3)]">No outreach entries yet.</p>
            <p className="text-xs text-[var(--ink-3)]">Track local organizations, independent teachers, and referral partners.</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-[var(--ink)]/6">
              {initial.map(entry => {
                const days = daysAgo(entry.last_contacted_date)
                const typeBadge = TYPE_BADGE[entry.type as OutreachType] ?? TYPE_BADGE['other']
                return (
                  <div key={entry.id} className="px-4 py-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-[var(--ink)] text-sm">{entry.name}</p>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium shrink-0" style={{ background: typeBadge.bg, color: typeBadge.color }}>{TYPE_LABEL[entry.type] ?? entry.type}</span>
                          {entry.status === 'inactive' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-white/8 text-[var(--ink-3)] shrink-0">Inactive</span>
                          )}
                        </div>
                        {entry.contact_info && <p className="text-xs text-[var(--ink-3)] mt-0.5">{entry.contact_info}</p>}
                        {days !== null
                          ? <p className="text-xs text-[var(--ink-3)] mt-0.5">Last contacted {days === 0 ? 'today' : `${days}d ago`}</p>
                          : <p className="text-xs text-[var(--ink-3)] mt-0.5">Never contacted</p>
                        }
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => setEditEntry(entry)} className="p-2 rounded-lg text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors" title="Edit">
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                            <path d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button onClick={() => handleDelete(entry.id)} disabled={deletingId === entry.id || isPending} className="p-2 rounded-lg text-[var(--ink-3)] hover:text-[var(--red)] transition-colors disabled:opacity-50" title="Delete">
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                            <path d="M2 4h10M5 4V2h4v2M5.5 6.5v4M8.5 6.5v4M3 4l.7 7.3A1 1 0 004.7 12h4.6a1 1 0 001-.7L11 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {entry.notes && <p className="text-xs text-[var(--ink-3)] line-clamp-2">{entry.notes}</p>}
                  </div>
                )
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--ink)]/8">
                    <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Name</th>
                    <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Type</th>
                    <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Contact Info</th>
                    <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide whitespace-nowrap">Last Contacted</th>
                    <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide hidden lg:table-cell">Notes</th>
                    <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ink)]/6">
                  {initial.map(entry => {
                    const days = daysAgo(entry.last_contacted_date)
                    const typeBadge = TYPE_BADGE[entry.type as OutreachType] ?? TYPE_BADGE['other']
                    return (
                      <tr key={entry.id} className="hover:bg-[var(--canvas)] transition-colors group">
                        <td className="px-5 py-3 font-medium text-[var(--ink)]">{entry.name}</td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap" style={{ background: typeBadge.bg, color: typeBadge.color }}>{entry.type}</span>
                        </td>
                        <td className="px-5 py-3 text-[var(--ink-2)] max-w-[180px]">
                          <span className="truncate block" title={entry.contact_info ?? ''}>{entry.contact_info || '—'}</span>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          {days !== null ? (
                            <span className="text-[var(--ink-2)] text-xs">
                              {days === 0 ? 'Today' : `${days}d ago`}
                              <span className="block text-[var(--ink-3)] text-xs">{formatDate(entry.last_contacted_date)}</span>
                            </span>
                          ) : (
                            <span className="text-[var(--ink-3)] text-xs">Never</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-[var(--ink-3)] text-xs hidden lg:table-cell max-w-[200px]">
                          <span className="line-clamp-2">{entry.notes || '—'}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                            entry.status === 'active' ? 'bg-[var(--green-l)] text-[var(--green)]' : 'bg-white/8 text-[var(--ink-3)]',
                          ].join(' ')}>{entry.status === 'active' ? 'Active' : 'Inactive'}</span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setEditEntry(entry)} className="p-1.5 rounded-lg text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-white/8 transition-colors" title="Edit">
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                                <path d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                              </svg>
                            </button>
                            <button onClick={() => handleDelete(entry.id)} disabled={deletingId === entry.id || isPending} className="p-1.5 rounded-lg text-[var(--ink-3)] hover:text-[var(--red)] hover:bg-[var(--red-l)] transition-colors disabled:opacity-50" title="Delete">
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                                <path d="M2 4h10M5 4V2h4v2M5.5 6.5v4M8.5 6.5v4M3 4l.7 7.3A1 1 0 004.7 12h4.6a1 1 0 001-.7L11 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Root component ─────────────────────────────────────────────────────────────

type LeadsTab = 'leads' | 'outreach'

export default function LeadsClient({
  contacts: initial,
  facebookGroups,
  outreachEntries,
}: LeadsClientProps) {
  const [activeTab, setActiveTab] = useState<LeadsTab>('leads')

  const tabs: { key: LeadsTab; label: string; count: number }[] = [
    { key: 'leads',    label: 'Leads',            count: initial.length },
    { key: 'outreach', label: 'Organic Outreach',  count: outreachEntries.length },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
          Leads
        </h2>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-[var(--ink)]/8">
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={[
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
              activeTab === key
                ? 'text-[var(--ink)] border-[var(--accent-text)]'
                : 'text-[var(--ink-3)] border-transparent hover:text-[var(--ink-2)]',
            ].join(' ')}
          >
            {label} <span className="ml-1 text-xs opacity-60">({count})</span>
          </button>
        ))}
      </div>

      {activeTab === 'leads' && (
        <LeadsTab contacts={initial} facebookGroups={facebookGroups} />
      )}

      {activeTab === 'outreach' && (
        <OutreachTab entries={outreachEntries} />
      )}
    </div>
  )
}
