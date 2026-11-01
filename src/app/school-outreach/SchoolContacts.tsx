'use client'

import { useState, useTransition } from 'react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import {
  addSchoolContact,
  deleteSchoolContact,
  makePrimarySchoolContact,
  updateSchoolContact,
} from '@/app/actions/school-contacts'
import { CONTACT_NAME_PLACEHOLDER, type SchoolContact, type SchoolWithContacts } from '@/types/database'

/** Suggestions only — title is free text. */
const TITLE_SUGGESTIONS = ['Band Director', 'Orchestra Teacher', 'Choir Director', 'Music Teacher', 'Principal', 'Front Office']

const INPUT_CLASS =
  'w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]'

export function primaryContact(school: SchoolWithContacts): SchoolContact | null {
  return school.school_contacts.find(c => c.is_primary) ?? school.school_contacts[0] ?? null
}

/** A contact's name for display; the migration placeholder reads as a to-do. */
export function contactName(c: SchoolContact): string {
  return c.name === CONTACT_NAME_PLACEHOLDER ? 'Name needed' : c.name
}

/** Primary contact line for a school row/card, with a "+N more" badge. */
export function PrimaryContactSummary({ school, layout }: { school: SchoolWithContacts; layout: 'card' | 'cell' }) {
  const primary = primaryContact(school)
  const others = school.school_contacts.length - (primary ? 1 : 0)
  const more = others > 0 && (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[var(--accent-light)] text-[var(--accent-text)] shrink-0"
      title={school.school_contacts.filter(c => c.id !== primary?.id).map(contactName).join(', ')}
    >
      +{others} more
    </span>
  )

  if (!primary) return <p className="text-xs text-[var(--ink-3)]">No contacts yet</p>

  const name = (
    <span className={primary.name === CONTACT_NAME_PLACEHOLDER ? 'italic text-[var(--amber)]' : ''}>
      {contactName(primary)}
    </span>
  )

  if (layout === 'card') {
    return (
      <>
        <p className="text-xs text-[var(--ink-3)] mt-0.5 truncate flex items-center gap-1.5">
          <span className="truncate">{name}{primary.title ? ` · ${primary.title}` : ''}{primary.email ? ` · ${primary.email}` : ''}</span>
          {more}
        </p>
        {primary.phone && <p className="text-xs text-[var(--ink-3)]">{primary.phone}</p>}
      </>
    )
  }

  return (
    <div className="space-y-0.5">
      <p className="text-[var(--ink-2)] whitespace-nowrap flex items-center gap-1.5">{name}{more}</p>
      <p className="text-xs text-[var(--ink-3)]">{primary.title ? `${primary.title}${primary.email ? ' · ' : ''}` : ''}{primary.email ?? ''}</p>
    </div>
  )
}

function ContactForm({
  contact,
  onSubmit,
  onCancel,
  isPending,
}: {
  contact?: SchoolContact
  onSubmit: (fd: FormData) => void
  onCancel: () => void
  isPending: boolean
}) {
  return (
    <form
      onSubmit={e => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)) }}
      className="space-y-2 p-3 rounded-lg border border-[var(--ink)]/10 bg-[var(--canvas)]"
    >
      <div className="grid grid-cols-2 gap-2">
        <input name="name" required defaultValue={contact && contact.name !== CONTACT_NAME_PLACEHOLDER ? contact.name : ''} placeholder="Name *" aria-label="Name" className={INPUT_CLASS} />
        <input name="title" list="school-contact-titles" defaultValue={contact?.title ?? ''} placeholder="Title" aria-label="Title" className={INPUT_CLASS} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input name="email" type="email" defaultValue={contact?.email ?? ''} placeholder="Email" aria-label="Email" className={INPUT_CLASS} />
        <input name="phone" type="tel" defaultValue={contact?.phone ?? ''} placeholder="Phone" aria-label="Phone" className={INPUT_CLASS} />
      </div>
      <textarea name="notes" rows={2} defaultValue={contact?.notes ?? ''} placeholder="Notes" aria-label="Notes" className={`${INPUT_CLASS} resize-none`} />
      <datalist id="school-contact-titles">
        {TITLE_SUGGESTIONS.map(t => <option key={t} value={t} />)}
      </datalist>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs text-[var(--ink-3)] hover:text-[var(--ink)]">Cancel</button>
        <button
          type="submit"
          disabled={isPending}
          className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--ink)] text-xs font-medium disabled:opacity-60"
        >
          {isPending ? 'Saving…' : contact ? 'Save contact' : 'Add contact'}
        </button>
      </div>
    </form>
  )
}

