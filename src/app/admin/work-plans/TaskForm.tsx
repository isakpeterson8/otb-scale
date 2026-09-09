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
import { TIMEFRAME_ORDER } from '@/lib/work-plans'
import { MILESTONE_TAGS, type MilestoneTag, type WorkPlanLink } from '@/types/database'

export const INPUT =
  'w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]'

export function emptyInput(group: string): TaskInput {
  return {
    title: '', description: null, internal_note: null,
    timeframe_group: group, week_number: null, is_recurring: false,
    starts_after_week: null, milestone_tag: 'general', links: [],
  }
}

export function toInput(task: {
  title: string; description: string | null; internal_note: string | null
  timeframe_group: string; week_number: number | null; is_recurring: boolean
  starts_after_week: number | null; milestone_tag: MilestoneTag; links: WorkPlanLink[] | null
}): TaskInput {
  return {
    title: task.title, description: task.description, internal_note: task.internal_note,
    timeframe_group: task.timeframe_group, week_number: task.week_number,
    is_recurring: task.is_recurring, starts_after_week: task.starts_after_week,
    milestone_tag: task.milestone_tag, links: task.links ?? [],
  }
}

// ── Task form ────────────────────────────────────────────────────────────────

export default function TaskForm({
  initial, onSave, onDelete, onClose, isPending,
}: {
  initial: TaskInput
  onSave: (input: TaskInput) => void
  onDelete?: () => void
  onClose: () => void
  isPending: boolean
}) {
  const [form, setForm] = useState<TaskInput>(initial)
  const set = <K extends keyof TaskInput>(k: K, v: TaskInput[K]) => setForm(f => ({ ...f, [k]: v }))

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
            <label className="block text-xs text-[var(--ink-3)] mb-1">Milestone</label>
            <select
              value={form.milestone_tag}
              onChange={e => set('milestone_tag', e.target.value as MilestoneTag)}
              className={INPUT}
            >
              {MILESTONE_TAGS.map(t => (
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
            <label className="block text-xs text-[var(--ink-3)]">Links</label>
            <button
              type="button"
              onClick={() => set('links', [...form.links, { url: '', label: null, internal: false }])}
              className="text-xs text-[var(--accent-text)] hover:underline"
            >
              + Add link
            </button>
          </div>
          {form.links.map((link, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
              <div className="space-y-1">
                <input
                  value={link.url}
                  onChange={e => setLink(i, { url: e.target.value })}
                  placeholder="https://…"
                  className={INPUT}
                />
                <input
                  value={link.label ?? ''}
                  onChange={e => setLink(i, { label: e.target.value || null })}
                  placeholder="Label (optional)"
                  className={INPUT}
                />
              </div>
              <label className="flex items-center gap-1 text-xs text-[var(--ink-3)]">
                <input type="checkbox" checked={link.internal} onChange={e => setLink(i, { internal: e.target.checked })} className="rounded" />
                internal
              </label>
              <button
                type="button"
                onClick={() => set('links', form.links.filter((_, idx) => idx !== i))}
                className="text-xs text-[var(--ink-3)] hover:text-[var(--red)]"
              >
                remove
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
