'use client'

import { useState, useTransition } from 'react'
import { submitCanvaRequest } from '@/app/actions/canva-edits'
import type { CanvaRequest } from '@/app/actions/canva-edits'
import { formatDate } from '@/lib/utils'

const ASSET_TYPES = [
  'Flyer',
  'Social Media Post',
  'Story Graphic',
  'Email Header',
  'Business Card',
  'Logo Update',
  'Other',
] as const

const STATUS_BADGE: Record<CanvaRequest['status'], { label: string; bg: string; color: string }> = {
  pending:     { label: 'Pending',     bg: 'rgba(180,83,9,0.12)',  color: '#b45309' },
  in_progress: { label: 'In Progress', bg: 'rgba(4,173,239,0.15)', color: '#0284a8' },
  complete:    { label: 'Complete',    bg: 'rgba(22,163,74,0.12)', color: '#15803d' },
}

interface Props {
  existingRequests: CanvaRequest[]
}

export default function CanvaEditsClient({ existingRequests }: Props) {
  const [assetType, setAssetType] = useState(ASSET_TYPES[0])
  const [instructions, setInstructions] = useState('')
  const [canvaLink, setCanvaLink] = useState('')
  const [referenceUrl, setReferenceUrl] = useState('')
  const [isPending, startTransition] = useTransition()
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requests, setRequests] = useState<CanvaRequest[]>(existingRequests)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await submitCanvaRequest({
        asset_type: assetType,
        instructions,
        canva_link: canvaLink,
        reference_url: referenceUrl || undefined,
      })
      if (result.error) { setError(result.error); return }
      setSubmitted(true)
      setInstructions('')
      setCanvaLink('')
      setReferenceUrl('')
      setAssetType(ASSET_TYPES[0])
      setTimeout(() => setSubmitted(false), 4000)
    })
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
          Canva Edits
        </h2>
        <p className="text-sm text-[var(--ink-3)] mt-0.5">
          Submit a request for the OTB team to edit your Canva designs.
        </p>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 p-6 flex flex-col gap-5"
      >
        <h3 className="text-sm font-semibold text-[var(--ink)]">New Request</h3>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[var(--ink-3)]">Asset type</label>
          <select
            required
            value={assetType}
            onChange={e => setAssetType(e.target.value as typeof assetType)}
            className="px-3 py-2.5 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
          >
            {ASSET_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[var(--ink-3)]">Edit instructions</label>
          <textarea
            required
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            placeholder="Describe exactly what you'd like changed…"
            rows={4}
            className="px-3 py-2.5 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)] resize-none"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[var(--ink-3)]">Paste your Canva edit link</label>
          <input
            required
            type="url"
            value={canvaLink}
            onChange={e => setCanvaLink(e.target.value)}
            placeholder="https://www.canva.com/design/…"
            className="px-3 py-2.5 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[var(--ink-3)]">
            Reference file URL <span className="opacity-50 font-normal">(optional)</span>
          </label>
          <input
            type="url"
            value={referenceUrl}
            onChange={e => setReferenceUrl(e.target.value)}
            placeholder="Link to an image, doc, or example…"
            className="px-3 py-2.5 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
          />
        </div>

        {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}
        {submitted && (
          <p className="text-xs font-medium" style={{ color: 'var(--green)' }}>
            Request submitted!
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="self-start px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--accent-text)', color: 'var(--canvas)' }}
        >
          {isPending ? 'Submitting…' : 'Submit Request'}
        </button>
      </form>

      {/* Past requests */}
      {requests.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--ink)]">Your Requests</h3>
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 divide-y divide-[var(--ink)]/6">
            {requests.map(r => {
              const badge = STATUS_BADGE[r.status]
              return (
                <div key={r.id} className="px-5 py-4 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[var(--ink)]">{r.asset_type}</span>
                      <span
                        className="inline-block px-1.5 py-px rounded text-[10px] font-semibold leading-tight"
                        style={{ background: badge.bg, color: badge.color }}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--ink-3)] line-clamp-2">{r.instructions}</p>
                    {r.assigned_to && (
                      <p className="text-xs text-[var(--ink-3)]">Assigned to: {r.assigned_to}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-[var(--ink-3)] whitespace-nowrap">
                    {formatDate(r.created_at)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
