'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateRequestStatus,
  createSiteFromRequest,
  generateCopyPack,
} from '@/app/actions/squarespace-concierge'
import type { SquarespaceRequest, SquaresspaceSite, RequestStatus, RequestType } from '@/types/database'
import { formatDate } from '@/lib/utils'

const STATUS_BADGE: Record<RequestStatus, { label: string; bg: string; color: string }> = {
  requested:           { label: 'Requested',           bg: 'rgba(180,83,9,0.12)',    color: '#b45309' },
  intake_complete:     { label: 'Intake Complete',      bg: 'rgba(4,173,239,0.15)',   color: '#0284a8' },
  in_build:            { label: 'In Build',             bg: 'rgba(4,173,239,0.15)',   color: '#0284a8' },
  contributor_sent:    { label: 'Contributor Sent',     bg: 'rgba(109,40,217,0.12)',  color: '#7c3aed' },
  client_editing:      { label: 'Client Editing',       bg: 'rgba(109,40,217,0.12)',  color: '#7c3aed' },
  billing_transferred: { label: 'Billing Transferred',  bg: 'rgba(22,163,74,0.12)',   color: '#15803d' },
  live:                { label: 'Live',                 bg: 'rgba(22,163,74,0.12)',   color: '#15803d' },
  closed:              { label: 'Closed',               bg: 'rgba(100,116,139,0.12)', color: '#475569' },
}

const STATUS_ORDER: RequestStatus[] = [
  'requested', 'intake_complete', 'in_build', 'contributor_sent',
  'client_editing', 'billing_transferred', 'live', 'closed',
]

const TYPE_LABELS: Record<RequestType, string> = {
  new_build:        'New build',
  refresh:          'Refresh',
  support:          'Support',
  billing_transfer: 'Billing transfer',
}

const COPY_PACK_SECTIONS: Array<{ key: string; label: string }> = [
  { key: 'homepage', label: 'Homepage' },
  { key: 'about',    label: 'About' },
  { key: 'lessons',  label: 'Lessons' },
  { key: 'contact',  label: 'Contact' },
  { key: 'faq',      label: 'FAQ' },
  { key: 'seo',      label: 'SEO' },
  { key: 'alt_text', label: 'Alt Text' },
  { key: 'json_ld',  label: 'JSON-LD' },
]

interface Props {
  requests: SquarespaceRequest[]
  allSites: SquaresspaceSite[]
}

