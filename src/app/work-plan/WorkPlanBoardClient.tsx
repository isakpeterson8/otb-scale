'use client'

/**
 * CLIENT-FACING board. The types it receives (ClientWorkPlan / ClientWorkPlanTask)
 * structurally exclude internal_note and done_by, so team-only content is not
 * merely unrendered here — it is unrepresentable. Do not widen these props to
 * the admin WorkPlanTask type.
 *
 * Two presentations of one data model:
 *   md and up — three drag-and-drop columns (unchanged from the first version).
 *   below md  — a sticky segmented control; one column at a time, no dragging.
 *               Cards open a bottom sheet whose "Move to" buttons do what
 *               dragging does on desktop.
 */

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor,
  useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { setMyWorkPlanTaskStatus } from '@/app/actions/work-plan-board'
import Toast, { useToast } from '@/components/ui/Toast'
import { completionPercent, groupTasksByTimeframe } from '@/lib/work-plans'
import {
  MILESTONE_TAGS, TASK_STATUSES,
  type ClientWorkPlan, type ClientWorkPlanTask, type WorkPlanTaskStatus,
} from '@/types/database'

/**
 * One tint per status, from the app's existing pairs in globals.css. Used by the
 * mobile tabs, the desktop column counts and the sheet's Move-to buttons, so a
 * status reads the same colour everywhere.
 */
const STATUS_STYLE: Record<WorkPlanTaskStatus, { label: string; fg: string; bg: string }> = {
  todo:  { label: 'To Do', fg: 'var(--red)',   bg: 'var(--red-l)' },
  doing: { label: 'Doing', fg: 'var(--amber)', bg: 'var(--amber-l)' },
  done:  { label: 'Done',  fg: 'var(--green)', bg: 'var(--green-l)' },
}

/**
 * Expand/collapse choices survive navigating away and back within the session.
 * Module-level rather than state so it outlives the unmount, matching the
 * module-cache pattern already used in the admin tabs. Keyed `status:group`.
 */
const groupOverrides: Record<string, boolean> = {}

function milestoneLabel(tag: string) {
  return MILESTONE_TAGS.find(t => t.value === tag)?.label ?? tag
}

function Chip({ children, fg, bg }: { children: React.ReactNode; fg?: string; bg?: string }) {
  return (
    <span
      className="px-1.5 py-0.5 rounded-full text-[11px] leading-tight whitespace-nowrap"
      style={{ background: bg ?? 'var(--surface-2)', color: fg ?? 'var(--ink-3)' }}
    >
      {children}
    </span>
  )
}

// ── Card ─────────────────────────────────────────────────────────────────────

/** Presentational card. Rendered directly on mobile; wrapped for drag on desktop. */
function CardShell({
  task, onOpen, dragging = false,
}: {
  task: ClientWorkPlanTask
  onOpen?: (task: ClientWorkPlanTask) => void
  dragging?: boolean
}) {
  return (
    <div
      onClick={onOpen ? () => onOpen(task) : undefined}
      className={[
        'w-full rounded-xl border p-3 transition-colors cursor-pointer',
        // Mobile: tinted card on the white page. Desktop: white card inside the
        // tinted column. Either way the card reads as a distinct surface.
        'bg-[var(--surface)] md:bg-[var(--canvas)]',
        dragging ? 'border-[var(--accent-text)] shadow-lg' : 'border-[var(--border)] hover:border-[var(--border-s)]',
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <p className={[
          'flex-1 min-w-0 text-sm leading-snug',
          task.status === 'done' ? 'text-[var(--ink-3)] line-through' : 'text-[var(--ink)]',
        ].join(' ')}>
          {task.title}
        </p>
        {/* Mobile affordance: the card opens a sheet. */}
        <svg
          width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden
          className="shrink-0 mt-0.5 text-[var(--ink-3)] md:hidden"
        >
          <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Mobile stays slim: no week chip, because the group header above already
          states the week. A milestone tag still earns its space when set. */}
      {task.milestone_tag !== 'general' && (
        <div className="md:hidden mt-1.5">
          <Chip fg="var(--accent-text)" bg="var(--accent-light)">{milestoneLabel(task.milestone_tag)}</Chip>
        </div>
      )}

      {/* Desktop keeps the fuller chip row. */}
      <div className="hidden md:flex items-center gap-1.5 flex-wrap mt-1.5">
        <Chip>{task.timeframe_group}</Chip>
        {task.milestone_tag !== 'general' && (
          <Chip fg="var(--accent-text)" bg="var(--accent-light)">{milestoneLabel(task.milestone_tag)}</Chip>
        )}
        {task.is_recurring && <Chip>recurring</Chip>}
      </div>
    </div>
  )
}

function DraggableCard({
  task, onOpen,
}: {
  task: ClientWorkPlanTask
  onOpen: (task: ClientWorkPlanTask) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ touchAction: 'manipulation' }}
      className={isDragging ? 'opacity-40 cursor-grabbing' : 'cursor-grab'}
    >
      <CardShell task={task} onOpen={onOpen} />
    </div>
  )
}

