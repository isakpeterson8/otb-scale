'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Play, BookOpen, ClipboardList, BarChart2, Users, Building2,
  Check, X, ChevronRight,
} from 'lucide-react'

const STORAGE_KEY = 'otb_gs_v1'

const STEPS = [
  {
    Icon: Play,
    label: 'Watch the Welcome & Orientation videos',
    desc: 'How it works, who we are, and how to get support',
    href: '/education/orientation',
  },
  {
    Icon: BookOpen,
    label: 'Explore the education library',
    desc: 'Watch videos. For document resources, toggle over to Resources.',
    href: '/education',
  },
  {
    Icon: ClipboardList,
    label: 'Complete your first cadence check-in',
    desc: 'Five weekly questions that keep your growth on track',
    href: '/cadence',
  },
  {
    Icon: BarChart2,
    label: 'Add your monthly recap in Financials',
    desc: 'Log enrollment and revenue so your dashboard shows real numbers',
    href: '/financials',
  },
  {
    Icon: Users,
    label: 'Add your students and contacts',
    desc: 'Your pipeline and history live here',
    href: '/contacts',
  },
  {
    Icon: Building2,
    label: 'Add a school to your outreach pipeline',
    desc: 'Start building your path to more students',
    href: '/school-outreach',
  },
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
    <div
      className="rounded-2xl border mb-6 p-5"
      style={{ background: 'var(--surface)', borderColor: 'var(--border-strong)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            Getting started
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
            Six steps to make the most of OTB Scale
          </p>
        </div>
        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
          <span
            className="text-xs rounded-full px-2.5 py-0.5 font-medium"
            style={{ background: 'rgba(73,37,47,0.35)', color: 'var(--accent-text)' }}
          >
            {n} of {total}
          </span>
          {n >= 2 && (
            <button
              onClick={dismiss}
              className="flex items-center justify-center w-6 h-6 rounded transition-colors hover:bg-white/10"
              style={{ color: 'var(--ink-3)' }}
              aria-label="Dismiss getting started checklist"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 rounded-full mb-4 overflow-hidden" style={{ background: 'var(--border)' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: 'var(--accent-text)',
            transition: 'width 0.4s cubic-bezier(.4,0,.2,1)',
          }}
        />
      </div>

      {/* Completion state */}
      {allDone ? (
        <div className="text-center py-2">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center mx-auto mb-2"
            style={{ background: 'rgba(45,90,61,0.3)', color: '#5aad7e' }}
          >
            <Check size={18} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>All set</p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
            This card won't appear on your next visit.
          </p>
        </div>
      ) : (
        /* Step list */
        <div className="space-y-0.5">
          {STEPS.map(({ Icon, label, desc, href }, i) => {
            const isDone = checked.has(i)
            return (
              <Link
                key={i}
                href={href}
                className="flex items-center gap-2.5 px-2 py-2 rounded-lg group transition-colors hover:bg-white/[0.04]"
              >
                {/* Circle toggle */}
                <button
                  onClick={(e) => toggle(i, e)}
                  className="flex-shrink-0 flex items-center justify-center w-[18px] h-[18px] rounded-full transition-all"
                  style={{
                    border: isDone ? 'none' : '1.5px solid rgba(255,248,240,0.2)',
                    background: isDone ? 'var(--accent-text)' : 'transparent',
                  }}
                  aria-label={isDone ? `Unmark: ${label}` : `Mark as done: ${label}`}
                >
                  {isDone && <Check size={9} strokeWidth={3} color="var(--canvas)" />}
                </button>

                {/* Icon chip */}
                <div
                  className="flex-shrink-0 flex items-center justify-center w-[26px] h-[26px] rounded-md"
                  style={{ background: isDone ? 'rgba(255,248,240,0.05)' : 'rgba(73,37,47,0.3)' }}
                >
                  <Icon
                    size={13}
                    style={{ color: isDone ? 'rgba(255,248,240,0.25)' : 'var(--accent-text)' }}
                  />
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[13px] font-medium leading-tight"
                    style={{
                      color: isDone ? 'rgba(255,248,240,0.3)' : 'var(--ink)',
                      textDecoration: isDone ? 'line-through' : 'none',
                      textDecorationColor: 'rgba(255,248,240,0.2)',
                    }}
                  >
                    {label}
                  </p>
                  <p
                    className="text-[11px] mt-0.5 leading-snug"
                    style={{ color: isDone ? 'rgba(255,248,240,0.2)' : 'var(--ink-3)' }}
                  >
                    {desc}
                  </p>
                </div>

                {/* Arrow */}
                {!isDone && (
                  <ChevronRight
                    size={14}
                    className="flex-shrink-0 opacity-0 group-hover:opacity-50 transition-opacity"
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
