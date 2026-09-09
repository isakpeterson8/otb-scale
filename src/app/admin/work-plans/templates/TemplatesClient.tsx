'use client'

/** ADMIN-ONLY. Edits internal_note, which never reaches a client surface. */

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
  createTemplateTask, createWorkPlanTemplate, deleteTemplateTask, deleteWorkPlanTemplate,
  reorderTemplateTasks, updateTemplateTask, updateWorkPlanTemplate,
} from '@/app/actions/work-plan-templates'
import TaskForm, { INPUT, emptyInput, toInput } from '../TaskForm'
import { groupTasksByTimeframe, TIMEFRAME_ORDER } from '@/lib/work-plans'
import { MILESTONE_TAGS, type WorkPlanTemplate, type WorkPlanTemplateTask } from '@/types/database'

function TaskRow({ task, onEdit }: { task: WorkPlanTemplateTask; onEdit: (t: WorkPlanTemplateTask) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const tag = MILESTONE_TAGS.find(t => t.value === task.milestone_tag)?.label ?? task.milestone_tag

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
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm text-[var(--ink)]">{task.title}</p>
          {task.milestone_tag !== 'general' && (
            <span className="px-1.5 py-0.5 rounded-full text-xs bg-[var(--accent-light)] text-[var(--accent-text)]">{tag}</span>
          )}
          {task.is_recurring && (
            <span className="px-1.5 py-0.5 rounded-full text-xs bg-white/8 text-[var(--ink-3)]">
              recurring{task.starts_after_week ? ` · after wk ${task.starts_after_week}` : ''}
            </span>
          )}
          {(task.links ?? []).length > 0 && (
            <span className="text-xs text-[var(--ink-3)]">{task.links.length} link{task.links.length === 1 ? '' : 's'}</span>
          )}
        </div>
        {task.description && <p className="text-xs text-[var(--ink-3)] mt-0.5">{task.description}</p>}
        {task.internal_note && <p className="text-xs text-[var(--amber)] mt-1">🔒 Team only: {task.internal_note}</p>}
      </div>
      <button onClick={() => onEdit(task)} className="shrink-0 px-2 py-1 rounded-lg text-xs text-[var(--ink-3)] hover:text-[var(--ink)]">
        Edit
      </button>
    </div>
  )
}

