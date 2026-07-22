'use client'

import { useState, useEffect, useTransition } from 'react'
import { getAdminCanvaRequests, updateCanvaRequest } from '@/app/actions/canva-edits'
import type { AdminCanvaRequest } from '@/app/actions/canva-edits'
import { formatDate } from '@/lib/utils'

const CANVA_STATUS_BADGE: Record<AdminCanvaRequest['status'], { label: string; bg: string; color: string }> = {
  pending:     { label: 'Pending',     bg: 'rgba(180,83,9,0.12)',  color: '#b45309' },
  in_progress: { label: 'In Progress', bg: 'rgba(4,173,239,0.15)', color: '#0284a8' },
  complete:    { label: 'Complete',    bg: 'rgba(22,163,74,0.12)', color: '#15803d' },
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide whitespace-nowrap text-left">
      {children}
    </th>
  )
}

function CanvaRequestRow({ request }: { request: AdminCanvaRequest }) {
  const [expanded, setExpanded] = useState(false)
  const [isPending, startTransition] = useTransition()
  const badge = CANVA_STATUS_BADGE[request.status]

  function markComplete() {
    startTransition(async () => {
      await updateCanvaRequest(request.id, { status: 'complete' })
      bustCanvaCache()
    })
  }

  return (
    <>
      <tr
        onClick={() => setExpanded(v => !v)}
        title={expanded ? undefined : 'Click to read full instructions'}
        className="hover:bg-[var(--canvas)] transition-colors cursor-pointer"
      >
        <td className="px-4 py-3 text-sm text-[var(--ink)]">{request.studio_name ?? '—'}</td>
        <td className="px-4 py-3 text-sm text-[var(--ink-2)] whitespace-nowrap">{request.asset_type}</td>
        <td className="px-4 py-3 text-sm text-[var(--ink-2)] max-w-[220px]">
          <span className="flex items-center gap-1.5">
            <p className="truncate">{request.instructions}</p>
            <svg
              width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden
              className={`shrink-0 text-[var(--ink-3)] transition-transform ${expanded ? 'rotate-180' : ''}`}
            >
              <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </td>
        <td className="px-4 py-3">
          <a
            href={request.canva_link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-xs text-[var(--accent-text)] hover:underline"
          >
            Open link
          </a>
        </td>
        <td className="px-4 py-3">
          <span
            className="inline-block px-1.5 py-px rounded text-[10px] font-semibold leading-tight"
            style={{ background: badge.bg, color: badge.color }}
          >
            {badge.label}
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-[var(--ink-3)] whitespace-nowrap">{formatDate(request.created_at)}</td>
        <td className="px-4 py-3">
          {request.status !== 'complete' && (
            <button
              disabled={isPending}
              onClick={e => { e.stopPropagation(); markComplete() }}
              className="px-3 py-1 rounded-lg text-xs font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-80"
              style={{ background: '#15803d' }}
            >
              {isPending ? '…' : 'Mark complete'}
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-[var(--canvas)]">
          <td colSpan={7} className="px-4 py-3">
            <p className="text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide mb-1">Full instructions</p>
            <p className="text-sm text-[var(--ink-2)] whitespace-pre-wrap leading-relaxed">{request.instructions}</p>
            {request.reference_url && (
              <p className="text-xs mt-2">
                <span className="text-[var(--ink-3)]">Reference: </span>
                <a
                  href={request.reference_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent-text)] hover:underline break-all"
                >
                  {request.reference_url}
                </a>
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// Module-level: survives tab switches within the same page session
let _canvaCache: AdminCanvaRequest[] | null = null

export function bustCanvaCache() { _canvaCache = null }

export default function CanvaRequestsTab() {
  const [requests, setRequests] = useState<AdminCanvaRequest[] | null>(_canvaCache)
  const [showCompleted, setShowCompleted] = useState(false)

  useEffect(() => {
    if (_canvaCache) return  // already loaded this session
    getAdminCanvaRequests().then(data => {
      _canvaCache = data
      setRequests(data)
    })
  }, [])

  if (!requests) {
    return <p className="text-sm text-[var(--ink-3)] py-12 text-center">Loading…</p>
  }

  const active = requests.filter(r => r.status !== 'complete')
  const completed = requests.filter(r => r.status === 'complete')
  const visible = showCompleted ? requests : active

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-[var(--ink-3)]">{active.length} pending · {completed.length} complete</p>
        <button
          onClick={() => setShowCompleted(v => !v)}
          className="text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
        >
          {showCompleted ? 'Hide completed' : 'Show completed'}
        </button>
      </div>

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
        {visible.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-[var(--ink-3)]">No requests.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ink)]/8">
                  <Th>Studio</Th>
                  <Th>Asset Type</Th>
                  <Th>Instructions</Th>
                  <Th>Canva Link</Th>
                  <Th>Status</Th>
                  <Th>Submitted</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ink)]/6">
                {visible.map(r => (
                  <CanvaRequestRow key={r.id} request={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
