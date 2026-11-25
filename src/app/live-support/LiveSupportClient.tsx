'use client'

import { pastSessions, upcomingSessions, type LssSessionSummary } from '@/lib/live-support'
import JoinButton from '@/components/live-support/JoinButton'
import { fmtLocalDateTime, useNow } from '@/components/live-support/useNow'

function SessionMeta({ session, now }: { session: LssSessionSummary; now: Date | null }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-[var(--ink)]">{session.title}</p>
      <p className="text-xs text-[var(--ink-3)] mt-0.5">
        {now ? fmtLocalDateTime(session.starts_at) : ' '}
        {session.coach_names ? ` · with ${session.coach_names}` : ''}
      </p>
      {session.description && <p className="text-sm text-[var(--ink-2)] mt-1.5 whitespace-pre-line">{session.description}</p>}
    </div>
  )
}

const linkClass = 'text-sm text-[var(--accent-text)] hover:underline'

export default function LiveSupportClient({ sessions }: { sessions: LssSessionSummary[] }) {
  const now = useNow(60_000)
  // The upcoming/past split depends on the clock, so it is made in the browser
  // only (now is null during server render and hydration).
  const upcoming = now ? upcomingSessions(sessions, now) : []
  const past = now ? pastSessions(sessions, now) : []

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>Live Support</h1>
        <p className="text-sm text-[var(--ink-3)] mt-0.5">Group calls with the OTB coaches. Times are shown in your local time zone.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--ink-3)]">Upcoming</h2>
        {now && upcoming.length === 0 && <p className="text-sm text-[var(--ink-3)]">No sessions scheduled yet — check back soon.</p>}
        {upcoming.map(s => (
          <div key={s.id} className="rounded-xl border border-[var(--ink)]/8 bg-[var(--surface)] p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <SessionMeta session={s} now={now} />
            <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
              <JoinButton session={s} />
              {s.facebook_event_url && (
                <a href={s.facebook_event_url} target="_blank" rel="noopener noreferrer" className={linkClass}>Facebook event ↗</a>
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--ink-3)]">Past sessions</h2>
        {now && past.length === 0 && <p className="text-sm text-[var(--ink-3)]">No past sessions yet.</p>}
        {past.map(s => (
          <div key={s.id} className="rounded-xl border border-[var(--ink)]/8 bg-[var(--surface)] p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <SessionMeta session={s} now={now} />
            {s.recording_url
              ? <a href={s.recording_url} target="_blank" rel="noopener noreferrer" className={`${linkClass} shrink-0`}>Watch recording ↗</a>
              : <span className="text-xs text-[var(--ink-3)] shrink-0">Recording coming soon</span>}
          </div>
        ))}
      </section>
    </div>
  )
}
