'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ignoreCalendarEvent,
  importCalendarEvent,
  listSyncTargets,
  recordSyncSummary,
  reviewCalendarEvents,
  saveGoogleCalendarId,
  saveInviteSendUpdates,
  saveInviteWindowDays,
  syncOneSession,
  type GoogleStatus,
  type ReviewEvent,
} from '@/app/actions/lss-calendar'
import type { LssSendUpdates } from '@/types/database'

export interface CoachOption {
  id: string
  first_name: string
}

const card = 'bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 p-5 space-y-3'
const inputClass =
  'w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]'
const primaryBtn =
  'px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity bg-[var(--accent-text)]'
const secondaryBtn =
  'px-3 py-1.5 rounded-lg text-xs border border-[var(--ink)]/15 hover:border-[var(--ink)]/30 disabled:opacity-50 transition-colors text-[var(--ink-2)]'

function Note({ tone, children }: { tone: 'error' | 'ok' | 'muted'; children: React.ReactNode }) {
  const style =
    tone === 'error' ? { color: 'var(--red)', background: 'rgba(122,40,40,0.1)' }
    : tone === 'ok' ? { color: 'var(--green)', background: 'rgba(45,90,61,0.12)' }
    : { color: 'var(--ink-3)', background: 'transparent' }
  return <p className="text-xs px-3 py-2 rounded-lg whitespace-pre-wrap break-words" style={style}>{children}</p>
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

// ─── Connection ──────────────────────────────────────────────────────────────

const SEND_UPDATES_LABEL: Record<LssSendUpdates, string> = {
  none: 'none — Google sends no emails',
  externalOnly: 'externalOnly — email only non-Google-Calendar guests',
  all: 'all — email every newly added guest (recommended)',
}

export function GoogleConnectionCard({ status, flash }: { status: GoogleStatus; flash: { error?: string; connected?: boolean } }) {
  const router = useRouter()
  const [calId, setCalId] = useState(status.calendarId ?? '')
  const [mode, setMode] = useState<LssSendUpdates>(status.sendUpdates)
  const [windowDays, setWindowDays] = useState(String(status.inviteWindowDays))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save(fn: () => Promise<{ error: string | null }>) {
    setError(null)
    startTransition(async () => {
      const r = await fn()
      if (r.error) setError(r.error)
      else router.refresh()
    })
  }

  return (
    <section className={card}>
      <div>
        <h3 className="text-sm font-medium text-[var(--ink)]">Google Calendar</h3>
        <p className="text-xs text-[var(--ink-3)] mt-0.5">
          Invites go out from the shared calendar, sent by {status.expectedAccount}. Clients never see other guests, coach emails or the Zoom link.
        </p>
      </div>

      {flash.error && <Note tone="error">Google connection failed: {flash.error}</Note>}
      {flash.connected && <Note tone="ok">Google account connected.</Note>}

      {!status.configured ? (
        <Note tone="error">GOOGLE_LSS_CLIENT_ID / GOOGLE_LSS_CLIENT_SECRET / GOOGLE_LSS_REDIRECT_URI are not set on this deployment.</Note>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <a href="/api/auth/google-lss" className={primaryBtn}>
            {status.connected ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}
          </a>
          {status.connected && (
            <span className="text-xs text-[var(--ink-3)]">Connected as {status.accountEmail ?? 'unknown account'}</span>
          )}
        </div>
      )}

      {status.wrongAccount && (
        <Note tone="error">
          Connected as {status.accountEmail ?? 'an unknown account'}, but invites must come from {status.expectedAccount}.
          Nothing will be sent until you reconnect as {status.expectedAccount}.
        </Note>
      )}

      {status.connected && !status.wrongAccount && (
        status.testError
          ? <Note tone="error">Calendar test failed: {status.testError}</Note>
          : status.calendarTitle
            ? <Note tone="ok">Connected to: {status.calendarTitle}</Note>
            : null
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <label className="block text-xs mb-1 text-[var(--ink-3)]">Calendar ID</label>
          <input value={calId} onChange={e => setCalId(e.target.value)} className={inputClass} />
        </div>
        <button type="button" className={secondaryBtn} disabled={pending || calId.trim() === (status.calendarId ?? '')}
          onClick={() => save(() => saveGoogleCalendarId(calId))}>
          Save ID
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <label className="block text-xs mb-1 text-[var(--ink-3)]">Invite emails for newly added guests (sendUpdates)</label>
          <select value={mode} onChange={e => setMode(e.target.value as LssSendUpdates)} className={inputClass}>
            {(Object.keys(SEND_UPDATES_LABEL) as LssSendUpdates[]).map(k => (
              <option key={k} value={k}>{SEND_UPDATES_LABEL[k]}</option>
            ))}
          </select>
          <p className="text-[11px] text-[var(--ink-3)] mt-1">Removals are always silent (sendUpdates=none).</p>
        </div>
        <button type="button" className={secondaryBtn} disabled={pending || mode === status.sendUpdates}
          onClick={() => save(() => saveInviteSendUpdates(mode))}>
          Save
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <label className="block text-xs mb-1 text-[var(--ink-3)]">Invite window (days)</label>
          <input type="number" min={1} max={365} value={windowDays} onChange={e => setWindowDays(e.target.value)} className={inputClass} />
          <p className="text-[11px] text-[var(--ink-3)] mt-1">
            Clients are added to sessions starting within this many days; the nightly sync adds them as sessions come into range.
            Hosts are always added. Removals apply to every upcoming session.
          </p>
        </div>
        <button type="button" className={secondaryBtn} disabled={pending || Number(windowDays) === status.inviteWindowDays}
          onClick={() => save(() => saveInviteWindowDays(Number(windowDays)))}>
          Save
        </button>
      </div>

      {error && <Note tone="error">{error}</Note>}
    </section>
  )
}

// ─── Review & import ─────────────────────────────────────────────────────────

function ReviewRow({ ev, coaches, onDone }: { ev: ReviewEvent; coaches: CoachOption[]; onDone: (msg: string) => void }) {
  const [hostIds, setHostIds] = useState<string[]>(ev.matchedCoachIds)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const names = hostIds.map(id => coaches.find(c => c.id === id)?.first_name).filter((n): n is string => !!n)
  const summary = names.length ? `OTB Live Support Session with ${joinNames(names)}` : 'OTB Live Support Session'

  function toggle(id: string) {
    setHostIds(h => (h.includes(id) ? h.filter(x => x !== id) : [...h, id]))
  }

  return (
    <div className="rounded-lg border border-[var(--ink)]/10 p-4 space-y-2">
      <div className="flex flex-wrap justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-[var(--ink)]">{ev.whenLabel} <span className="text-[var(--ink-3)]">· {ev.durationMinutes} min{ev.timeZone ? ` · event tz ${ev.timeZone}` : ''}</span></p>
          <p className="text-xs text-[var(--ink-3)]">Current title: {ev.title}</p>
        </div>
        {ev.hasZoomLink && <span className="text-[11px] px-2 py-0.5 h-fit rounded bg-[var(--amber)]/20 text-[var(--ink-2)]">contains zoom.us link</span>}
      </div>

      <div className="text-xs text-[var(--ink-2)]">
        Guests: {ev.guests.length === 0 ? 'none' : ev.guests.map(g => (
          <span key={g.email} className="mr-2">{g.email}{g.coachName ? ` (${g.coachName})` : ''}</span>
        ))}
      </div>
      {ev.unknownGuests.length > 0 && (
        <Note tone="error">Not in the coach list: {ev.unknownGuests.join(', ')}</Note>
      )}

      <div className="flex flex-wrap gap-3 text-xs text-[var(--ink-2)]">
        Hosts:
        {coaches.map(c => (
          <label key={c.id} className="inline-flex items-center gap-1">
            <input type="checkbox" checked={hostIds.includes(c.id)} onChange={() => toggle(c.id)} /> {c.first_name}
          </label>
        ))}
      </div>

      <div className="text-xs rounded-lg bg-[var(--canvas)] p-3 space-y-1 text-[var(--ink-2)]">
        <p><span className="text-[var(--ink-3)]">New title:</span> {summary}</p>
        <p className="whitespace-pre-wrap"><span className="text-[var(--ink-3)]">New description:</span> {ev.proposed.description}</p>
        <p><span className="text-[var(--ink-3)]">New location:</span> {ev.proposed.location}</p>
        <p className="text-[var(--ink-3)]">Start/end/time zone and guests stay as they are. Google sends no emails (sendUpdates=none).</p>
      </div>

      {error && <Note tone="error">{error}</Note>}
      <div className="flex gap-2">
        <button type="button" className={primaryBtn} disabled={pending || hostIds.length === 0}
          onClick={() => startTransition(async () => {
            setError(null)
            const r = await importCalendarEvent(ev.id, hostIds)
            if (r.error) setError(r.error)
            else onDone(`Imported: ${r.data?.summary ?? summary} (${ev.whenLabel})`)
          })}>
          {pending ? 'Working…' : 'Import'}
        </button>
        <button type="button" className={secondaryBtn} disabled={pending}
          onClick={() => startTransition(async () => {
            setError(null)
            const r = await ignoreCalendarEvent(ev.id)
            if (r.error) setError(r.error)
            else onDone(`Ignored: ${ev.title} (${ev.whenLabel})`)
          })}>
          Ignore
        </button>
      </div>
    </div>
  )
}

export function ReviewEventsCard({ coaches, connected }: { coaches: CoachOption[]; connected: boolean }) {
  const router = useRouter()
  const [events, setEvents] = useState<ReviewEvent[] | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function load() {
    setError(null)
    startTransition(async () => {
      const r = await reviewCalendarEvents()
      if (r.error) setError(r.error)
      else setEvents(r.data ?? [])
    })
  }

  return (
    <section className={card}>
      <div>
        <h3 className="text-sm font-medium text-[var(--ink)]">Review existing calendar events</h3>
        <p className="text-xs text-[var(--ink-3)] mt-0.5">
          Events from Dec 1, 2026 onward that aren&apos;t linked yet. Nothing changes until you click Import or Ignore. Earlier events are never touched.
        </p>
      </div>
      <button type="button" className={secondaryBtn} disabled={!connected || pending} onClick={load}>
        {pending ? 'Loading…' : events ? 'Reload' : 'Review existing calendar events'}
      </button>
      {error && <Note tone="error">{error}</Note>}
      {log.map(l => <Note key={l} tone="ok">{l}</Note>)}
      {events && events.length === 0 && <Note tone="muted">No unlinked events from Dec 1, 2026 onward.</Note>}
      <div className="space-y-3">
        {events?.map(ev => (
          <ReviewRow key={ev.id} ev={ev} coaches={coaches} onDone={msg => {
            setLog(l => [...l, msg])
            setEvents(list => (list ?? []).filter(x => x.id !== ev.id))
            router.refresh()
          }} />
        ))}
      </div>
    </section>
  )
}

// ─── Sync ────────────────────────────────────────────────────────────────────

interface SyncLine {
  when: string
  title: string
  added: number
  removed: number
  total: number | null
  error: string | null
  quota: boolean
  addedList: string[]
  removedList: string[]
  outsideWindow: boolean
}

export function SyncCard({ connected, lastSync, sendUpdates }: { connected: boolean; lastSync: string | null; sendUpdates: LssSendUpdates }) {
  const router = useRouter()
  const [pauseSec, setPauseSec] = useState(30)
  const [lines, setLines] = useState<SyncLine[]>([])
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  async function run(dryRun: boolean) {
    setRunning(true)
    setLines([])
    setStatus(dryRun ? 'Previewing…' : 'Syncing…')
    const t = await listSyncTargets()
    if (t.error || !t.data) { setStatus(t.error ?? 'Could not list sessions'); setRunning(false); return }
    if (!t.data.length) { setStatus('No upcoming linked sessions.'); setRunning(false); return }

    let added = 0, removed = 0, errors = 0, stopped = false
    for (const [i, target] of t.data.entries()) {
      if (i > 0 && !dryRun && pauseSec > 0) {
        setStatus(`Pausing ${pauseSec}s before batch ${i + 1} of ${t.data.length}…`)
        await new Promise(r => setTimeout(r, pauseSec * 1000))
      }
      setStatus(`${dryRun ? 'Previewing' : 'Syncing'} batch ${i + 1} of ${t.data.length}: ${target.whenLabel}`)
      const r = await syncOneSession(target.sessionId, dryRun)
      const d = r.data
      const line: SyncLine = {
        when: target.whenLabel,
        title: target.title,
        added: d?.added.length ?? 0,
        removed: d?.removed.length ?? 0,
        total: d?.attendeeCount ?? null,
        error: r.error ?? d?.error ?? d?.skipped ?? null,
        outsideWindow: d ? !d.inWindow : false,
        quota: !!d?.quota,
        addedList: d?.added ?? [],
        removedList: d?.removed ?? [],
      }
      setLines(l => [...l, line])
      added += line.added; removed += line.removed
      if (r.error || d?.error) errors++
      if (line.quota) { stopped = true; break }
    }
    const summary = `${dryRun ? 'Preview' : 'Sync'}: ${t.data.length} sessions · +${added} −${removed}${errors ? ` · ${errors} errors` : ''}${stopped ? ' · STOPPED on quota error' : ''}`
    setStatus(summary)
    if (!dryRun) { await recordSyncSummary(summary); router.refresh() }
    setRunning(false)
  }

  return (
    <section className={card}>
      <div>
        <h3 className="text-sm font-medium text-[var(--ink)]">Send invites / sync now</h3>
        <p className="text-xs text-[var(--ink-3)] mt-0.5">
          Guests = hosts + Scale/Lifetime studio owners. One session per batch, soonest first. Stops on the first Google quota error.
          New guests are added with sendUpdates={sendUpdates}; removals are silent.
        </p>
        {lastSync && <p className="text-xs text-[var(--ink-3)] mt-1">Last sync: {lastSync}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={secondaryBtn} disabled={!connected || running} onClick={() => run(true)}>Preview changes</button>
        <button type="button" className={primaryBtn} disabled={!connected || running} onClick={() => run(false)}>Send invites / sync now</button>
        <label className="text-xs text-[var(--ink-3)] inline-flex items-center gap-1">
          Pause between batches
          <input type="number" min={0} max={600} value={pauseSec} onChange={e => setPauseSec(Number(e.target.value) || 0)}
            className="w-16 px-2 py-1 rounded border border-[var(--ink)]/15 bg-[var(--canvas)] text-[var(--ink)]" /> s
        </label>
      </div>
      {status && <Note tone={status.includes('STOPPED') ? 'error' : 'muted'}>{status}</Note>}
      {lines.length > 0 && (
        <div className="space-y-1">
          {lines.map((l, i) => (
            <details key={i} className="text-xs text-[var(--ink-2)] rounded bg-[var(--canvas)] px-3 py-2">
              <summary className="cursor-pointer">
                {l.when} — +{l.added} −{l.removed}{l.total !== null ? ` · ${l.total} guests` : ''}
                {l.outsideWindow && <span className="text-[var(--ink-3)]"> · outside invite window (hosts only)</span>}
                {l.error && <span style={{ color: 'var(--red)' }}> · {l.quota ? 'QUOTA: ' : ''}{l.error}</span>}
              </summary>
              {l.addedList.length > 0 && <p className="mt-1">Added: {l.addedList.join(', ')}</p>}
              {l.removedList.length > 0 && <p className="mt-1">Removed: {l.removedList.join(', ')}</p>}
            </details>
          ))}
        </div>
      )}
    </section>
  )
}