/** Contacts section of the school detail (edit) view: add, edit, delete, make primary. */
export function ContactsSection({ school }: { school: SchoolWithContacts }) {
  const [isPending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SchoolContact | null>(null)
  const [error, setError] = useState<string | null>(null)

  function run(action: () => Promise<{ error: string | null }>, onDone?: () => void) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) setError(result.error)
      else onDone?.()
    })
  }

  const contacts = school.school_contacts

  return (
    <section className="mt-6 pt-5 border-t border-[var(--ink)]/8 space-y-3" aria-labelledby="school-contacts-heading">
      <div className="flex items-center justify-between">
        <h4 id="school-contacts-heading" className="text-sm font-medium text-[var(--ink)]">
          Contacts <span className="text-[var(--ink-3)] font-normal">({contacts.length})</span>
        </h4>
        {!adding && (
          <button
            type="button"
            onClick={() => { setAdding(true); setEditingId(null) }}
            className="text-xs font-medium text-[var(--accent-text)] hover:underline"
          >
            + Add contact
          </button>
        )}
      </div>

      {contacts.length === 0 && !adding && (
        <p className="text-xs text-[var(--ink-3)]">No contacts yet. The first one you add becomes the primary contact.</p>
      )}

      <ul className="space-y-2">
        {contacts.map(c => (
          <li key={c.id}>
            {editingId === c.id ? (
              <ContactForm
                contact={c}
                isPending={isPending}
                onCancel={() => setEditingId(null)}
                onSubmit={fd => run(() => updateSchoolContact(c.id, fd), () => setEditingId(null))}
              />
            ) : (
              <div className="flex items-start justify-between gap-2 px-3 py-2 rounded-lg border border-[var(--ink)]/8">
                <div className="min-w-0">
                  <p className="text-sm text-[var(--ink)] flex items-center gap-2 flex-wrap">
                    <span className={c.name === CONTACT_NAME_PLACEHOLDER ? 'italic text-[var(--amber)]' : ''}>{contactName(c)}</span>
                    {c.is_primary && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[var(--accent-light)] text-[var(--accent-text)]">Primary</span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--ink-3)] truncate">
                    {[c.title, c.email, c.phone].filter(Boolean).join(' · ') || 'No details'}
                  </p>
                  {c.notes && <p className="text-xs text-[var(--ink-3)] mt-0.5 line-clamp-2">{c.notes}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0 text-xs">
                  {!c.is_primary && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run(() => makePrimarySchoolContact(c.id))}
                      className="text-[var(--accent-text)] hover:underline disabled:opacity-50"
                    >
                      Make primary
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setEditingId(c.id); setAdding(false) }}
                    className="text-[var(--ink-3)] hover:text-[var(--ink)]"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(c)}
                    className="text-[var(--ink-3)] hover:text-[var(--red)]"
                    aria-label={`Delete ${contactName(c)}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {adding && (
        <ContactForm
          isPending={isPending}
          onCancel={() => setAdding(false)}
          onSubmit={fd => run(() => addSchoolContact(school.id, fd), () => setAdding(false))}
        />
      )}

      {error && <p className="text-xs text-[var(--red)] bg-[var(--red-l)] px-3 py-2 rounded-lg">{error}</p>}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this contact?"
          message={`${contactName(deleteTarget)} will be removed from ${school.school_name}.`}
          consequences={
            deleteTarget.is_primary && contacts.length > 1
              ? ['The next-oldest contact becomes the primary contact']
              : undefined
          }
          confirmLabel="Delete contact"
          isPending={isPending}
          onConfirm={() => run(() => deleteSchoolContact(deleteTarget.id), () => setDeleteTarget(null))}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </section>
  )
}

/** Checkbox list of the school's contacts for the Gmail composer. */
export function RecipientPicker({
  contacts,
  selected,
  onChange,
}: {
  contacts: SchoolContact[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  if (contacts.length === 0) {
    return <p className="text-xs text-[var(--amber)]">This school has no contacts. Add one in Edit school before sending.</p>
  }
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs text-[var(--ink-3)] uppercase tracking-wide font-medium mb-1">To</legend>
      {contacts.map(c => {
        const disabled = !c.email
        return (
          <label key={c.id} className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
            <input
              type="checkbox"
              disabled={disabled}
              checked={selected.includes(c.id)}
              onChange={e => onChange(e.target.checked ? [...selected, c.id] : selected.filter(id => id !== c.id))}
            />
            <span className="text-[var(--ink)]">{contactName(c)}</span>
            {c.is_primary && <span className="text-[10px] text-[var(--accent-text)]">Primary</span>}
            <span className="text-xs text-[var(--ink-3)] truncate">{c.email ?? 'no email'}</span>
          </label>
        )
      })}
    </fieldset>
  )
}
