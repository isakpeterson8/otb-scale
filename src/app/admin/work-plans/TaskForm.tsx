'use client'

/**
 * Task editor shared by the per-client plan editor and the template editor —
 * the two task shapes are identical apart from completion columns, so the form
 * is written once.
 *
 * ADMIN-ONLY, like both callers: it edits internal_note, which is team-only and
 * must never appear on a Phase 2 client surface.
 */

import { useState } from 'react'
import type { TaskInput } from '@/app/actions/work-plans'
import { linkLabel, TIMEFRAME_ORDER } from '@/lib/work-plans'
import { CATEGORY_TAGS, type CategoryTag, type ChecklistInput, type WorkPlanLink } from '@/types/database'

export const INPUT =
  'w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]'

export function emptyInput(group: string): TaskInput {
  return {
    title: '', description: null, internal_note: null,
    timeframe_group: group, week_number: null, is_recurring: false,
    starts_after_week: null, milestone_tag: 'general', links: [], items: [],
  }
}

export function toInput(task: {
  title: string; description: string | null; internal_note: string | null
  timeframe_group: string; week_number: number | null; is_recurring: boolean
  starts_after_week: number | null; milestone_tag: CategoryTag; links: WorkPlanLink[] | null
}, items: { id: string; title: string }[] = []): TaskInput {
  return {
    title: task.title, description: task.description, internal_note: task.internal_note,
    timeframe_group: task.timeframe_group, week_number: task.week_number,
    is_recurring: task.is_recurring, starts_after_week: task.starts_after_week,
    milestone_tag: task.milestone_tag, links: task.links ?? [],
    items: items.map(i => ({ id: i.id, title: i.title })),
  }
}

// ── Task form ────────────────────────────────────────────────────────────────