export default function TemplatesClient({
  templates, selectedId, tasks: initialTasks, loadError,
}: {
  templates: WorkPlanTemplate[]
  selectedId: string | null
  tasks: WorkPlanTemplateTask[]
  loadError: string | null
}) {
  const router = useRouter()
  const [tasks, setTasks] = useState(initialTasks)
  const [editing, setEditing] = useState<WorkPlanTemplateTask | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const selected = templates.find(t => t.id === selectedId) ?? null
  const groups = groupTasksByTimeframe(tasks)

  function run(action: () => Promise<{ error: string | null }>, revert?: () => void) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) { revert?.(); setError(result.error); return }
      router.refresh()
    })
  }

  function handleDragEnd(group: string, event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !selected) return
    const inGroup = tasks.filter(t => t.timeframe_group === group).sort((a, b) => a.sort_order - b.sort_order)
    const from = inGroup.findIndex(t => t.id === active.id)
    const to = inGroup.findIndex(t => t.id === over.id)
    if (from === -1 || to === -1) return

    const previous = tasks
    const reordered = arrayMove(inGroup, from, to)
    const orderById = new Map(reordered.map((t, i) => [t.id, i]))
    setTasks(ts => ts.map(t => (orderById.has(t.id) ? { ...t, sort_order: orderById.get(t.id)! } : t)))
    run(() => reorderTemplateTasks(selected.id, group, reordered.map(t => t.id)), () => setTasks(previous))
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/work-plans" className="text-xs text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
          ← Work Plans
        </Link>
        <div className="flex items-start justify-between gap-3 mt-1">
          <div>
            <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>Templates</h2>
            <p className="text-sm text-[var(--ink-3)] mt-0.5">
              Editing a template does not change plans already created from it.
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--ink)] text-sm font-medium hover:bg-[var(--accent-text)] hover:text-[var(--canvas)] transition-colors shrink-0"
          >
            New template
          </button>
        </div>
      </div>

      {(error || loadError) && (
        <p className="text-xs text-[var(--red)] bg-[var(--red-l)] px-3 py-2 rounded-lg">{error ?? loadError}</p>
      )}

      {creating && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 p-4 flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs text-[var(--ink-3)] mb-1">Template name</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} className={INPUT} placeholder="e.g. Returning Member Plan" />
          </div>
          <button
            onClick={() => {
              const name = newName.trim()
              if (!name) return
              startTransition(async () => {
                const result = await createWorkPlanTemplate(name, null)
                if (result.error) setError(result.error)
                else { setCreating(false); setNewName(''); router.push(`/admin/work-plans/templates?template=${result.id}`) }
              })
            }}
            disabled={isPending || newName.trim() === ''}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--ink)] text-sm font-medium disabled:opacity-60"
          >
            Create
          </button>
          <button onClick={() => setCreating(false)} className="px-3 py-2 text-sm text-[var(--ink-3)] hover:text-[var(--ink)]">Cancel</button>
        </div>
      )}

      {templates.length === 0 ? (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 py-16 flex flex-col items-center gap-2">
          <p className="text-sm text-[var(--ink-3)]">No templates yet.</p>
          <p className="text-xs text-[var(--ink-3)]">Run the seed script to load the standard plan, or create one above.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1 border-b border-[var(--ink)]/8 overflow-x-auto">
            {templates.map(t => (
              <Link
                key={t.id}
                href={`/admin/work-plans/templates?template=${t.id}`}
                className={[
                  'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
                  t.id === selectedId
                    ? 'text-[var(--ink)] border-[var(--accent-text)]'
                    : 'text-[var(--ink-3)] border-transparent hover:text-[var(--ink-2)]',
                ].join(' ')}
              >
                {t.name}{!t.is_active && ' (inactive)'}
              </Link>
            ))}
          </div>

          {selected && (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm text-[var(--ink-3)]">
                  {tasks.length} task{tasks.length === 1 ? '' : 's'} · {groups.length} group{groups.length === 1 ? '' : 's'}
                </p>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
                    <input
                      type="checkbox"
                      checked={selected.is_active}
                      onChange={e => run(() => updateWorkPlanTemplate(selected.id, { is_active: e.target.checked }))}
                      className="rounded"
                    />
                    Active
                  </label>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${selected.name}" and its tasks? Existing plans are unaffected.`)) {
                        run(() => deleteWorkPlanTemplate(selected.id))
                      }
                    }}
                    className="text-xs text-[var(--ink-3)] hover:text-[var(--red)] transition-colors"
                  >
                    Delete template
                  </button>
                </div>
              </div>

              {groups.length === 0 ? (
                <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 py-16 flex flex-col items-center gap-2">
                  <p className="text-sm text-[var(--ink-3)]">This template has no tasks.</p>
                  <button onClick={() => setAdding(TIMEFRAME_ORDER[0])} className="text-xs text-[var(--accent-text)] hover:underline">
                    Add the first task
                  </button>
                </div>
              ) : (
                groups.map(({ group, tasks: groupTasks }) => (
                  <section key={group} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-[var(--ink-2)] uppercase tracking-wide">
                        {group} <span className="text-[var(--ink-3)] normal-case">({groupTasks.length})</span>
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
                            {groupTasks.map(t => <TaskRow key={t.id} task={t} onEdit={setEditing} />)}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  </section>
                ))
              )}
            </>
          )}
        </>
      )}

      {adding && selected && (
        <TaskForm
          initial={emptyInput(adding)}
          isPending={isPending}
          onClose={() => setAdding(null)}
          onSave={input => { run(() => createTemplateTask(selected.id, input)); setAdding(null) }}
        />
      )}

      {editing && (
        <TaskForm
          initial={toInput(editing)}
          isPending={isPending}
          onClose={() => setEditing(null)}
          onSave={input => { run(() => updateTemplateTask(editing.id, input)); setEditing(null) }}
          onDelete={() => { run(() => deleteTemplateTask(editing.id)); setEditing(null) }}
        />
      )}
    </div>
  )
}
