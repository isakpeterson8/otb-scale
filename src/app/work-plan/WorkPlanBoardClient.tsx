'use client'

/**
 * CLIENT-FACING board. The types it receives structurally exclude internal_note,
 * done_by and created_by, so team-only content is not merely unrendered here — it
 * is unrepresentable. Do not widen these props to the admin WorkPlanTask type.
 *
 * Two presentations of one data model:
 *   md and up — three drag-and-drop columns, detail in a right-hand drawer.
 *   below md  — a sticky segmented control; one column at a time, no dragging,
 *               detail in a bottom sheet whose Move-to buttons replace dragging.
 *
 * Every write goes through a server action wrapping a SECURITY DEFINER RPC. The
 * member may: move any task, tick any checklist item, write their own note, and
 * create / edit / delete only tasks they added themselves.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor,
  useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import {
  createMyWorkPlanTask, deleteMyWorkPlanTask, setMyWorkPlanTaskClientNote,
  setMyWorkPlanTaskItemDone, setMyWorkPlanTaskStatus, updateMyWorkPlanTask,
} from '@/app/actions/work-plan-board'
import Toast, { useToast } from '@/components/ui/Toast'
import {
  BRAIN_DUMP_GROUP, completionPercent, groupTasksByTimeframe, linkLabel,
  orderTimeframeGroups, TIMEFRAME_ORDER,
} from '@/lib/work-plans'
import {
  CATEGORY_TAGS, TASK_STATUSES,
  type ClientWorkPlan, type ClientWorkPlanTaskItem, type ClientWorkPlanTaskWithItems,
  type WorkPlanTaskStatus,
} from '@/types/database'

type Task = ClientWorkPlanTaskWithItems

const STATUS_STYLE: Record<WorkPlanTaskStatus, { label: string; fg: string; bg: string }> = {
  todo:  { label: 'To Do', fg: 'var(--red)',   bg: 'var(--red-l)' },
  doing: { label: 'Doing', fg: 'var(--amber)', bg: 'var(--amber-l)' },
  done:  { label: 'Done',  fg: 'var(--green)', bg: 'var(--green-l)' },
}

/** Expand/collapse choices survive navigating away and back within the session. */
const groupOverrides: Record<string, boolean> = {}

const NEW_GROUP = '__new__'

function categoryLabel(tag: string) {
  return CATEGORY_TAGS.find(t => t.value === tag)?.label ?? tag
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

const INPUT =
  'w-full px-3 py-2 rounded-lg border border-[var(--border-s)] bg-[var(--canvas)] text-sm ' +
  'text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]'

// ── Card ─────────────────────────────────────────────────────────────────────

function CardShell({
  task, onOpen, dragging = false,
}: {
  task: Task
  onOpen?: (task: Task) => void
  dragging?: boolean
}) {
  const itemsDone = task.items.filter(i => i.is_done).length

  return (
    <div
      onClick={onOpen ? () => onOpen(task) : undefined}
      className={[
        'w-full rounded-xl border p-3 transition-colors cursor-pointer',
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
        <svg
          width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden
          className="shrink-0 mt-0.5 text-[var(--ink-3)] md:hidden"
        >
          <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Mobile stays slim: no week chip (the group header states it), but the
          checklist count and category are worth the line. */}
      {(task.items.length > 0 || task.milestone_tag !== 'general' || task.is_client_added) && (
        <div className="md:hidden flex items-center gap-1.5 flex-wrap mt-1.5">
          {task.items.length > 0 && <Chip>{itemsDone}/{task.items.length}</Chip>}
          {task.milestone_tag !== 'general' && (
            <Chip fg="var(--accent-text)" bg="var(--accent-light)">{categoryLabel(task.milestone_tag)}</Chip>
          )}
          {task.is_client_added && <Chip>Added by you</Chip>}
        </div>
      )}

      <div className="hidden md:flex items-center gap-1.5 flex-wrap mt-1.5">
        <Chip>{task.timeframe_group}</Chip>
        {task.items.length > 0 && <Chip>{itemsDone}/{task.items.length}</Chip>}
        {task.milestone_tag !== 'general' && (
          <Chip fg="var(--accent-text)" bg="var(--accent-light)">{categoryLabel(task.milestone_tag)}</Chip>
        )}
        {task.is_recurring && <Chip>recurring</Chip>}
        {task.is_client_added && <Chip>Added by you</Chip>}
      </div>
    </div>
  )
}

function DraggableCard({ task, onOpen }: { task: Task; onOpen: (task: Task) => void }) {
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

// ── Grouped list ─────────────────────────────────────────────────────────────

function GroupedTasks({
  status, tasks, isExpanded, onToggleGroup, renderCard,
}: {
  status: WorkPlanTaskStatus
  tasks: Task[]
  isExpanded: (status: WorkPlanTaskStatus, group: string) => boolean
  onToggleGroup: (status: WorkPlanTaskStatus, group: string, next: boolean) => void
  renderCard: (task: Task) => React.ReactNode
}) {
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
              <span className="ml-auto text-[11px] text-[var(--ink-2)] tabular-nums">
                {remaining > 0 ? `${remaining} of ${groupTasks.length} left` : `${groupTasks.length} done`}
              </span>
            </button>
            {expanded && <div className="space-y-2 pb-1">{groupTasks.map(task => renderCard(task))}</div>}
          </div>
        )
      })}
    </>
  )
}