export default function TaskForm({
  initial, onSave, onDelete, onClose, isPending, clientNote, itemDoneById,
}: {
  initial: TaskInput
  onSave: (input: TaskInput) => void
  onDelete?: () => void
  onClose: () => void
  isPending: boolean
  /**
   * Read-only context from the client's side. Passed by the per-plan editor only
   * — a template has no client, so both are undefined there.
   */
  clientNote?: string | null
  itemDoneById?: Record<string, boolean>
}) {
  const [form, setForm] = useState<TaskInput>(initial)
  const set = <K extends keyof TaskInput>(k: K, v: TaskInput[K]) => setForm(f => ({ ...f, [k]: v }))

  const unlabelledLinks = form.links.filter(l => !(l.label ?? '').trim() && l.url.trim() !== '').length

  function setItem(i: number, patch: Partial<ChecklistInput>) {
    set('items', form.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }

  /** Reorder within the form; sort_order is written from array position on save. */
  function moveItem(i: number, delta: number) {
    const next = [...form.items]
    const j = i + delta
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    set('items', next)
  }

  function setLink(i: number, patch: Partial<WorkPlanLink>) {
    set('links', form.links.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:bg-black/50 sm:px-4">
      <div className="flex-1 overflow-y-auto bg-[var(--surface)] p-6 sm:flex-none sm:rounded-2xl sm:border sm:border-[var(--ink)]/8 sm:max-h-[90vh] sm:overflow-y-auto sm:w-full sm:max-w-lg space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium text-[var(--ink)]">{onDelete ? 'Edit task' : 'New task'}</h3>
          <button onClick={onClose} className="p-2 text-[var(--ink-3)] hover:text-[var(--ink)]">✕</button>
        </div>

        <div>
          <label className="block text-xs text-[var(--ink-3)] mb-1">Title *</label>
          <input value={form.title} onChange={e => set('title', e.target.value)} className={INPUT} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--ink-3)] mb-1">Timeframe group</label>
            <select value={form.timeframe_group} onChange={e => set('timeframe_group', e.target.value)} className={INPUT}>
              {/* Keep an unrecognised group as an option, so editing a task that
                  lives outside the standard nine does not silently move it. */}
              {(TIMEFRAME_ORDER.includes(form.timeframe_group)
                ? TIMEFRAME_ORDER
                : [form.timeframe_group, ...TIMEFRAME_ORDER]
              ).map(g => (
                <option key={g} value={g} className="bg-[var(--surface)]">{g}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--ink-3)] mb-1">Category</label>
            <select
              value={form.milestone_tag}
              onChange={e => set('milestone_tag', e.target.value as CategoryTag)}
              className={INPUT}
            >
              {CATEGORY_TAGS.map(t => (
                <option key={t.value} value={t.value} className="bg-[var(--surface)]">{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs text-[var(--ink-3)] mb-1">Week number</label>
            <input
              type="number" min={1} max={6}
              value={form.week_number ?? ''}
              onChange={e => set('week_number', e.target.value === '' ? null : Number(e.target.value))}
              className={INPUT}
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--ink-3)] mb-1">Starts after week</label>
            <input
              type="number" min={1}
              value={form.starts_after_week ?? ''}
              onChange={e => set('starts_after_week', e.target.value === '' ? null : Number(e.target.value))}
              className={INPUT}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--ink-2)] pb-2">
            <input type="checkbox" checked={form.is_recurring} onChange={e => set('is_recurring', e.target.checked)} className="rounded" />
            Recurring
          </label>
        </div>

        <div>
          <label className="block text-xs text-[var(--ink-3)] mb-1">Description</label>
          <textarea
            rows={2}
            value={form.description ?? ''}
            onChange={e => set('description', e.target.value || null)}
            className={`${INPUT} resize-none`}
          />
        </div>

        <div>
          <label className="block text-xs text-[var(--ink-3)] mb-1">
            Internal note <span className="text-[var(--amber)]">· team only, never shown to clients</span>
          </label>
          <textarea
            rows={2}
            value={form.internal_note ?? ''}
            onChange={e => set('internal_note', e.target.value || null)}
            className={`${INPUT} resize-none`}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs text-[var(--ink-2)]">Links</label>
            <button
              type="button"
              onClick={() => set('links', [...form.links, { url: '', label: null, internal: false }])}
              className="text-xs text-[var(--accent-text)] hover:underline"
            >
              + Add link
            </button>
          </div>
          {unlabelledLinks > 0 && (
            <p className="text-xs px-2.5 py-2 rounded-lg" style={{ color: 'var(--amber)', background: 'var(--amber-l)' }}>
              {unlabelledLinks} link{unlabelledLinks === 1 ? '' : 's'} without a label will show the client
              a generic name instead of the document title.
            </p>
          )}
          {form.links.map((link, i) => {
            const missingLabel = !(link.label ?? '').trim()
            return (
              <div
                key={i}
                className="rounded-lg border p-2.5 space-y-2"
                style={{ borderColor: missingLabel ? 'var(--amber)' : 'var(--border)' }}
              >
                <div>
                  <label className="block text-[11px] text-[var(--ink-2)] mb-1">URL</label>
                  <input
                    value={link.url}
                    onChange={e => setLink(i, { url: e.target.value })}
                    placeholder="https://…"
                    className={INPUT}
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--ink-2)] mb-1">
                    Label <span className="text-[var(--ink-3)]">— what the client sees</span>
                  </label>
                  <input
                    value={link.label ?? ''}
                    onChange={e => setLink(i, { label: e.target.value || null })}
                    placeholder="Document title clients will see"
                    className={INPUT}
                    style={missingLabel ? { borderColor: 'var(--amber)' } : undefined}
                  />
                  {/* Show the exact fallback the client would get, so the cost of
                      leaving this blank is visible rather than theoretical. */}
                  {missingLabel && link.url.trim() !== '' && (
                    <p className="text-[11px] mt-1" style={{ color: 'var(--amber)' }}>
                      No label — clients will see “{linkLabel({ url: link.url, label: null })}”
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs text-[var(--ink-2)]">
                    <input
                      type="checkbox"
                      checked={link.internal}
                      onChange={e => setLink(i, { internal: e.target.checked })}
                      className="rounded"
                    />
                    Internal (opens in the app, not a new tab)
                  </label>
                  <button
                    type="button"
                    onClick={() => set('links', form.links.filter((_, idx) => idx !== i))}
                    className="text-xs text-[var(--ink-3)] hover:text-[var(--red)]"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* The client's own notes. Read-only here: it is their writing, and staff
            editing it silently would be surprising. Never internal_note. */}
        {clientNote && (
          <div className="px-3 py-2.5 rounded-lg" style={{ background: 'var(--accent-light)' }}>
            <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--accent-text)' }}>
              Client&apos;s notes
            </p>
            <p className="text-sm text-[var(--ink-2)] whitespace-pre-wrap mt-1">{clientNote}</p>
          </div>
        )}

        {/* Checklist. Ids travel with existing rows so saving DIFFS rather than
            replacing — members tick these, and a rebuild would wipe that. */}
        <div className="space-y-2 pt-2 border-t border-[var(--ink)]/8">
          <div className="flex items-center justify-between">
            <label className="block text-xs text-[var(--ink-3)]">Checklist (sub-steps)</label>
            <button
              type="button"
              onClick={() => set('items', [...form.items, { id: null, title: '' }])}
              className="text-xs text-[var(--accent-text)] hover:underline"
            >
              + Add item
            </button>
          </div>
          {form.items.length === 0 && (
            <p className="text-xs text-[var(--ink-3)]">No sub-steps. The client sees a plain task.</p>
          )}
          {itemDoneById && form.items.length > 0 && (
            <p className="text-xs text-[var(--ink-2)] tabular-nums">
              Client has ticked {form.items.filter(i => i.id && itemDoneById[i.id]).length} of {form.items.length}
            </p>
          )}
          {form.items.map((item, i) => (
            <div key={item.id ?? `new-${i}`} className="flex items-center gap-1.5">
              {/* What the client has ticked. Read-only: staff edit the wording,
                  the client owns the state. */}
              <span
                aria-hidden
                title={item.id && itemDoneById?.[item.id] ? 'Client has ticked this' : 'Not ticked by the client'}
                className="shrink-0 w-4 text-center text-xs"
                style={{ color: item.id && itemDoneById?.[item.id] ? 'var(--green)' : 'var(--ink-3)' }}
              >
                {item.id && itemDoneById?.[item.id] ? '✓' : '○'}
              </span>
              <input
                value={item.title}
                maxLength={300}
                onChange={e => setItem(i, { title: e.target.value })}
                placeholder={`Step ${i + 1}`}
                className={INPUT}
              />
              <button
                type="button"
                aria-label="Move up"
                disabled={i === 0}
                onClick={() => moveItem(i, -1)}
                className="px-1.5 py-1 text-xs text-[var(--ink-3)] hover:text-[var(--ink)] disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Move down"
                disabled={i === form.items.length - 1}
                onClick={() => moveItem(i, 1)}
                className="px-1.5 py-1 text-xs text-[var(--ink-3)] hover:text-[var(--ink)] disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                aria-label="Remove item"
                onClick={() => set('items', form.items.filter((_, idx) => idx !== i))}
                className="px-1.5 py-1 text-xs text-[var(--ink-3)] hover:text-[var(--red)]"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[var(--ink)]/8">
          {onDelete ? (
            <button onClick={onDelete} disabled={isPending} className="text-sm text-[var(--red)] hover:underline disabled:opacity-60">
              Delete task
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--ink-3)] hover:text-[var(--ink)]">Cancel</button>
            <button
              onClick={() => onSave(form)}
              disabled={isPending || form.title.trim() === ''}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--ink)] text-sm font-medium hover:bg-[var(--accent-text)] hover:text-[var(--canvas)] disabled:opacity-60 transition-colors"
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
