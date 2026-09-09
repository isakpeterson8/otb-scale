'use client'

/**
 * ADMIN-ONLY editor. internal_note is rendered here deliberately — this surface
 * is gated to staff by RLS plus the route's staff check. It must not be copied
 * onto any Phase 2 client-facing view: those notes are team-only caveats
 * (dated promos to re-verify, seasonal wording) that clients must never see.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  deleteWorkPlan, deleteWorkPlanTask, createWorkPlanTask, reorderWorkPlanTasks,
  setWorkPlanTaskDone, updateWorkPlan, updateWorkPlanTask, type TaskInput,
} from '@/app/actions/work-plans'
import { completionPercent, groupTasksByTimeframe, TIMEFRAME_ORDER } from '@/lib/work-plans'
import { MILESTONE_TAGS, type MilestoneTag, type WorkPlan, type WorkPlanLink, type WorkPlanStatus, type WorkPlanTask } from '@/types/database'

const INPUT =
  'w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]'

function emptyInput(group: string): TaskInput {
  return {
    title: '', description: null, internal_note: null,
    timeframe_group: group, week_number: null, is_recurring: false,
    starts_after_week: null, milestone_tag: 'general', links: [],
  }
}

function toInput(task: WorkPlanTask): TaskInput {
  return {
    title: task.title, description: task.description, internal_note: task.internal_note,
    timeframe_group: task.timeframe_group, week_number: task.week_number,
    is_recurring: task.is_recurring, starts_after_week: task.starts_after_week,
    milestone_tag: task.milestone_tag, links: task.links ?? [],
  }
}

// ── Task row ─────────────────────────────────────────────────────────────────

function TaskRow({
  task, onToggleDone, onEdit,
}: {
  task: WorkPlanTask
  onToggleDone: (task: WorkPlanTask) => void
  onEdit: (task: WorkPlanTask) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const tagLabel = MILESTONE_TAGS.find(t => t.value === task.milestone_tag)?.label ?? task.milestone_tag

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={['flex items-start gap-3 px-4 py-3 bg-[var(--surface)]', isDragging ? 'relative z-10 rounded-xl shadow-lg' : ''].join(' ')}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${task.title}`}
        className="mt-0.5 shrink-0 p-1.5 -ml-1.5 rounded-lg text-[var(--ink-3)] hover:text-[var(--ink)] cursor-grab active:cursor-grabbing touch-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M2 4h10M2 7h10M2 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>

      <input
        type="checkbox"
        checked={task.is_done}
        onChange={() => onToggleDone(task)}
        aria-label={`Mark ${task.title} ${task.is_done ? 'not done' : 'done'}`}
        className="mt-1 shrink-0 rounded"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={['text-sm', task.is_done ? 'text-[var(--ink-3)] line-through' : 'text-[var(--ink)]'].join(' ')}>
            {task.title}
          </p>
          {task.milestone_tag !== 'general' && (
            <span className="px-1.5 py-0.5 rounded-full text-xs bg-[var(--accent-light)] text-[var(--accent-text)]">{tagLabel}</span>
          )}
          {task.is_recurring && (
            <span className="px-1.5 py-0.5 rounded-full text-xs bg-white/8 text-[var(--ink-3)]">
              recurring{task.starts_after_week ? ` · after wk ${task.starts_after_week}` : ''}
            </span>
          )}
        </div>
        {task.description && <p className="text-xs text-[var(--ink-3)] mt-0.5">{task.description}</p>}
        {task.internal_note && (
          <p className="text-xs text-[var(--amber)] mt-1">🔒 Team only: {task.internal_note}</p>
        )}
        {(task.links ?? []).length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {task.links.map((l, i) => (
              <a
                key={`${l.url}-${i}`}
                href={l.url}
                target={l.internal ? undefined : '_blank'}
                rel={l.internal ? undefined : 'noreferrer'}
                className="text-xs text-[var(--accent-text)] hover:underline truncate max-w-[240px]"
              >
                {l.label ?? l.url}{l.internal ? '' : ' ↗'}
              </a>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => onEdit(task)}
        className="shrink-0 px-2 py-1 rounded-lg text-xs text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
      >
        Edit
      </button>
    </div>
  )
}

// ── Task form ────────────────────────────────────────────────────────────────

function TaskForm({
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
              {TIMEFRAME_ORDER.map(g => (
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

// ── Editor ───────────────────────────────────────────────────────────────────

export default function WorkPlanEditorClient({
  plan, studioName, tasks: initialTasks, loadError,
}: {
  plan: WorkPlan
  studioName: string
  tasks: WorkPlanTask[]
  loadError: string | null
}) {
  const router = useRouter()
  const [tasks, setTasks] = useState(initialTasks)
  const [editing, setEditing] = useState<WorkPlanTask | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const groups = groupTasksByTimeframe(tasks)
  const done = tasks.filter(t => t.is_done).length
  const pct = completionPercent(done, tasks.length)

  function run(action: () => Promise<{ error: string | null }>, revert?: () => void) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) {
        revert?.()
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  function handleToggleDone(task: WorkPlanTask) {
    const next = !task.is_done
    const previous = tasks
    setTasks(ts => ts.map(t => (t.id === task.id ? { ...t, is_done: next } : t)))
    run(() => setWorkPlanTaskDone(plan.id, task.id, next), () => setTasks(previous))
  }

  function handleDragEnd(group: string, event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const inGroup = tasks.filter(t => t.timeframe_group === group).sort((a, b) => a.sort_order - b.sort_order)
    const from = inGroup.findIndex(t => t.id === active.id)
    const to = inGroup.findIndex(t => t.id === over.id)
    if (from === -1 || to === -1) return

    const previous = tasks
    const reordered = arrayMove(inGroup, from, to)
    const orderById = new Map(reordered.map((t, i) => [t.id, i]))
    setTasks(ts => ts.map(t => (orderById.has(t.id) ? { ...t, sort_order: orderById.get(t.id)! } : t)))
    run(() => reorderWorkPlanTasks(plan.id, group, reordered.map(t => t.id)), () => setTasks(previous))
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <Link href="/admin/work-plans" className="text-xs text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
          ← Work Plans
        </Link>
        <div className="flex items-start justify-between gap-3 mt-1 flex-wrap">
          <div>
            <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>{studioName}</h2>
            <p className="text-sm text-[var(--ink-3)] mt-0.5">
              {plan.title} · {done}/{tasks.length} done ({pct}%)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={plan.status}
              onChange={e => run(() => updateWorkPlan(plan.id, { status: e.target.value as WorkPlanStatus }))}
              className="px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)]"
            >
              <option value="active" className="bg-[var(--surface)]">Active</option>
              <option value="archived" className="bg-[var(--surface)]">Archived</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]" title="Phase 2: flips client visibility on. Leave off for now.">
              <input
                type="checkbox"
                checked={plan.is_published}
                onChange={e => run(() => updateWorkPlan(plan.id, { is_published: e.target.checked }))}
                className="rounded"
              />
              Published to client
            </label>
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-white/8 overflow-hidden mt-3 max-w-md">
          <div className="h-full rounded-full bg-[var(--accent-text)]" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {(error || loadError) && (
        <p className="text-xs text-[var(--red)] bg-[var(--red-l)] px-3 py-2 rounded-lg">{error ?? loadError}</p>
      )}

      {/* Groups */}
      {groups.length === 0 ? (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 py-16 flex flex-col items-center gap-2">
          <p className="text-sm text-[var(--ink-3)]">No tasks on this plan yet.</p>
          <button onClick={() => setAdding(TIMEFRAME_ORDER[0])} className="text-xs text-[var(--accent-text)] hover:underline">
            Add the first task
          </button>
        </div>
      ) : (
        groups.map(({ group, tasks: groupTasks }) => (
          <section key={group} className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-[var(--ink-2)] uppercase tracking-wide">
                {group} <span className="text-[var(--ink-3)] normal-case">({groupTasks.filter(t => t.is_done).length}/{groupTasks.length})</span>
              </h3>
              <button onClick={() => setAdding(group)} className="text-xs text-[var(--accent-text)] hover:underline">+ Add task</button>
            </div>
            <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis]}
                onDragEnd={e => handleDragEnd(group, e)}
              >
                <SortableContext items={groupTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                  <div className="divide-y divide-[var(--ink)]/6">
                    {groupTasks.map(task => (
                      <TaskRow key={task.id} task={task} onToggleDone={handleToggleDone} onEdit={setEditing} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </section>
        ))
      )}

      <div className="pt-2 border-t border-[var(--ink)]/8">
        <button
          onClick={() => {
            if (confirm('Delete this whole work plan? This cannot be undone.')) {
              startTransition(async () => {
                const result = await deleteWorkPlan(plan.id)
                if (result.error) setError(result.error)
                else router.push('/admin/work-plans')
              })
            }
          }}
          className="text-xs text-[var(--ink-3)] hover:text-[var(--red)] transition-colors"
        >
          Delete plan
        </button>
      </div>

      {adding && (
        <TaskForm
          initial={emptyInput(adding)}
          isPending={isPending}
          onClose={() => setAdding(null)}
          onSave={input => { run(() => createWorkPlanTask(plan.id, input)); setAdding(null) }}
        />
      )}

      {editing && (
        <TaskForm
          initial={toInput(editing)}
          isPending={isPending}
          onClose={() => setEditing(null)}
          onSave={input => { run(() => updateWorkPlanTask(plan.id, editing.id, input)); setEditing(null) }}
          onDelete={() => { run(() => deleteWorkPlanTask(plan.id, editing.id)); setEditing(null) }}
        />
      )}
    </div>
  )
}