function DesktopColumn({
  status, tasks, isExpanded, onToggleGroup, onOpen,
}: {
  status: WorkPlanTaskStatus
  tasks: Task[]
  isExpanded: (status: WorkPlanTaskStatus, group: string) => boolean
  onToggleGroup: (status: WorkPlanTaskStatus, group: string, next: boolean) => void
  onOpen: (task: Task) => void
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

// ── Checklist ────────────────────────────────────────────────────────────────

function Checklist({
  items, disabled, onToggle,
}: {
  items: ClientWorkPlanTaskItem[]
  disabled: boolean
  onToggle: (item: ClientWorkPlanTaskItem) => void
}) {
  if (items.length === 0) return null
  const done = items.filter(i => i.is_done).length

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-[var(--ink-2)] uppercase tracking-wide">
        Steps <span className="tabular-nums normal-case">{done}/{items.length}</span>
      </p>
      {items.map(item => (
        <label
          key={item.id}
          className={[
            'flex items-start gap-2.5 py-1.5 px-2 -mx-2 rounded-lg',
            disabled ? '' : 'cursor-pointer hover:bg-[var(--surface)]',
          ].join(' ')}
        >
          <input
            type="checkbox"
            checked={item.is_done}
            disabled={disabled}
            onChange={() => onToggle(item)}
            className="mt-0.5 shrink-0 w-4 h-4 rounded accent-[var(--green)]"
          />
          <span className={[
            'text-sm leading-snug',
            item.is_done ? 'text-[var(--ink-3)] line-through' : 'text-[var(--ink-2)]',
          ].join(' ')}>
            {item.title}
          </span>
        </label>
      ))}
    </div>
  )
}

// ── The client's notes, autosaved ────────────────────────────────────────────

function ClientNotes({ task, disabled }: { task: Task; disabled: boolean }) {
  const [value, setValue] = useState(task.client_note ?? '')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef(task.client_note ?? '')

  // Re-seed when the sheet opens on a different task.
  useEffect(() => {
    setValue(task.client_note ?? '')
    lastSaved.current = task.client_note ?? ''
    setState('idle')
  }, [task.id, task.client_note])

  const save = useCallback(async (next: string) => {
    if (next === lastSaved.current) return
    setState('saving')
    const result = await setMyWorkPlanTaskClientNote(task.id, next)
    if (result.error) { setState('error'); return }
    lastSaved.current = next
    setState('saved')
  }, [task.id])

  function onChange(next: string) {
    setValue(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(next), 800)
  }

  // Flush a pending edit if the sheet closes mid-debounce.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-[var(--ink-2)] uppercase tracking-wide">Your notes</p>
        <span className="text-[11px] text-[var(--ink-2)]" aria-live="polite">
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'error' ? 'Not saved' : ''}
        </span>
      </div>
      <textarea
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current)
          void save(value)
        }}
        rows={3}
        maxLength={10000}
        placeholder="What you tried, what you want to ask about…"
        className={INPUT + ' resize-y disabled:opacity-60'}
      />
      <p className="text-[11px] text-[var(--ink-2)]">Visible to your OTB coach</p>
    </div>
  )
}

// ── Add / edit a client task ─────────────────────────────────────────────────

