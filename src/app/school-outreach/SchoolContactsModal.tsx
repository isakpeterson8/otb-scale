'use client'

import { useState, useTransition } from 'react'
import { createSchoolContact, updateSchoolContact } from '@/app/actions/school-contacts'
import { NEEDS_NAME, type SchoolContact, type SchoolOutreach } from '@/types/database'

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]'

function ContactForm({
  schoolId,
  contact,
  onClose,
}: {
  schoolId: string
  contact?: SchoolContact
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = contact
        ? await updateSchoolContact(contact.id, fd)
        : await createSchoolContact(schoolId, fd)
      if (result.error) setError(result.error)
      else onClose()
    })
  }

  const textField = (label: string, name: keyof SchoolContact, type = 'text', placeholder = '', required = false) => (
    <div>
      <label className="block text-xs text-[var(--ink-3)] mb-1">{label}{required && ' *'}</label>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={contact ? (contact[name] as string | null) ?? '' : ''}
        placeholder={placeholder}
        className={inputClass}
      />
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-[var(--ink)]/8 bg-[var(--canvas)] p-4">
      {textField('Name', 'name', 'text', 'Ms. Johnson', true)}
      <div className="grid grid-cols-2 gap-3">
        {textField('Title', 'title', 'text', 'Band Director')}
        {/* Plain text for now — may become a dropdown later. */}
        {textField('Subject Area', 'subject_area', 'text', 'Instrumental Music')}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {textField('Email', 'email', 'email', 'jjohnson@school.edu')}
        {textField('Phone', 'phone', 'tel', '(555) 000-0000')}
      </div>
      <label className="flex items-center gap-2 text-sm text-[var(--ink-2)] cursor-pointer">
        <input
          name="is_primary"
          type="checkbox"
          defaultChecked={contact?.is_primary ?? false}
          className="h-4 w-4 rounded border-[var(--ink)]/25 accent-[var(--accent)]"
        />
        Primary contact
        <span className="text-xs text-[var(--ink-3)]">— replaces the current primary for this school</span>
      </label>

      {error && <p className="text-xs text-[var(--red)] bg-[var(--red-l)] px-3 py-2 rounded-lg">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
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

function ContactRow({
  contact,
  onEdit,
}: {
  contact: SchoolContact
  onEdit: () => void
}) {
  // The 16 rows migrated from schools that had an email or phone but no name.
  // Editing the name to anything else clears this marker on its own.
  const needsName = contact.name === NEEDS_NAME
  const meta = [contact.title, contact.subject_area].filter(Boolean).join(' · ')

  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={needsName ? 'text-sm italic text-[var(--ink-3)]' : 'text-sm font-medium text-[var(--ink)]'}>
            {contact.name}
          </p>
          {contact.is_primary && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--accent-l)] text-[var(--accent-text)]">
              Primary
            </span>
          )}
          {needsName && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--amber-l)] text-[var(--amber)]">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                <path d="M2 1v8M2 1.5h5l-1 1.5 1 1.5H2" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              Needs a name
            </span>
          )}
        </div>
        {meta && <p className="text-xs text-[var(--ink-2)]">{meta}</p>}
        {contact.email && <p className="text-xs text-[var(--ink-3)] truncate">{contact.email}</p>}
        {contact.phone && <p className="text-xs text-[var(--ink-3)]">{contact.phone}</p>}
      </div>

      {/* Delete lands in Phase B as a soft delete, once outreach events
          reference contacts.id and a hard delete would orphan them. */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: '#04ADEF' }}
          title="Edit"
          aria-label={`Edit ${contact.name}`}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default function SchoolContactsModal({
  school,
  contacts,
  onClose,
}: {
  school: SchoolOutreach
  contacts: SchoolContact[]
  onClose: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<SchoolContact | null>(null)

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:bg-black/50 sm:px-4">
      <div className="flex-1 overflow-y-auto bg-[var(--surface)] p-6 sm:flex-none sm:rounded-2xl sm:border sm:border-[var(--ink)]/8 sm:max-h-[90vh] sm:overflow-y-auto sm:max-w-lg w-full">
        <div className="flex items-start justify-between mb-5 gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-medium text-[var(--ink)] truncate">Contacts</h3>
            <p className="text-xs text-[var(--ink-3)] mt-0.5 truncate">{school.school_name}</p>
          </div>
          <button onClick={onClose} className="text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors shrink-0">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="bg-[var(--canvas)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
          {contacts.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[var(--ink-3)]">
              No contacts yet for this school.
            </p>
          ) : (
            <div className="divide-y divide-[var(--ink)]/6">
              {contacts.map((c) => (
                <ContactRow
                  key={c.id}
                  contact={c}
                  onEdit={() => { setEditing(c); setAdding(false) }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="mt-4">
          {adding || editing ? (
            <ContactForm
              schoolId={school.id}
              contact={editing ?? undefined}
              onClose={() => { setAdding(false); setEditing(null) }}
            />
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--ink)] text-sm font-medium hover:bg-[var(--accent-text)] hover:text-[var(--canvas)] transition-colors"
            >
              Add contact
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
