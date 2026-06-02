'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { getUnreadReminders, markReminderRead } from '@/app/actions/reminders'
import type { Reminder } from '@/app/actions/reminders'

const TYPE_LABELS: Record<Reminder['type'], string> = {
  cadence_weekly:     'Weekly Check-In',
  data_recap_monthly: 'Monthly Recap',
  admin_manual:       'From OTB Team',
}

function BellIcon({ hasBadge }: { hasBadge: boolean }) {
  return (
    <div className="relative">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        <path
          d="M9 2a5 5 0 00-5 5v3l-1.5 2H15.5L14 10V7a5 5 0 00-5-5z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path d="M7 14a2 2 0 004 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      {hasBadge && (
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold leading-none bg-[var(--accent-text)] text-[var(--canvas)]">
          !
        </span>
      )}
    </div>
  )
}

export default function NotificationBell() {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getUnreadReminders().then(setReminders)
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function dismiss(id: string) {
    setReminders(prev => prev.filter(r => r.id !== id))
    startTransition(async () => {
      await markReminderRead(id)
    })
  }

  function dismissAll() {
    const ids = reminders.map(r => r.id)
    setReminders([])
    startTransition(async () => {
      await Promise.all(ids.map(markReminderRead))
    })
  }

  if (reminders.length === 0) {
    return (
      <button
        aria-label="Notifications"
        className="flex items-center justify-center w-8 h-8 text-[var(--ink)]/30 hover:text-[var(--ink)]/55 transition-colors"
        disabled
      >
        <BellIcon hasBadge={false} />
      </button>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={`${reminders.length} unread notification${reminders.length !== 1 ? 's' : ''}`}
        className="flex items-center justify-center w-8 h-8 text-[var(--ink)]/70 hover:text-[var(--ink)] transition-colors"
      >
        <BellIcon hasBadge />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-50 w-80 rounded-xl shadow-lg overflow-hidden"
          style={{
            background: 'var(--surface)',
            border: '1px solid rgba(255,248,240,0.12)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
              Reminders
            </span>
            {reminders.length > 1 && (
              <button
                onClick={dismissAll}
                disabled={isPending}
                className="text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
              >
                Dismiss all
              </button>
            )}
          </div>

          {/* List */}
          <ul className="max-h-72 overflow-y-auto divide-y divide-white/6">
            {reminders.map(r => (
              <li key={r.id} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <span
                    className="inline-block mb-1 px-1.5 py-px rounded text-[10px] font-semibold leading-tight"
                    style={{ background: 'var(--accent-l)', color: 'var(--accent-text)' }}
                  >
                    {TYPE_LABELS[r.type]}
                  </span>
                  {r.message && (
                    <p className="text-xs text-[var(--ink-2)] leading-relaxed">{r.message}</p>
                  )}
                </div>
                <button
                  onClick={() => dismiss(r.id)}
                  disabled={isPending}
                  aria-label="Dismiss"
                  className="shrink-0 mt-0.5 text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <path d="M3 3l8 8M11 3L3 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