function TaskEditorSheet({
  initial, groupOptions, pending, onSave, onDelete, onClose,
}: {
  initial: { title: string; description: string; timeframeGroup: string }
  groupOptions: string[]
  pending: boolean
  onSave: (input: { title: string; description: string; timeframeGroup: string }) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description)
  const [group, setGroup] = useState(
    groupOptions.includes(initial.timeframeGroup) ? initial.timeframeGroup : NEW_GROUP,
  )
  const [newGroup, setNewGroup] = useState(
    groupOptions.includes(initial.timeframeGroup) ? '' : initial.timeframeGroup,
  )

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const effectiveGroup = group === NEW_GROUP ? newGroup.trim() : group
  const canSave = title.trim().length > 0 && effectiveGroup.length > 0 && !pending

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center md:justify-center" role="dialog" aria-modal="true" aria-label="Task">
      <button onClick={onClose} aria-label="Close" className="absolute inset-0 bg-black/40 cursor-default" />
      <div
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        className="relative w-full md:max-w-lg bg-[var(--canvas)] max-h-[88vh] overflow-y-auto rounded-t-2xl md:rounded-2xl border border-[var(--border)] px-5 pt-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
            {onDelete ? 'Edit your step' : 'Add a step'}
          </h3>
          <button onClick={onClose} aria-label="Close" className="p-2 -m-1 text-[var(--ink-3)] hover:text-[var(--ink)]">✕</button>
        </div>

        <div>
          <label className="block text-xs text-[var(--ink-3)] mb-1">What needs doing *</label>
          <input value={title} maxLength={200} onChange={e => setTitle(e.target.value)} className={INPUT} />
        </div>

        <div>
          <label className="block text-xs text-[var(--ink-3)] mb-1">Notes (optional)</label>
          <textarea
            value={description}
            maxLength={5000}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className={INPUT + ' resize-y'}
          />
        </div>

        <div>
          <label className="block text-xs text-[var(--ink-3)] mb-1">Group</label>
          <select value={group} onChange={e => setGroup(e.target.value)} className={INPUT}>
            {groupOptions.map(g => <option key={g} value={g}>{g}</option>)}
            <option value={NEW_GROUP}>+ New group…</option>
          </select>
          {group === NEW_GROUP && (
            <input
              value={newGroup}
              maxLength={60}
              onChange={e => setNewGroup(e.target.value)}
              placeholder="Name your group"
              className={INPUT + ' mt-2'}
            />
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
          {onDelete
            ? <button onClick={onDelete} disabled={pending} className="text-sm text-[var(--red)] hover:underline disabled:opacity-60">Delete</button>
            : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--ink-3)] hover:text-[var(--ink)]">Cancel</button>
            <button
              disabled={!canSave}
              onClick={() => onSave({ title: title.trim(), description: description.trim(), timeframeGroup: effectiveGroup })}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--accent-text)' }}
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Detail sheet / drawer ────────────────────────────────────────────────────

function TaskSheet({
  task, viewOnly, pending, onMove, onToggleItem, onEdit, onClose,
}: {
  task: Task
  viewOnly: boolean
  pending: boolean
  onMove: (task: Task, status: WorkPlanTaskStatus) => void
  onToggleItem: (task: Task, item: ClientWorkPlanTaskItem) => void
  onEdit: (task: Task) => void
  onClose: () => void
}) {
  const [dragY, setDragY] = useState(0)
  const startY = useRef<number | null>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

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
      role="dialog" aria-modal="true" aria-label={task.title}
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
          'md:rounded-none md:max-w-md md:h-full md:max-h-none md:border-t-0 md:border-l',
        ].join(' ')}
      >
        <div
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
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
              <Chip fg="var(--accent-text)" bg="var(--accent-light)">{categoryLabel(task.milestone_tag)}</Chip>
            )}
            {task.is_recurring && <Chip>recurring</Chip>}
            {task.is_client_added && <Chip>Added by you</Chip>}
          </div>

          {task.description && (
            <p className="text-sm text-[var(--ink-2)] whitespace-pre-wrap leading-relaxed">{task.description}</p>
          )}
          {/* Only when the step carries nothing else — a checklist IS the detail. */}
          {!task.description && task.items.length === 0 && (
            <p className="text-sm text-[var(--ink-3)]">No further detail on this step.</p>
          )}

          <Checklist
            items={task.items}
            disabled={viewOnly}
            onToggle={item => onToggleItem(task, item)}
          />

          {(task.links ?? []).length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-xs text-[var(--ink-2)] uppercase tracking-wide">Links</p>
              {task.links.map((l, i) => (
                <a
                  key={`${l.url}-${i}`}
                  href={l.url}
                  target={l.internal ? undefined : '_blank'}
                  rel={l.internal ? undefined : 'noreferrer'}
                  title={l.url}
                  className="block text-sm text-[var(--accent-text)] hover:underline break-words"
                >
                  {linkLabel(l)}{l.internal ? '' : ' ↗'}
                </a>
              ))}
            </div>
          )}

          <ClientNotes task={task} disabled={viewOnly} />

          <div className="pt-2 border-t border-[var(--border)] space-y-2">
            <p className="text-xs text-[var(--ink-2)] uppercase tracking-wide">Move to</p>
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
              <p className="text-xs text-[var(--ink-3)]">View only — you can&apos;t change steps while viewing as this studio.</p>
            )}
            {task.is_client_added && !viewOnly && (
              <button onClick={() => onEdit(task)} className="text-sm text-[var(--accent-text)] hover:underline">
                Edit or delete this step
              </button>
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
  tasks: Task[]
  viewOnly: boolean
  extraPublishedCount: number
  loadError: string | null
}) {
  const router = useRouter()
  const { toast, showToast } = useToast(2500)
  const [tasks, setTasks] = useState(initialTasks)
  const [activeTab, setActiveTab] = useState<WorkPlanTaskStatus>('todo')
  const [open, setOpen] = useState<Task | null>(null)
  const [editing, setEditing] = useState<Task | null>(null)
  const [adding, setAdding] = useState(false)
  const [dragging, setDragging] = useState<Task | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [overrides, setOverrides] = useState<Record<string, boolean>>({ ...groupOverrides })
  const [isPending, startTransition] = useTransition()

  // Server data wins after a refresh.
  useEffect(() => { setTasks(initialTasks) }, [initialTasks])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  const byStatus = (s: WorkPlanTaskStatus) => tasks.filter(t => t.status === s)
  const done = byStatus('done').length
  const pct = completionPercent(done, tasks.length)

  // Standard groups plus whatever this plan already uses, in display order.
  const groupOptions = Array.from(new Set([...TIMEFRAME_ORDER, ...orderTimeframeGroups(tasks)]))

  /**
   * Which group opens by default, per column — computed ONCE from the data this
   * component mounted with. Deriving it on every render made moving a card
   * change the answer, which collapsed the destination column's open group.
   */
  const [defaultOpenGroup] = useState<Record<WorkPlanTaskStatus, string | null>>(() => {
    const compute = (status: WorkPlanTaskStatus) => {
      const groups = groupTasksByTimeframe(initialTasks.filter(t => t.status === status))
      const firstUnfinished = groups.find(g => g.tasks.some(t => t.status !== 'done'))
      return (firstUnfinished ?? groups[0])?.group ?? null
    }
    return { todo: compute('todo'), doing: compute('doing'), done: compute('done') }
  })

  function isExpanded(status: WorkPlanTaskStatus, group: string) {
    return overrides[`${status}:${group}`] ?? group === defaultOpenGroup[status]
  }

  function onToggleGroup(status: WorkPlanTaskStatus, group: string, next: boolean) {
    groupOverrides[`${status}:${group}`] = next
    setOverrides({ ...groupOverrides })
  }

  /** Every mutation funnels through here so failures revert the same way. */
  function run(
    optimistic: () => void,
    action: () => Promise<{ error: string | null }>,
    successMessage?: string,
  ) {
    const previous = tasks
    optimistic()
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) {
        setTasks(previous)
        showToast(result.error, 'error')
        return
      }
      if (successMessage) showToast(successMessage)
      router.refresh()
    })
  }

  function moveTask(task: Task, target: WorkPlanTaskStatus, closeSheet = false) {
    if (task.status === target) return
    if (closeSheet) setOpen(null)
    run(
      () => setTasks(ts => ts.map(t => (t.id === task.id ? { ...t, status: target, is_done: target === 'done' } : t))),
      () => setMyWorkPlanTaskStatus(task.id, target),
      `Moved to ${STATUS_STYLE[target].label}`,
    )
  }

  function toggleItem(task: Task, item: ClientWorkPlanTaskItem) {
    const next = !item.is_done
    run(
      () => setTasks(ts => ts.map(t => (
        t.id === task.id
          ? { ...t, items: t.items.map(i => (i.id === item.id ? { ...i, is_done: next } : i)) }
          : t
      ))),
      () => setMyWorkPlanTaskItemDone(item.id, next),
    )
  }

  /** Provisional rows have no server id yet, so they are not openable. */
  function openTask(task: Task) {
    if (task.id.startsWith('temp-')) return
    setOpen(task)
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

  const columns = (
    <div className="grid grid-cols-3 gap-4">
      {TASK_STATUSES.map(({ value }) => (
        <DesktopColumn
          key={value}
          status={value}
          tasks={byStatus(value)}
          isExpanded={isExpanded}
          onToggleGroup={onToggleGroup}
          onOpen={openTask}
        />
      ))}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
              {plan.title}
            </h2>
            <p className="text-sm text-[var(--ink-2)] mt-0.5 tabular-nums">
              {done}/{tasks.length} done ({pct}%)
            </p>
          </div>
          <div className="flex items-center gap-2">
            {viewOnly
              ? <Chip>View only</Chip>
              : (
                <button
                  onClick={() => setAdding(true)}
                  className="px-3 py-2 rounded-xl text-sm font-medium text-white"
                  style={{ background: 'var(--accent-text)' }}
                >
                  + Add step
                </button>
              )}
          </div>
        </div>

        <div
          className="mt-3 max-w-md rounded-full overflow-hidden"
          style={{ height: 6, background: 'var(--surface-2)' }}
          role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
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
          {/* Mobile: sticky tabs, one column at a time */}
          <div className="md:hidden">
            <div
              className="sticky top-14 z-20 -mx-4 px-4 py-2 border-b"
              style={{ background: 'var(--canvas)', borderColor: 'var(--border)' }}
            >
              <div role="tablist" aria-label="Board column" className="grid grid-cols-3 gap-1 p-1 rounded-xl" style={{ background: 'var(--surface)' }}>
                {TASK_STATUSES.map(({ value }) => {
                  const s = STATUS_STYLE[value]
                  const selected = activeTab === value
                  return (
                    <button
                      key={value}
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setActiveTab(value)}
                      className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors min-h-[40px]"
                      style={{ background: selected ? s.bg : 'transparent', color: selected ? s.fg : 'var(--ink-3)' }}
                    >
                      {s.label}
                      <span className="tabular-nums opacity-70">{byStatus(value).length}</span>
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
                renderCard={task => <CardShell key={task.id} task={task} onOpen={openTask} />}
              />
            </div>
          </div>

          {/* Desktop: three drag-and-drop columns */}
          <div className="hidden md:block">
            {viewOnly ? columns : (
              <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                {columns}
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
          onToggleItem={toggleItem}
          onEdit={task => { setOpen(null); setEditing(task) }}
          onClose={() => setOpen(null)}
        />
      )}

      {adding && (
        <TaskEditorSheet
          initial={{ title: '', description: '', timeframeGroup: BRAIN_DUMP_GROUP }}
          groupOptions={groupOptions}
          pending={isPending}
          onClose={() => setAdding(false)}
          onSave={input => {
            setAdding(false)
            const previous = tasks
            const now = new Date().toISOString()
            // Provisional row so the card appears immediately. The id is replaced
            // by the server's on refresh; cards carrying one are not openable.
            const provisional: Task = {
              id: `temp-${now}`,
              work_plan_id: plan.id,
              title: input.title,
              description: input.description || null,
              timeframe_group: input.timeframeGroup,
              week_number: null,
              is_recurring: false,
              starts_after_week: null,
              sort_order: Number.MAX_SAFE_INTEGER,
              milestone_tag: 'general',
              links: [],
              status: 'todo',
              is_done: false,
              done_at: null,
              client_note: null,
              is_client_added: true,
              created_at: now,
              updated_at: now,
              items: [],
            }
            setTasks(ts => [...ts, provisional])
            setError(null)
            startTransition(async () => {
              const result = await createMyWorkPlanTask({ planId: plan.id, ...input })
              if (result.error) {
                setTasks(previous)
                showToast(result.error, 'error')
                return
              }
              showToast('Step added')
              router.refresh()
            })
          }}
        />
      )}

      {editing && (
        <TaskEditorSheet
          initial={{
            title: editing.title,
            description: editing.description ?? '',
            timeframeGroup: editing.timeframe_group,
          }}
          groupOptions={groupOptions}
          pending={isPending}
          onClose={() => setEditing(null)}
          onSave={input => {
            const target = editing
            setEditing(null)
            run(
              () => setTasks(ts => ts.map(t => (
                t.id === target.id
                  ? { ...t, title: input.title, description: input.description || null, timeframe_group: input.timeframeGroup }
                  : t
              ))),
              () => updateMyWorkPlanTask({ taskId: target.id, ...input }),
              'Step updated',
            )
          }}
          onDelete={() => {
            const target = editing
            setEditing(null)
            run(
              () => setTasks(ts => ts.filter(t => t.id !== target.id)),
              () => deleteMyWorkPlanTask(target.id),
              'Step deleted',
            )
          }}
        />
      )}

      <Toast toast={toast} />
    </div>
  )
}
