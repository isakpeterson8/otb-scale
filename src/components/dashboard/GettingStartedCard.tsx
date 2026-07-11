'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Check, X, ChevronRight } from 'lucide-react'

const STORAGE_KEY = 'otb_gs_v1'

const STEPS = [
  { label: 'Watch the welcome & orientation videos', desc: 'How it works, who we are, and how to get support',               href: '/education/orientation' },
  { label: 'Explore the education library',          desc: 'Watch videos. For document resources, toggle over to resources.', href: '/education' },
  { label: 'Add your students and contacts',         desc: 'Your pipeline and history live here',                             href: '/contacts' },
  { label: 'Add a school to your outreach pipeline', desc: 'Start building your path to more students',                      href: '/school-outreach' },
  { label: 'Complete your first cadence check-in',   desc: 'Five weekly questions that keep your growth on track',           href: '/cadence' },
  { label: 'Add your monthly recap in financials',   desc: 'Log enrollment and revenue so your dashboard shows real numbers', href: '/financials' },
] as const

interface StoredState {
  dismissed: boolean
  checked: number[]
}

function loadState(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as StoredState
  } catch {}
  return { dismissed: false, checked: [] }
}

function saveState(state: StoredState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {}
}

export default function GettingStartedCard() {
  const [mounted, setMounted] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [checked, setChecked] = useState<Set<number>>(new Set())

  useEffect(() => {
    const state = loadState()
    setDismissed(state.dismissed)
    setChecked(new Set(state.checked))
    setMounted(true)
  }, [])

  // Auto-dismiss on next visit once all steps are completed
  useEffect(() => {
    if (mounted && checked.size === STEPS.length) {
      saveState({ dismissed: true, checked: Array.from(checked) })
    }
  }, [mounted, checked])

  if (!mounted || dismissed) return null

  const n = checked.size
  const total = STEPS.length
  const allDone = n === total
  const pct = Math.round((n / total) * 100)

  function toggle(i: number, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const next = new Set(checked)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setChecked(next)
    saveState({ dismissed, checked: Array.from(next) })
  }

  function dismiss() {
    setDismissed(true)
    saveState({ dismissed: true, checked: Array.from(checked) })
  }

  return (
    <div className="bg-white rounded-2xl border mb-6 p-5" style={{ borderColor: 'var(--border-s)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Getting started</p>
        <div className="flex items-center gap-2">
          <span
            className="text-xs rounded-full px-2.5 py-0.5 font-medium"
            style={{ background: 'var(--accent-l)', color: 'var(--accent-text)' }}
          >
            {n} of {total}
          </span>
          {n >= 2 && (
            <button
              onClick={dismiss}
              className="flex items-center justify-center w-6 h-6 rounded transition-colors hover:bg-black/5"
              style={{ color: 'var(--ink-3)' }}
              aria-label="Dismiss getting started checklist"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full mb-4 overflow-hidden" style={{ background: 'var(--border)' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: 'var(--accent)',
            transition: 'width 0.4s cubic-bezier(.4,0,.2,1)',
          }}
        />
      </div>

      {/* Completion state */}
      {allDone ? (
        <div className="text-center py-2">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center mx-auto mb-2"
            style={{ background: 'var(--green-l)', color: 'var(--green)' }}
          >
            <Check size={18} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>All set</p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
            This card won't appear on your next visit.
          </p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {STEPS.map(({ label, desc, href }, i) => {
            const isDone = checked.has(i)
            return (
              <Link
                key={i}
                href={href}
                className="flex items-center gap-3 px-2 py-2 rounded-lg group transition-colors hover:bg-black/[0.03]"
              >
                {/* Checkbox */}
                <button
                  onClick={(e) => toggle(i, e)}
                  className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded transition-all"
                  style={{
                    border: isDone ? 'none' : '1.5px solid var(--ink-3)',
                    background: isDone ? 'var(--accent)' : 'transparent',
                  }}
                  aria-label={isDone ? `Unmark: ${label}` : `Mark as done: ${label}`}
                >
                  {isDone && <Check size={11} strokeWidth={3} color="#ffffff" />}
                </button>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[13px] font-medium leading-tight"
                    style={{
                      color: isDone ? 'var(--ink-3)' : 'var(--ink)',
                      textDecoration: isDone ? 'line-through' : 'none',
                    }}
                  >
                    {label}
                  </p>
                  <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--ink-3)' }}>
                    {desc}
                  </p>
                </div>

                {/* Arrow */}
                {!isDone && (
                  <ChevronRight
                    size={14}
                    className="flex-shrink-0 opacity-0 group-hover:opacity-60 transition-opacity"
                    style={{ color: 'var(--ink)' }}
                  />
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
