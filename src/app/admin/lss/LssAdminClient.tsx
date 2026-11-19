'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createLssSession, deleteLssSession, saveZoomJoinUrl, updateLssSession } from '@/app/actions/lss'
import {
  buildFacebookPrompt,
  fmtChicagoDate,
  fmtChicagoTime,
  pastSessions,
  sessionEnd,
  upcomingSessions,
  utcToChicagoInputs,
  type LssSessionSummary,
} from '@/lib/live-support'

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]'
const labelClass = 'block text-xs mb-1 text-[var(--ink-3)]'
const primaryBtn =
  'px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity bg-[var(--accent-text)]'
const secondaryBtn =
  'px-3 py-1.5 rounded-lg text-xs border border-[var(--ink)]/15 hover:border-[var(--ink)]/30 transition-colors text-[var(--ink-2)]'

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--red)', background: 'rgba(122,40,40,0.1)' }}>
      {message}
    </p>
  )
}

// ─── Zoom link ───────────────────────────────────────────────────────────────

function ZoomLinkCard({ maskedZoomUrl }: { maskedZoomUrl: string | null }) {
  const router = useRouter()
  const [editing, setEditing] = useState(!maskedZoomUrl)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    setError(null)
    startTransition(async () => {
      const res = await saveZoomJoinUrl(value)
      if (res.error) { setError(res.error); return }
      setValue('')
      setEditing(false)
      router.refresh()
    })
  }

  return (
    <section className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 p-5 space-y-3">
      <div>
        <h3 className="text-sm font-medium text-[var(--ink)]">Zoom join link</h3>
        <p className="text-xs text-[var(--ink-3)] mt-0.5">
          One link for every session. Members never see it — they go through /lss/join, which redirects Scale and Lifetime only.
        </p>
      </div>

      {!editing && maskedZoomUrl ? (
        <div className="flex flex-wrap items-center gap-3">
          <code className="text-sm px-3 py-2 rounded-lg bg-[var(--canvas)] text-[var(--ink-2)]">{maskedZoomUrl}</code>
          <button type="button" className={secondaryBtn} onClick={() => setEditing(true)}>Replace link</button>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="url"
            autoComplete="off"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="https://us02web.zoom.us/j/…"
            className={inputClass}
          />
          <div className="flex gap-2 shrink-0">
            <button type="button" className={primaryBtn} disabled={pending || !value.trim()} onClick={save}>
              {pending ? 'Saving…' : 'Save link'}
            </button>
            {maskedZoomUrl && (
              <button type="button" className={secondaryBtn} onClick={() => { setEditing(false); setValue(''); setError(null) }}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
      <ErrorNote message={error} />
    </section>
  )
}

// ─── Session form ────────────────────────────────────────────────────────────

function SessionForm({
  session,
  onDone,
}: {
  session?: LssSessionSummary
  onDone: () => void
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const start = session ? utcToChicagoInputs(session.starts_at) : { date: '', time: '' }

  function submit(form: FormData) {
    setError(null)
    startTransition(async () => {
      const res = session ? await updateLssSession(session.id, form) : await createLssSession(form)
      if (res.error) { setError(res.error); return }
      onDone()
      router.refresh()
    })
  }

  return (
    <form action={submit} className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 p-5 space-y-4">
      <h3 className="text-sm font-medium text-[var(--ink)]">{session ? 'Edit session' : 'New session'}</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Title *</label>
          <input name="title" required defaultValue={session?.title ?? 'Live Support Session'} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Coaches</label>
          <input name="coach_names" defaultValue={session?.coach_names ?? ''} placeholder="e.g. Isak & Kelly" className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Date (Central) *</label>
          <input type="date" name="date" required defaultValue={start.date} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Start time (America/Chicago) *</label>
          <input type="time" name="time" required defaultValue={start.time} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Duration (minutes)</label>
          <input type="number" name="duration_minutes" min={1} max={600} defaultValue={session?.duration_minutes ?? 60} className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Description</label>
        <textarea name="description" rows={3} defaultValue={session?.description ?? ''} className={inputClass} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Facebook event URL</label>
          <input type="url" name="facebook_event_url" defaultValue={session?.facebook_event_url ?? ''} placeholder="https://www.facebook.com/events/…" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Recording URL (Facebook video)</label>
          <input type="url" name="recording_url" defaultValue={session?.recording_url ?? ''} placeholder="https://www.facebook.com/…/videos/…" className={inputClass} />
        </div>
      </div>

      <ErrorNote message={error} />

      <div className="flex items-center gap-3 pt-1">
        <button type="submit" disabled={pending} className={primaryBtn}>
          {pending ? 'Saving…' : session ? 'Save changes' : 'Add session'}
        </button>
        <button type="button" onClick={onDone} className="px-4 py-2 rounded-lg text-sm border border-[var(--ink)]/15 hover:border-[var(--ink)]/30 transition-colors text-[var(--ink-2)]">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ─── Session row ─────────────────────────────────────────────────────────────

function SessionRow({ session }: { session: LssSessionSummary }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (editing) return <SessionForm session={session} onDone={() => setEditing(false)} />

  const start = new Date(session.starts_at)
  const end = sessionEnd(session)

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(buildFacebookPrompt(session))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError("Couldn't copy to the clipboard.")
    }
  }

  function remove() {
    if (!confirm(`Delete “${session.title}” on ${fmtChicagoDate(start)}? This can't be undone.`)) return
    setError(null)
    startTransition(async () => {
      const res = await deleteLssSession(session.id)
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border border-[var(--ink)]/8 bg-[var(--surface)] p-4 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--ink)]">{session.title}</p>
          <p className="text-xs text-[var(--ink-3)] mt-0.5">
            {fmtChicagoDate(start)} · {fmtChicagoTime(start)}–{fmtChicagoTime(end)} Central
            {session.coach_names ? ` · ${session.coach_names}` : ''}
          </p>
          <div className="flex flex-wrap gap-3 mt-1.5 text-xs">
            {session.facebook_event_url
              ? <a href={session.facebook_event_url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-text)] hover:underline">Facebook event ↗</a>
              : <span className="text-[var(--ink-3)]">No Facebook event yet</span>}
            {session.recording_url && (
              <a href={session.recording_url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-text)] hover:underline">Recording ↗</a>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button type="button" className={secondaryBtn} onClick={copyPrompt}>
            {copied ? 'Copied ✓' : 'Copy Facebook prompt'}
          </button>
          <button type="button" className={secondaryBtn} onClick={() => setEditing(true)}>Edit</button>
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="px-3 py-1.5 rounded-lg text-xs border border-[var(--red)]/20 hover:bg-[var(--red-l)] disabled:opacity-50 transition-colors text-[var(--ink-2)]"
          >
            Delete
          </button>
        </div>
      </div>
      <ErrorNote message={error} />
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LssAdminClient({
  sessions,
  maskedZoomUrl,
}: {
  sessions: LssSessionSummary[]
  maskedZoomUrl: string | null
}) {
  const [adding, setAdding] = useState(false)
  const [now] = useState(() => new Date())
  const upcoming = upcomingSessions(sessions, now)
  const past = pastSessions(sessions, now)

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>Live Support Sessions</h2>
          <p className="text-sm text-[var(--ink-3)] mt-0.5">All times are America/Chicago (Central).</p>
        </div>
        {!adding && <button type="button" className={primaryBtn} onClick={() => setAdding(true)}>+ New session</button>}
      </div>

      <ZoomLinkCard maskedZoomUrl={maskedZoomUrl} />

      {adding && <SessionForm onDone={() => setAdding(false)} />}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-[var(--ink-3)]">Upcoming ({upcoming.length})</h3>
        {upcoming.length === 0
          ? <p className="text-sm text-[var(--ink-3)]">No upcoming sessions.</p>
          : upcoming.map(s => <SessionRow key={s.id} session={s} />)}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-[var(--ink-3)]">Past ({past.length})</h3>
        {past.length === 0
          ? <p className="text-sm text-[var(--ink-3)]">No past sessions.</p>
          : past.map(s => <SessionRow key={s.id} session={s} />)}
      </section>
    </div>
  )
}