export default function ConciergeAdminClient({ requests: initialRequests, allSites }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [requests, setRequests] = useState(initialRequests)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeStatus, setActiveStatus] = useState<RequestStatus>('requested')
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [copyPackError, setCopyPackError] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [siteError, setSiteError] = useState<string | null>(null)

  const grouped = STATUS_ORDER.reduce<Record<RequestStatus, SquarespaceRequest[]>>(
    (acc, s) => { acc[s] = requests.filter(r => r.status === s); return acc },
    {} as Record<RequestStatus, SquarespaceRequest[]>
  )

  const selected = selectedId ? requests.find(r => r.id === selectedId) ?? null : null

  function updateLocal(id: string, patch: Partial<SquarespaceRequest>) {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  function handleStatusChange(id: string, status: RequestStatus) {
    setStatusError(null)
    startTransition(async () => {
      const result = await updateRequestStatus(id, status)
      if (result.error) {
        setStatusError(result.error)
      } else {
        updateLocal(id, { status })
      }
    })
  }

  function handleCreateSite(requestId: string) {
    setSiteError(null)
    startTransition(async () => {
      const result = await createSiteFromRequest(requestId)
      if (result.error) {
        setSiteError(result.error)
      } else if (result.siteId) {
        updateLocal(requestId, { site_id: result.siteId })
        router.refresh()
      }
    })
  }

  async function handleGenerateCopyPack(requestId: string) {
    setGeneratingId(requestId)
    setCopyPackError(null)
    const result = await generateCopyPack(requestId)
    setGeneratingId(null)
    if (result.error) {
      setCopyPackError(result.error)
    } else if (result.copyPack) {
      updateLocal(requestId, { copy_pack: result.copyPack as Record<string, unknown> })
    }
  }

  const countWithRequests = STATUS_ORDER.filter(s => grouped[s].length > 0).length

  return (
    <div className="flex gap-6 min-h-[600px]">
      {/* Left: grouped status tabs + request cards */}
      <div className="w-72 shrink-0 flex flex-col gap-2">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
            Concierge Pipeline
          </h2>
          <span className="text-xs text-[var(--ink-3)]">{requests.length} total</span>
        </div>

        {STATUS_ORDER.map(status => {
          const items = grouped[status]
          if (items.length === 0 && status !== activeStatus) return null
          const badge = STATUS_BADGE[status]
          return (
            <div key={status}>
              <button
                onClick={() => setActiveStatus(status)}
                className={[
                  'w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs font-medium transition-colors',
                  activeStatus === status ? 'bg-[var(--canvas)]' : 'hover:bg-[var(--canvas)]/50',
                ].join(' ')}
              >
                <span className="text-[var(--ink)]">{badge.label}</span>
                {items.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold"
                    style={{ background: badge.bg, color: badge.color }}>
                    {items.length}
                  </span>
                )}
              </button>

              {activeStatus === status && (
                <div className="mt-1 ml-2 space-y-1">
                  {items.length === 0 && (
                    <p className="px-3 py-2 text-xs text-[var(--ink-3)]">None here</p>
                  )}
                  {items.map(req => (
                    <button
                      key={req.id}
                      onClick={() => setSelectedId(req.id)}
                      className={[
                        'w-full text-left px-3 py-2.5 rounded-lg border transition-all',
                        selectedId === req.id
                          ? 'border-[var(--accent-text)]/40 bg-[var(--accent-text)]/5'
                          : 'border-[var(--ink)]/8 hover:border-[var(--ink)]/18',
                      ].join(' ')}
                    >
                      <p className="text-xs font-medium text-[var(--ink)] truncate">
                        {req.studio_name || req.site_reference || req.user_id.slice(0, 8)}
                      </p>
                      <p className="text-[10px] text-[var(--ink-3)] mt-0.5">
                        {TYPE_LABELS[req.request_type]} · {formatDate(req.created_at)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {countWithRequests === 0 && (
          <p className="text-sm text-[var(--ink-3)] mt-4 px-2">No requests yet.</p>
        )}
      </div>

      {/* Right: detail panel */}
      <div className="flex-1 min-w-0">
        {!selected ? (
          <div className="flex items-center justify-center h-64 text-sm text-[var(--ink-3)] bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8">
            Select a request to view details
          </div>
        ) : (
          <DetailPanel
            request={selected}
            allSites={allSites}
            isPending={isPending}
            isGenerating={generatingId === selected.id}
            statusError={statusError}
            siteError={siteError}
            copyPackError={copyPackError}
            onStatusChange={status => handleStatusChange(selected.id, status)}
            onCreateSite={() => handleCreateSite(selected.id)}
            onGenerateCopyPack={() => handleGenerateCopyPack(selected.id)}
          />
        )}
      </div>
    </div>
  )
}

interface DetailPanelProps {
  request: SquarespaceRequest
  allSites: SquaresspaceSite[]
  isPending: boolean
  isGenerating: boolean
  statusError: string | null
  siteError: string | null
  copyPackError: string | null
  onStatusChange: (status: RequestStatus) => void
  onCreateSite: () => void
  onGenerateCopyPack: () => void
}

function DetailPanel({
  request, allSites, isPending, isGenerating, statusError, siteError, copyPackError,
  onStatusChange, onCreateSite, onGenerateCopyPack,
}: DetailPanelProps) {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)

  const linkedSite = request.site_id ? allSites.find(s => s.id === request.site_id) : null

  function toggleSection(key: string) {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function copySection(key: string, value: unknown) {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  const isNewBuild = request.request_type === 'new_build'

  return (
    <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 flex flex-col divide-y divide-[var(--ink)]/6">
      {/* Header */}
      <div className="px-6 py-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-base font-semibold text-[var(--ink)]">
            {request.studio_name || request.site_reference || 'Unnamed'}
          </p>
          <p className="text-xs text-[var(--ink-3)] mt-0.5">
            {TYPE_LABELS[request.request_type]} · Submitted {formatDate(request.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={request.status}
            onChange={e => onStatusChange(e.target.value as RequestStatus)}
            disabled={isPending}
            className="px-2 py-1.5 rounded-lg border border-[var(--ink)]/12 bg-[var(--canvas)] text-xs text-[var(--ink)] focus:outline-none"
          >
            {STATUS_ORDER.map(s => (
              <option key={s} value={s}>{STATUS_BADGE[s].label}</option>
            ))}
          </select>
          {statusError && <span className="text-xs" style={{ color: 'var(--red)' }}>{statusError}</span>}
        </div>
      </div>

      {/* Linked site */}
      <div className="px-6 py-3 flex items-center justify-between">
        <div className="text-xs text-[var(--ink-3)]">
          {linkedSite ? (
            <span>Linked site: <span className="text-[var(--ink)] font-medium">{linkedSite.site_name}</span></span>
          ) : (
            <span>No site record linked</span>
          )}
        </div>
        {!linkedSite && isNewBuild && (
          <button
            onClick={onCreateSite}
            disabled={isPending}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: 'rgba(4,173,239,0.12)', color: '#0284a8' }}
          >
            Create site record
          </button>
        )}
        {siteError && <span className="text-xs ml-2" style={{ color: 'var(--red)' }}>{siteError}</span>}
      </div>

      {/* Intake fields */}
      <div className="px-6 py-4 space-y-3">
        <p className="text-xs font-semibold text-[var(--ink-3)] uppercase tracking-wide">Intake</p>
        {isNewBuild ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {([
              ['Studio name',     request.studio_name],
              ['Owner name',      request.owner_name],
              ['City & state',    request.city_state],
              ['Instruments',     request.instruments],
              ['Ages served',     request.ages_served],
              ['Teaching format', request.teaching_format],
              ['Booking platform',request.booking_platform],
              ['Booking URL',     request.booking_url],
              ['Existing domain', request.existing_domain],
              ['Current site',    request.current_site_url],
              ['GBP URL',         request.gbp_url],
              ['Logo assets',     request.logo_asset_link],
              ['Brand colors',    request.brand_colors],
              ['Example sites',   request.example_sites],
              ['Show pricing',    request.show_pricing != null ? String(request.show_pricing) : null],
              ['Primary CTA',     request.primary_cta],
              ['Testimonials',    request.testimonials_link],
            ] as [string, string | null][]).map(([label, val]) => (
              val ? (
                <div key={label}>
                  <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase tracking-wide">{label}</p>
                  <p className="text-xs text-[var(--ink)] mt-0.5 break-all">{val}</p>
                </div>
              ) : null
            ))}
            {request.bio && (
              <div className="col-span-2">
                <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase tracking-wide">Bio</p>
                <p className="text-xs text-[var(--ink)] mt-0.5 whitespace-pre-wrap">{request.bio}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {request.details && (
              <div>
                <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase tracking-wide">Details</p>
                <p className="text-xs text-[var(--ink)] mt-0.5 whitespace-pre-wrap">{request.details}</p>
              </div>
            )}
            {request.site_reference && (
              <div>
                <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase tracking-wide">Site reference</p>
                <p className="text-xs text-[var(--ink)] mt-0.5">{request.site_reference}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Copy pack — new build only */}
      {isNewBuild && (
        <div className="px-6 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[var(--ink-3)] uppercase tracking-wide">Copy pack</p>
            <button
              onClick={onGenerateCopyPack}
              disabled={isGenerating}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ background: 'rgba(73,37,47,0.15)', color: 'var(--accent-text)' }}
            >
              {isGenerating ? 'Generating…' : request.copy_pack ? 'Regenerate' : 'Generate with Claude'}
            </button>
          </div>

          {copyPackError && <p className="text-xs" style={{ color: 'var(--red)' }}>{copyPackError}</p>}

          {request.copy_pack && (
            <div className="space-y-1">
              {COPY_PACK_SECTIONS.map(({ key, label }) => {
                const value = (request.copy_pack as Record<string, unknown>)?.[key]
                if (value === undefined) return null
                const isOpen = openSections.has(key)
                return (
                  <div key={key} className="rounded-lg border border-[var(--ink)]/10 overflow-hidden">
                    <button
                      onClick={() => toggleSection(key)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-[var(--canvas)]/40 transition-colors"
                    >
                      <span className="text-xs font-medium text-[var(--ink)]">{label}</span>
                      <span className="text-[var(--ink-3)] text-xs">{isOpen ? '▲' : '▼'}</span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-3">
                        <pre className="text-xs text-[var(--ink-2)] whitespace-pre-wrap break-all font-mono bg-[var(--canvas)] rounded p-3 overflow-x-auto">
                          {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                        </pre>
                        <button
                          onClick={() => copySection(key, value)}
                          className="mt-2 text-xs text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
                        >
                          {copied === key ? '✓ Copied' : 'Copy to clipboard'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
