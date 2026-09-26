'use client'

/**
 * CLIENT-FACING board. The types it receives (ClientWorkPlan / ClientWorkPlanTask)
 * structurally exclude internal_note and done_by, so team-only content is not
 * merely unrendered here — it is unrepresentable. Do not widen these props to
 * the admin WorkPlanTask type.
 */

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor,
  useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { setMyWorkPlanTaskStatus } from '@/app/actions/work-plan-board'
import { completionPercent, groupTasksByTimeframe } from '@/lib/work-plans'
import {
  MILESTONE_TAGS, TASK_STATUSES,
  type ClientWorkPlan, type ClientWorkPlanTask, type WorkPlanTaskStatus,
} from '@/types/database'

function milestoneLabel(tag: string) {
  return MILESTONE_TAGS.find(t => t.value === tag)?.label ?? tag
}

// ── Card ─────────────────────────────────────────────────────────────────────

function CardBody({ task }: { task: ClientWorkPlanTask }) {
  return (
    <>
      <p className="text-sm text-[var(--ink)] leading-snug">{task.title}</p>
      <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
        <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-white/8 text-[var(--ink-3)]">
          {task.timeframe_group}
        </span>
        {task.milestone_tag !== 'general' && (
          <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-[var(--accent-light)] text-[var(--accent-text)]">
            {milestoneLabel(task.milestone_tag)}
          </span>
        )}
        {task.is_recurring && (
          <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-white/8 text-[var(--ink-3)]">
            recurring
          </span>
        )}
      </div>
    </>
  )
}

function TaskCard({
  task, disabled, onOpen,
}: {
  task: ClientWorkPlanTask
  disabled: boolean
  onOpen: (task: ClientWorkPlanTask) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled })

  return (
    <div
      ref={setNodeRef}
      {...(disabled ? {} : attributes)}
      {...(disabled ? {} : listeners)}
      onClick={() => onOpen(task)}
      // touch-action: manipulation lets a finger scroll the column normally;
      // the TouchSensor's press-delay below is what starts a drag instead.
      style={{ touchAction: 'manipulation' }}
      className={[
        'w-full text-left rounded-xl border p-3 bg-[var(--surface)] transition-colors',
        'border-[var(--ink)]/8 hover:border-[var(--ink)]/20',
        disabled ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
        isDragging ? 'opacity-40' : '',
      ].join(' ')}
    >
      <CardBody task={task} />
    </div>
  )
}

// ── Column ───────────────────────────────────────────────────────────────────

