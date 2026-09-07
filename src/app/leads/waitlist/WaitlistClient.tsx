'use client'

import { useState, useTransition } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { formatDate } from '@/lib/utils'
import { updateWaitlistOrder } from '@/app/actions/contacts'
import type { Contact } from '@/types/database'
import LeadsTabBar, { type LeadsTabCounts } from '../LeadsTabBar'

type WaitlistLead = Pick<Contact, 'id' | 'name' | 'email' | 'phone' | 'status' | 'waitlist_rank' | 'created_at'>

function Row({ lead, position }: { lead: WaitlistLead; position: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={[
        'flex items-center gap-3 px-4 py-3.5 bg-[var(--surface)]',
        isDragging ? 'relative z-10 rounded-xl shadow-lg opacity-95' : '',
      ].join(' ')}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${lead.name}`}
        className="shrink-0 p-1.5 -ml-1.5 rounded-lg text-[var(--ink-3)] hover:text-[var(--ink)] cursor-grab active:cursor-grabbing touch-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M2 4h10M2 7h10M2 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      <span className="w-6 shrink-0 text-xs text-[var(--ink-3)] tabular-nums">{position}</span>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-[var(--ink)] text-sm truncate">{lead.name}</p>
        <p className="text-xs text-[var(--ink-3)] mt-0.5 truncate">{lead.email ?? lead.phone ?? '—'}</p>
      </div>
      <span className="shrink-0 text-xs text-[var(--ink-3)] hidden sm:block">
        Added {formatDate(lead.created_at)}
      </span>
    </div>
  )
}

export default function WaitlistClient({
  leads: initial,
  counts,
}: {
  leads: WaitlistLead[]
  counts: LeadsTabCounts
}) {
  const [leads, setLeads] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const from = leads.findIndex(l => l.id === active.id)
    const to = leads.findIndex(l => l.id === over.id)
    if (from === -1 || to === -1) return

    const previous = leads
    const next = arrayMove(leads, from, to)

    setError(null)
    setLeads(next) // optimistic

    startTransition(async () => {
      const result = await updateWaitlistOrder(next.map(l => l.id))
      if (result.error) {
        setLeads(previous) // revert
        setError(result.error)
      }
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
          Leads
        </h2>
      </div>

      <LeadsTabBar active="waitlist" counts={counts} />

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--ink-3)]">
          {leads.length} on the waitlist · drag to rank
        </p>
        {isPending && <p className="text-xs text-[var(--ink-3)]">Saving…</p>}
      </div>

      {error && (
        <p className="text-xs text-[var(--red)] bg-[var(--red-l)] px-3 py-2 rounded-lg">{error}</p>
      )}

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
        {leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-sm text-[var(--ink-3)]">No leads on the waitlist</p>
            <p className="text-xs text-[var(--ink-3)]">
              Set a lead&apos;s status to Waitlist and it will appear here.
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
              <div className="divide-y divide-[var(--ink)]/6">
                {leads.map((lead, i) => (
                  <Row key={lead.id} lead={lead} position={i + 1} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}