// ── Grouped task list, shared by both presentations ──────────────────────────

function GroupedTasks({
  status, tasks, isExpanded, onToggleGroup, renderCard,
}: {
  status: WorkPlanTaskStatus
  tasks: ClientWorkPlanTask[]
  isExpanded: (status: WorkPlanTaskStatus, group: string) => boolean
  onToggleGroup: (status: WorkPlanTaskStatus, group: string, next: boolean) => void
  renderCard: (task: ClientWorkPlanTask) => React.ReactNode
}) {
  // Timeframe order and within-group order both come from the admin's plan —
  // members move cards between columns but never reorder them.
  const groups = groupTasksByTimeframe(tasks)

  if (groups.length === 0) {
    return status === 'done'
      ? (
        <div className="py-10 text-center px-4">
          <p className="text-sm text-[var(--ink-2)]">Nothing finished yet — that&apos;s what this column is for.</p>
          <p className="text-xs text-[var(--ink-3)] mt-1">Move a step here as soon as you&apos;ve done it.</p>
        </div>
      )
      : <p className="text-xs text-[var(--ink-3)] text-center py-8">Nothing here.</p>
  }

  return (
    <>
      {groups.map(({ group, tasks: groupTasks }) => {
        const expanded = isExpanded(status, group)
        const remaining = groupTasks.filter(t => t.status !== 'done').length
        return (
          <div key={group}>
            <button
              onClick={() => onToggleGroup(status, group, !expanded)}
              aria-expanded={expanded}
              className="w-full flex items-center gap-1.5 px-1 py-2 text-left hover:opacity-80 transition-opacity"
            >
              <svg
                width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden
                className={`shrink-0 text-[var(--ink-3)] transition-transform ${expanded ? '' : '-rotate-90'}`}
              >
                <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-2)]">{group}</span>
              <span className="ml-auto text-[11px] text-[var(--ink-3)] tabular-nums">
                {remaining > 0 ? `${remaining} of ${groupTasks.length} left` : `${groupTasks.length} done`}
              </span>
            </button>
            {expanded && (
              <div className="space-y-2 pb-1">
                {groupTasks.map(task => renderCard(task))}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

// ── Desktop column (drop target) ─────────────────────────────────────────────

function DesktopColumn({
  status, tasks, isExpanded, onToggleGroup, onOpen,
}: {
  status: WorkPlanTaskStatus
  tasks: ClientWorkPlanTask[]
  isExpanded: (status: WorkPlanTaskStatus, group: string) => boolean
  onToggleGroup: (status: WorkPlanTaskStatus, group: string, next: boolean) => void
  onOpen: (task: ClientWorkPlanTask) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` })
  const style = STATUS_STYLE[status]

  return (
    <section className="flex flex-col min-w-0">
      <div className="flex items-center gap-2 px-1 pb-2">
        <h3 className="text-sm font-medium" style={{ color: style.fg }}>{style.label}</h3>
        <Chip fg={style.fg} bg={style.bg}>{tasks.length}</Chip>
      </div>
      <div
        ref={setNodeRef}
        className={[
          'flex-1 rounded-xl border p-2 space-y-1 transition-colors min-h-[140px]',
          isOver ? 'border-[var(--accent-text)] bg-[var(--accent-light)]' : 'border-[var(--border)] bg-[var(--surface)]',
        ].join(' ')}
      >
        <GroupedTasks
          status={status}
          tasks={tasks}
          isExpanded={isExpanded}
          onToggleGroup={onToggleGroup}
          renderCard={task => <DraggableCard key={task.id} task={task} onOpen={onOpen} />}
        />
      </div>
    </section>
  )
}

// ── Detail panel: bottom sheet below md, right drawer at md+ ──────────────────

function TaskSheet({
  task, viewOnly, pending, onMove, onClose,
}: {
  task: ClientWorkPlanTask
  viewOnly: boolean
  pending: boolean
  onMove: (task: ClientWorkPlanTask, status: WorkPlanTaskStatus) => void
  onClose: () => void
}) {
  const [dragY, setDragY] = useState(0)
  const startY = useRef<number | null>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Swipe down to dismiss. Bound to the handle/header only, so the body can
  // still scroll normally.
  function onTouchStart(e: React.TouchEvent) { startY.current = e.touches[0].clientY }
  function onTouchMove(e: React.TouchEvent) {
    if (startY.current == null) return
    setDragY(Math.max(0, e.touches[0].clientY - startY.current))
  }
  function onTouchEnd() {
    if (dragY > 90) onClose()
    else setDragY(0)
    startY.current = null
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end md:items-stretch md:justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={task.title}
    >
      <button onClick={onClose} aria-label="Close details" className="absolute inset-0 bg-black/40 cursor-default" />

      <div
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: startY.current == null ? 'transform 180ms cubic-bezier(.4,0,.2,1)' : undefined,
          paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
        }}
        className={[
          'relative w-full bg-[var(--canvas)] max-h-[88vh] overflow-y-auto',
          'rounded-t-2xl border-t border-[var(--border)]',
          'md:rounded-t-none md:rounded-none md:max-w-md md:h-full md:max-h-none md:border-t-0 md:border-l',
        ].join(' ')}
      >
        {/* Drag handle — mobile only */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="md:hidden pt-2.5 pb-1 flex justify-center cursor-grab active:cursor-grabbing"
          style={{ touchAction: 'none' }}
        >
          <div className="w-10 h-1 rounded-full bg-[var(--border-s)]" />
        </div>

        <div className="px-5 pt-2 md:pt-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg text-[var(--ink)] leading-snug" style={{ fontFamily: 'var(--font-heading)' }}>
              {task.title}
            </h3>
            <button onClick={onClose} aria-label="Close" className="p-2 -m-1 text-[var(--ink-3)] hover:text-[var(--ink)]">✕</button>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <Chip>{task.timeframe_group}</Chip>
            {task.milestone_tag !== 'general' && (
              <Chip fg="var(--accent-text)" bg="var(--accent-light)">{milestoneLabel(task.milestone_tag)}</Chip>
            )}
            {task.is_recurring && <Chip>recurring</Chip>}
          </div>

          {task.description
            ? <p className="text-sm text-[var(--ink-2)] whitespace-pre-wrap leading-relaxed">{task.description}</p>
            : <p className="text-sm text-[var(--ink-3)]">No further detail on this step.</p>}

          {(task.links ?? []).length > 0 && (
            <div className="space-y-1.5 pt-1">
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

          <div className="pt-2 border-t border-[var(--border)] space-y-2">
            <p className="text-xs text-[var(--ink-3)] uppercase tracking-wide">Move to</p>
            <div className="grid grid-cols-3 gap-2">
              {TASK_STATUSES.map(({ value }) => {
                const s = STATUS_STYLE[value]
                const current = task.status === value
                return (
                  <button
                    key={value}
                    disabled={viewOnly || pending || current}
                    onClick={() => onMove(task, value)}
                    aria-current={current}
                    className="py-3 rounded-xl text-sm font-medium border transition-colors disabled:cursor-not-allowed min-h-[48px]"
                    style={{
                      background: current ? s.bg : 'var(--surface)',
                      color: current ? s.fg : 'var(--ink-2)',
                      borderColor: current ? s.fg : 'var(--border)',
                      opacity: viewOnly ? 0.5 : 1,
                    }}
                  >
                    {s.label}
                  </button>
                )
              })}
            </div>
            {viewOnly && (
              <p className="text-xs text-[var(--ink-3)]">View only — you can&apos;t move steps while viewing as this studio.</p>
            )}
          </div>
        </div>
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
  const { toast, showToast } = useToast(2500)
  const [tasks, setTasks] = useState(initialTasks)
  const [activeTab, setActiveTab] = useState<WorkPlanTaskStatus>('todo')
  const [open, setOpen] = useState<ClientWorkPlanTask | null>(null)
  const [dragging, setDragging] = useState<ClientWorkPlanTask | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Mirrors the module-level store into state so a toggle re-renders; the module
  // copy is what survives navigating away and back within the session.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({ ...groupOverrides })
  const [isPending, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  const byStatus = (s: WorkPlanTaskStatus) => tasks.filter(t => t.status === s)
  const done = byStatus('done').length
  const pct = completionPercent(done, tasks.length)

  /**
   * Default: within a column, only the first timeframe group that still has
   * unfinished work is open. A column with nothing unfinished (typically Done)
   * opens its first group rather than showing everything collapsed.
   */
  function defaultOpenGroup(status: WorkPlanTaskStatus): string | null {
    const groups = groupTasksByTimeframe(byStatus(status))
    const firstUnfinished = groups.find(g => g.tasks.some(t => t.status !== 'done'))
    return (firstUnfinished ?? groups[0])?.group ?? null
  }

  function isExpanded(status: WorkPlanTaskStatus, group: string) {
    return overrides[`${status}:${group}`] ?? group === defaultOpenGroup(status)
  }

  function onToggleGroup(status: WorkPlanTaskStatus, group: string, next: boolean) {
    groupOverrides[`${status}:${group}`] = next
    setOverrides({ ...groupOverrides })
  }

  /** The one write path: used by desktop drag and by the sheet's Move-to buttons. */
  function moveTask(task: ClientWorkPlanTask, target: WorkPlanTaskStatus, closeSheet = false) {
    if (task.status === target) return
    const previous = tasks
    // Mirror the DB trigger optimistically so counts and the bar move at once.
    setTasks(ts =>
      ts.map(t => (t.id === task.id ? { ...t, status: target, is_done: target === 'done' } : t)),
    )
    setError(null)
    if (closeSheet) setOpen(null)

    startTransition(async () => {
      const result = await setMyWorkPlanTaskStatus(task.id, target)
      if (result.error) {
        setTasks(previous)
        setError(result.error)
        return
      }
      showToast(`Moved to ${STATUS_STYLE[target].label}`)
      router.refresh()
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
    const task = tasks.find(t => t.id === active.id)
    if (task) moveTask(task, overId.slice(4) as WorkPlanTaskStatus)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
              {plan.title}
            </h2>
            <p className="text-sm text-[var(--ink-3)] mt-0.5 tabular-nums">
              {done}/{tasks.length} done ({pct}%)
            </p>
          </div>
          {viewOnly && <Chip>View only — dragging is disabled</Chip>}
        </div>

        {/* 6px bar with a visible track; any progress at all stays visible. */}
        <div
          className="mt-3 max-w-md rounded-full overflow-hidden"
          style={{ height: 6, background: 'var(--surface-2)' }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: done > 0 ? `max(${pct}%, 10px)` : 0,
              background: 'var(--green)',
              transition: 'width 300ms cubic-bezier(.4,0,.2,1)',
            }}
          />
        </div>
      </div>

      {(error || loadError) && (
        <p className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--red)', background: 'var(--red-l)' }}>
          {error ?? loadError}
        </p>
      )}

      {extraPublishedCount > 0 && (
        <p className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--amber)', background: 'var(--amber-l)' }}>
          This studio has {extraPublishedCount + 1} published plans. Showing the most recently updated one.
        </p>
      )}

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] py-16 text-center">
          <p className="text-sm text-[var(--ink-3)]">Your work plan doesn&apos;t have any steps yet.</p>
          <p className="text-xs text-[var(--ink-3)] mt-1">Your OTB strategist will add them shortly.</p>
        </div>
      ) : (
        <>
          {/* ── Mobile: sticky segmented control, one column at a time ───────── */}
          <div className="md:hidden">
            <div
              className="sticky top-14 z-20 -mx-4 px-4 py-2 border-b"
              style={{ background: 'var(--canvas)', borderColor: 'var(--border)' }}
            >
              <div
                role="tablist"
                aria-label="Board column"
                className="grid grid-cols-3 gap-1 p-1 rounded-xl"
                style={{ background: 'var(--surface)' }}
              >
                {TASK_STATUSES.map(({ value }) => {
                  const s = STATUS_STYLE[value]
                  const selected = activeTab === value
                  const count = byStatus(value).length
                  return (
                    <button
                      key={value}
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setActiveTab(value)}
                      className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors min-h-[40px]"
                      style={{
                        background: selected ? s.bg : 'transparent',
                        color: selected ? s.fg : 'var(--ink-3)',
                      }}
                    >
                      {s.label}
                      <span className="tabular-nums opacity-70">{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="pt-2 space-y-1">
              <GroupedTasks
                status={activeTab}
                tasks={byStatus(activeTab)}
                isExpanded={isExpanded}
                onToggleGroup={onToggleGroup}
                renderCard={task => <CardShell key={task.id} task={task} onOpen={setOpen} />}
              />
            </div>
          </div>

          {/* ── Desktop: three drag-and-drop columns, unchanged ──────────────── */}
          <div className="hidden md:block">
            {viewOnly ? (
              <div className="grid grid-cols-3 gap-4">
                {TASK_STATUSES.map(({ value }) => (
                  <DesktopColumn
                    key={value}
                    status={value}
                    tasks={byStatus(value)}
                    isExpanded={isExpanded}
                    onToggleGroup={onToggleGroup}
                    onOpen={setOpen}
                  />
                ))}
              </div>
            ) : (
              <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <div className="grid grid-cols-3 gap-4">
                  {TASK_STATUSES.map(({ value }) => (
                    <DesktopColumn
                      key={value}
                      status={value}
                      tasks={byStatus(value)}
                      isExpanded={isExpanded}
                      onToggleGroup={onToggleGroup}
                      onOpen={setOpen}
                    />
                  ))}
                </div>
                <DragOverlay>
                  {dragging && <div className="w-64"><CardShell task={dragging} dragging /></div>}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        </>
      )}

      {open && (
        <TaskSheet
          task={tasks.find(t => t.id === open.id) ?? open}
          viewOnly={viewOnly}
          pending={isPending}
          onMove={(task, status) => moveTask(task, status, true)}
          onClose={() => setOpen(null)}
        />
      )}

      <Toast toast={toast} />
    </div>
  )
}
