'use client'

import { useState, useTransition } from 'react'
import { formatDate } from '@/lib/utils'
import { createPipelineEvent, updatePipelineEvent, deletePipelineEvent } from '@/app/actions/pipeline'
import type { PipelineEvent, Contact } from '@/types/database'
import { PIPELINE_STAGES } from '@/types/database'

type EventWithContact = PipelineEvent & {
  contacts: Pick<Contact, 'id' | 'name' | 'email'> | null
}

interface PipelineClientProps {
  events: EventWithContact[]
  contacts: Pick<Contact, 'id' | 'name' | 'email'>[]
}

function EventForm({
  event,
  contacts,
  onClose,
}: {
  event?: EventWithContact
  contacts: Pick<Contact, 'id' | 'name' | 'email'>[]
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = event
        ? await updatePipelineEvent(event.id, formData)
        : await createPipelineEvent(formData)
      if (result.error) {
        setError(result.error)
      } else {
        onClose()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!event && (
        <div>
          <label className="block text-xs text-[var(--ink-3)] mb-1">Contact *</label>
          <select
            name="contact_id"
            required
            className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
          >
            <option value="" className="bg-[var(--surface)]">— select contact —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id} className="bg-[var(--surface)]">{c.name}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="block text-xs text-[var(--ink-3)] mb-1">Stage *</label>
        <select
          name="stage"
          required
          defaultValue={event?.stage ?? 'lead'}
          className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
        >
          {PIPELINE_STAGES.map((s) => (
            <option key={s.value} value={s.value} className="bg-[var(--surface)]">{s.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-[var(--ink-3)] mb-1">Date</label>
        <input
          name="event_date"
          type="date"
          defaultValue={event?.event_date ? event.event_date.slice(0, 10) : new Date().toISOString().slice(0, 10)}
          className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
        />
      </div>
      <div>
        <label className="block text-xs text-[var(--ink-3)] mb-1">Notes</label>
        <textarea
          name="notes"
          defaultValue={event?.notes ?? ''}
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
          {isPending ? 'Saving…' : event ? 'Save changes' : 'Add event'}
        </button>
      </div>
    </form>
  )
}

export default function PipelineClient({ events, contacts }: PipelineClientProps) {
  const [showForm, setShowForm] = useState(false)
  const [editEvent, setEditEvent] = useState<EventWithContact | null>(null)
  const [filterStage, setFilterStage] = useState<string>('all')
  const [isPending, startTransition] = useTransition()

  const filtered = filterStage === 'all'
    ? events
    : events.filter((e) => e.stage === filterStage)

  const grouped = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    events: filtered.filter((e) => e.stage === stage.value),
  })).filter((g) => filterStage === 'all' || g.value === filterStage)

  function handleDelete(id: string) {
    if (!confirm('Delete this pipeline event?')) return
    startTransition(async () => {
      await deletePipelineEvent(id)
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
            Pipeline
          </h2>
          <p className="text-sm text-[var(--ink-3)] mt-0.5">{events.length} events</p>
        </div>
        <button
          onClick={() => { setEditEvent(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--ink)] text-sm font-medium hover:bg-[var(--accent-text)] hover:text-[var(--canvas)] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Add event
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilterStage('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterStage === 'all' ? 'bg-white/15 text-[var(--ink)]' : 'text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-white/8'}`}
        >
          All ({events.length})
        </button>
        {PIPELINE_STAGES.map((stage) => {
          const count = events.filter((e) => e.stage === stage.value).length
          return (
            <button
              key={stage.value}
              onClick={() => setFilterStage(stage.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterStage === stage.value ? 'bg-white/15 text-[var(--ink)]' : 'text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-white/8'}`}
            >
              {stage.label} ({count})
            </button>
          )
        })}
      </div>

      {(showForm || editEvent) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md bg-[var(--surface)] rounded-2xl border border-[var(--ink)]/8 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-medium text-[var(--ink)]">
                {editEvent ? 'Edit event' : 'New pipeline event'}
              </h3>
              <button
                onClick={() => { setShowForm(false); setEditEvent(null) }}
                className="text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <EventForm
              event={editEvent ?? undefined}
              contacts={contacts}
              onClose={() => { setShowForm(false); setEditEvent(null) }}
            />
          </div>
        </div>
      )}

      <div className="space-y-4">
        {grouped.map((group) => {
          if (group.events.length === 0 && filterStage !== 'all') return null
          return (
            <div key={group.value} className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[var(--ink)]/8">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: group.color }} />
                <h3 className="text-sm font-medium text-[var(--ink)]">{group.label}</h3>
                <span className="ml-auto text-xs text-[var(--ink-3)]">{group.events.length}</span>
              </div>

              {group.events.length === 0 ? (
                <p className="text-xs text-[var(--ink-3)] px-5 py-4">No events in this stage.</p>
              ) : (
                <div className="divide-y divide-[var(--ink)]/6">
                  {group.events.map((event) => {
                    const contact = event.contacts
                    return (
                      <div key={event.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-[var(--canvas)] transition-colors group">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-[var(--ink)] truncate">
                              {contact?.name ?? 'Unknown contact'}
                            </p>
                            {contact?.email && (
                              <p className="text-xs text-[var(--ink-3)] truncate hidden sm:block">{contact.email}</p>
                            )}
                          </div>
                          {event.notes && (
                            <p className="text-xs text-[var(--ink-2)] mt-0.5 line-clamp-1">{event.notes}</p>
                          )}
                          <p className="text-xs text-[var(--ink-3)] mt-0.5">{formatDate(event.event_date)}</p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            onClick={() => setEditEvent(event)}
                            className="p-1.5 rounded-lg text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-white/8 transition-colors"
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                              <path d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(event.id)}
                            disabled={isPending}
                            className="p-1.5 rounded-lg text-[var(--ink-3)] hover:text-[var(--red)] hover:bg-[var(--red-l)] transition-colors"
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                              <path d="M2 4h10M5 4V2h4v2M5.5 6.5v4M8.5 6.5v4M3 4l.7 7.3A1 1 0 004.7 12h4.6a1 1 0 001-.7L11 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