function Column({
  status, label, tasks, collapsed, onToggleGroup, disabled, onOpen,
}: {
  status: WorkPlanTaskStatus
  label: string
  tasks: ClientWorkPlanTask[]
  collapsed: Set<string>
  onToggleGroup: (key: string) => void
  disabled: boolean
  onOpen: (task: ClientWorkPlanTask) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` })
  // Timeframe order and within-group order both come from the admin's plan —
  // members move cards between columns but never reorder them.
  const groups = groupTasksByTimeframe(tasks)

  return (
    <section className="flex flex-col min-w-0">
      <div className="flex items-center gap-2 px-1 pb-2">
        <h3 className="text-sm font-medium text-[var(--ink-2)]">{label}</h3>
        <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-white/8 text-[var(--ink-3)]">
          {tasks.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={[
          'flex-1 rounded-xl border border-dashed p-2 space-y-3 transition-colors min-h-[120px]',
          isOver && !disabled ? 'border-[var(--accent-text)] bg-[var(--accent-light)]' : 'border-[var(--ink)]/10',
        ].join(' ')}
      >
        {groups.length === 0 ? (
          <p className="text-xs text-[var(--ink-3)] text-center py-6">Nothing here.</p>
        ) : (
          groups.map(({ group, tasks: groupTasks }) => {
            const key = `${status}:${group}`
            const isCollapsed = collapsed.has(key)
            return (
              <div key={key}>
                <button
                  onClick={() => onToggleGroup(key)}
                  aria-expanded={!isCollapsed}
                  className="w-full flex items-center gap-1.5 px-1 py-1 text-[11px] font-medium uppercase tracking-wide text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
                >
                  <svg
                    width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden
                    className={`transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                  >
                    <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {group}
                  <span className="normal-case font-normal">({groupTasks.length})</span>
                </button>
                {!isCollapsed && (
                  <div className="space-y-2 mt-1">
                    {groupTasks.map(task => (
                      <TaskCard key={task.id} task={task} disabled={disabled} onOpen={onOpen} />
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

// ── Detail drawer (read-only) ────────────────────────────────────────────────

function TaskDrawer({ task, onClose }: { task: ClientWorkPlanTask; onClose: () => void }) {
  // Escape closes the drawer. Bound on the document rather than the panel so it
  // works before the user has focused anything inside it.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={task.title}>
      <button
        onClick={onClose}
        aria-label="Close details"
        className="absolute inset-0 bg-black/50 cursor-default"
      />
      <div className="relative w-full sm:max-w-md h-full overflow-y-auto bg-[var(--surface)] border-l border-[var(--ink)]/8 p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg text-[var(--ink)] leading-snug" style={{ fontFamily: 'var(--font-heading)' }}>
            {task.title}
          </h3>
          <button onClick={onClose} aria-label="Close" className="p-2 -m-2 text-[var(--ink-3)] hover:text-[var(--ink)]">✕</button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-white/8 text-[var(--ink-3)]">{task.timeframe_group}</span>
          {task.milestone_tag !== 'general' && (
            <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-[var(--accent-light)] text-[var(--accent-text)]">
              {milestoneLabel(task.milestone_tag)}
            </span>
          )}
          <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-white/8 text-[var(--ink-3)]">
            {TASK_STATUSES.find(s => s.value === task.status)?.label ?? task.status}
          </span>
        </div>

        {task.description
          ? <p className="text-sm text-[var(--ink-2)] whitespace-pre-wrap leading-relaxed">{task.description}</p>
          : <p className="text-sm text-[var(--ink-3)]">No further detail on this step.</p>}

        {(task.links ?? []).length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-[var(--ink)]/8">
            <p className="text-xs text-[var(--ink-3)] uppercase tracking-wide">Links</p>
            {task.links.map((l, i) => (
              <a
                key={`${l.url}-${i}`}
                href={l.url}
                target={l.internal ? undefined : '_blank'}
                rel={l.internal ? undefined : 'noreferrer'}
                className="block text-sm text-[var(--accent-text)] hover:underline break-all"
              >
                {l.label ?? l.url}{l.internal ? '' : ' ↗'}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Board ────────────────────────────────────────────────────────────────────

export default function WorkPlanBoardClient({
  plan, tasks: initialTasks, viewOnly, extraPublishedCount, loadError,
}: {
  plan: ClientWorkPlan
  tasks: ClientWorkPlanTask[]
  viewOnly: boolean
  extraPublishedCount: number
  loadError: string | null
}) {
  const router = useRouter()
  const [tasks, setTasks] = useState(initialTasks)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<ClientWorkPlanTask | null>(null)
  const [dragging, setDragging] = useState<ClientWorkPlanTask | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    // Press-and-hold on touch, so a normal swipe still scrolls the column.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  const done = tasks.filter(t => t.status === 'done').length
  const pct = completionPercent(done, tasks.length)

  function toggleGroup(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleDragStart(event: DragStartEvent) {
    setDragging(tasks.find(t => t.id === event.active.id) ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragging(null)
    const { active, over } = event
    if (!over) return

    const overId = String(over.id)
    if (!overId.startsWith('col:')) return
    const target = overId.slice(4) as WorkPlanTaskStatus

    const task = tasks.find(t => t.id === active.id)
    if (!task || task.status === target) return

    const previous = tasks
    // Mirror the DB trigger optimistically so the header percentage moves with
    // the card rather than after the round trip.
    setTasks(ts =>
      ts.map(t => (t.id === task.id ? { ...t, status: target, is_done: target === 'done' } : t)),
    )
    setError(null)

    startTransition(async () => {
      const result = await setMyWorkPlanTaskStatus(task.id, target)
      if (result.error) {
        setTasks(previous)
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  const board = (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {TASK_STATUSES.map(({ value, label }) => (
        <Column
          key={value}
          status={value}
          label={label}
          tasks={tasks.filter(t => t.status === value)}
          collapsed={collapsed}
          onToggleGroup={toggleGroup}
          disabled={viewOnly}
          onOpen={setOpen}
        />
      ))}
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
              {plan.title}
            </h2>
            <p className="text-sm text-[var(--ink-3)] mt-0.5">
              {done}/{tasks.length} done ({pct}%)
            </p>
          </div>
          {viewOnly && (
            <span className="px-2 py-1 rounded-lg text-xs bg-white/8 text-[var(--ink-3)]">
              View only — dragging is disabled
            </span>
          )}
        </div>
        <div className="h-1.5 rounded-full bg-white/8 overflow-hidden mt-3 max-w-md">
          <div className="h-full rounded-full bg-[var(--accent-text)]" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {(error || loadError) && (
        <p className="text-xs text-[var(--red)] bg-[var(--red-l)] px-3 py-2 rounded-lg">{error ?? loadError}</p>
      )}

      {extraPublishedCount > 0 && (
        <p className="text-xs text-[var(--amber)] bg-white/5 px-3 py-2 rounded-lg">
          This studio has {extraPublishedCount + 1} published plans. Showing the most recently updated one.
        </p>
      )}

      {tasks.length === 0 ? (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 py-16 text-center">
          <p className="text-sm text-[var(--ink-3)]">Your work plan doesn&apos;t have any steps yet.</p>
          <p className="text-xs text-[var(--ink-3)] mt-1">Your OTB strategist will add them shortly.</p>
        </div>
      ) : viewOnly ? (
        board
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {board}
          <DragOverlay>
            {dragging && (
              <div className="rounded-xl border border-[var(--accent-text)] p-3 bg-[var(--surface)] shadow-lg">
                <CardBody task={dragging} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {open && <TaskDrawer task={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
