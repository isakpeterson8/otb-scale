'use client'

import { useState, useTransition } from 'react'
import { formatDate } from '@/lib/utils'
import { createContact, updateContact, deleteContact } from '@/app/actions/contacts'
import type { Contact } from '@/types/database'

interface ContactsClientProps {
  contacts: Contact[]
}

const STATUS_OPTIONS = ['prospect', 'lead', 'active', 'inactive', 'student']

function ContactForm({
  contact,
  onClose,
}: {
  contact?: Contact
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

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
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s} className="bg-[var(--surface)]">{s}</option>
          ))}
        </select>
      </div>
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
          {isPending ? 'Saving…' : contact ? 'Save changes' : 'Add contact'}
        </button>
      </div>
    </form>
  )
}

export default function ContactsClient({ contacts: initial }: ContactsClientProps) {
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editContact, setEditContact] = useState<Contact | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = initial.filter((c) => {
    const q = search.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q)
    )
  })

  function handleDelete(id: string) {
    if (!confirm('Delete this contact? This cannot be undone.')) return
    setDeletingId(id)
    startTransition(async () => {
      await deleteContact(id)
      setDeletingId(null)
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
            Contacts
          </h2>
          <p className="text-sm text-[var(--ink-3)] mt-0.5">{initial.length} total</p>
        </div>
        <button
          onClick={() => { setEditContact(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--ink)] text-sm font-medium hover:bg-[var(--accent-text)] hover:text-[var(--canvas)] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Add contact
        </button>
      </div>

      <div className="relative">
        <svg
          width="16" height="16" viewBox="0 0 16 16" fill="none"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-3)]" aria-hidden
        >
          <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          placeholder="Search contacts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[var(--ink)]/15 bg-[var(--surface)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
        />
      </div>

      {(showForm || editContact) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md bg-[var(--surface)] rounded-2xl border border-[var(--ink)]/8 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-medium text-[var(--ink)]">
                {editContact ? 'Edit contact' : 'New contact'}
              </h3>
              <button
                onClick={() => { setShowForm(false); setEditContact(null) }}
                className="text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <ContactForm
              contact={editContact ?? undefined}
              onClose={() => { setShowForm(false); setEditContact(null) }}
            />
          </div>
        </div>
      )}

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-sm text-[var(--ink-3)]">
              {search ? 'No contacts match your search.' : 'No contacts yet.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ink)]/8">
                <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Name</th>
                <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Email</th>
                <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide hidden md:table-cell">Phone</th>
                <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide hidden sm:table-cell">Status</th>
                <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide hidden lg:table-cell">Added</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ink)]/6">
              {filtered.map((contact) => (
                <tr key={contact.id} className="hover:bg-[var(--canvas)] transition-colors group">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[var(--accent-light)] text-[var(--accent-text)] text-xs font-semibold flex items-center justify-center shrink-0">
                        {contact.name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('')}
                      </div>
                      <span className="font-medium text-[var(--ink)] truncate max-w-[140px]">{contact.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-[var(--ink-2)]">{contact.email ?? '—'}</td>
                  <td className="px-5 py-3 text-[var(--ink-2)] hidden md:table-cell">{contact.phone ?? '—'}</td>
                  <td className="px-5 py-3 hidden sm:table-cell">
                    {contact.status && (
                      <span className={[
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                        contact.status === 'student' ? 'bg-[var(--green-l)] text-[var(--green)]'
                          : contact.status === 'active' ? 'bg-[var(--accent-light)] text-[var(--accent-text)]'
                          : 'bg-white/8 text-[var(--ink-2)]',
                      ].join(' ')}>
                        {contact.status}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[var(--ink-3)] text-xs hidden lg:table-cell">
                    {formatDate(contact.created_at)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditContact(contact)}
                        className="p-1.5 rounded-lg text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-white/8 transition-colors"
                        title="Edit"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                          <path d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(contact.id)}
                        disabled={deletingId === contact.id || isPending}
                        className="p-1.5 rounded-lg text-[var(--ink-3)] hover:text-[var(--red)] hover:bg-[var(--red-l)] transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                          <path d="M2 4h10M5 4V2h4v2M5.5 6.5v4M8.5 6.5v4M3 4l.7 7.3A1 1 0 004.7 12h4.6a1 1 0 001-.7L11 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
