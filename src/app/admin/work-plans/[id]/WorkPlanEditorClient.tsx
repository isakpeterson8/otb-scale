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
  DndContext, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  deleteWorkPlan, deleteWorkPlanTask, createWorkPlanTask, moveWorkPlanTaskToGroup,
  reorderWorkPlanTasks, setWorkPlanTaskDone, updateWorkPlan, updateWorkPlanTask,
} from '@/app/actions/work-plans'
import { completionPercent, groupTasksByTimeframe, TIMEFRAME_ORDER } from '@/lib/work-plans'
import { MILESTONE_TAGS, type WorkPlan, type WorkPlanStatus, type WorkPlanTask } from '@/types/database'

import TaskForm, { emptyInput, toInput } from '../TaskForm'

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

/** Makes a whole group a drop target, so a task can land in it from elsewhere. */
function GroupDropZone({ group, children }: { group: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `group:${group}` })
  return (
    <div
      ref={setNodeRef}
      className={[
        'bg-[var(--surface)] rounded-xl border overflow-hidden transition-colors',
        isOver ? 'border-[var(--accent-text)]' : 'border-[var(--ink)]/8',
      ].join(' ')}
    >
      {children}
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

  const orderedGroup = (source: WorkPlanTask[], group: string) =>
    source.filter(t => t.timeframe_group === group).sort((a, b) => a.sort_order - b.sort_order)

  /** week_number/is_recurring the target group implies — mirrors the server. */
  function shapeForGroup(group: string): Partial<WorkPlanTask> {
    const week = group.match(/^Week (\d+)$/)
    if (week) return { week_number: Number(week[1]), is_recurring: false }
    if (group === 'Weekly' || group === 'Monthly' || group === 'Semester') {
      return { week_number: null, is_recurring: true }
    }
    return {}
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const moved = tasks.find(t => t.id === active.id)
    if (!moved) return

    // Dropping on a task targets that task's group; dropping on empty space in
    // a group targets the group itself.
    const overId = String(over.id)
    const overTask = tasks.find(t => t.id === overId)
    const targetGroup = overTask?.timeframe_group ?? (overId.startsWith('group:') ? overId.slice(6) : null)
    if (!targetGroup) return

    const sourceGroup = moved.timeframe_group
    const previous = tasks

    if (targetGroup === sourceGroup) {
      const inGroup = orderedGroup(tasks, sourceGroup)
      const from = inGroup.findIndex(t => t.id === active.id)
      const to = inGroup.findIndex(t => t.id === overId)
      if (from === -1 || to === -1) return

      const reordered = arrayMove(inGroup, from, to)
      const orderById = new Map(reordered.map((t, i) => [t.id, i]))
      setTasks(ts => ts.map(t => (orderById.has(t.id) ? { ...t, sort_order: orderById.get(t.id)! } : t)))
      run(() => reorderWorkPlanTasks(plan.id, sourceGroup, reordered.map(t => t.id)), () => setTasks(previous))
      return
    }

    // Cross-group: insert at the hovered task's position, or append when the
    // drop landed on the group rather than a task.
    const targetTasks = orderedGroup(tasks, targetGroup)
    const insertAt = overTask ? targetTasks.findIndex(t => t.id === overId) : targetTasks.length
    const nextTarget = [...targetTasks]
    nextTarget.splice(insertAt === -1 ? targetTasks.length : insertAt, 0, moved)
    const nextSource = orderedGroup(tasks, sourceGroup).filter(t => t.id !== moved.id)

    const targetOrder = new Map(nextTarget.map((t, i) => [t.id, i]))
    const sourceOrder = new Map(nextSource.map((t, i) => [t.id, i]))
    setTasks(ts =>
      ts.map(t => {
        if (t.id === moved.id) {
          return { ...t, ...shapeForGroup(targetGroup), timeframe_group: targetGroup, sort_order: targetOrder.get(t.id)! }
        }
        if (targetOrder.has(t.id)) return { ...t, sort_order: targetOrder.get(t.id)! }
        if (sourceOrder.has(t.id)) return { ...t, sort_order: sourceOrder.get(t.id)! }
        return t
      }),
    )
    run(
      () => moveWorkPlanTaskToGroup(
        plan.id, moved.id, targetGroup,
        nextTarget.map(t => t.id), nextSource.map(t => t.id),
      ),
      () => setTasks(previous),
    )
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
        // One context across every group, so a task can be dragged between them.
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          {groups.map(({ group, tasks: groupTasks }) => (
            <section key={group} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-[var(--ink-2)] uppercase tracking-wide">
                  {group} <span className="text-[var(--ink-3)] normal-case">({groupTasks.filter(t => t.is_done).length}/{groupTasks.length})</span>
                </h3>
                <button onClick={() => setAdding(group)} className="text-xs text-[var(--accent-text)] hover:underline">+ Add task</button>
              </div>
              <GroupDropZone group={group}>
                <SortableContext items={groupTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                  <div className="divide-y divide-[var(--ink)]/6">
                    {groupTasks.map(task => (
                      <TaskRow key={task.id} task={task} onToggleDone={handleToggleDone} onEdit={setEditing} />
                    ))}
                  </div>
                </SortableContext>
              </GroupDropZone>
            </section>
          ))}
        </DndContext>
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
