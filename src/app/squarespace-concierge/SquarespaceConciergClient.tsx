'use client'

import { useState, useTransition } from 'react'
import {
  submitSquarespaceRequest,
} from '@/app/actions/squarespace-concierge'
import type { SquarespaceRequest, SquaresspaceSite, RequestType } from '@/types/database'
import { formatDate } from '@/lib/utils'

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  requested:           { label: 'Requested',           bg: 'rgba(180,83,9,0.12)',    color: '#b45309' },
  intake_complete:     { label: 'Intake Complete',      bg: 'rgba(4,173,239,0.15)',   color: '#0284a8' },
  in_build:            { label: 'In Build',             bg: 'rgba(4,173,239,0.15)',   color: '#0284a8' },
  contributor_sent:    { label: 'Contributor Sent',     bg: 'rgba(109,40,217,0.12)',  color: '#7c3aed' },
  client_editing:      { label: 'Client Editing',       bg: 'rgba(109,40,217,0.12)',  color: '#7c3aed' },
  billing_transferred: { label: 'Billing Transferred',  bg: 'rgba(22,163,74,0.12)',   color: '#15803d' },
  live:                { label: 'Live',                 bg: 'rgba(22,163,74,0.12)',   color: '#15803d' },
  closed:              { label: 'Closed',               bg: 'rgba(100,116,139,0.12)', color: '#475569' },
}

const TYPE_LABELS: Record<RequestType, string> = {
  new_build:        'New website build',
  refresh:          'Refresh existing site',
  support:          'Support / fix',
  billing_transfer: 'Billing transfer',
}

const inputClass =
  'w-full px-3 py-2.5 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]'
const labelClass = 'text-xs font-medium text-[var(--ink-3)]'
const fieldClass = 'flex flex-col gap-1.5'

interface Props {
  existingRequests: SquarespaceRequest[]
  mySites: SquaresspaceSite[]
}

export default function SquarespaceConciergClient({ existingRequests, mySites }: Props) {
  const [isPending, startTransition] = useTransition()
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requests, setRequests] = useState(existingRequests)

  // Form state
  const [requestType, setRequestType] = useState<RequestType | ''>('')
  // new_build fields
  const [studioName, setStudioName]   = useState('')
  const [ownerName, setOwnerName]     = useState('')
  const [cityState, setCityState]     = useState('')
  const [instruments, setInstruments] = useState('')
  const [agesServed, setAgesServed]   = useState('')
  const [teachingFormat, setTeachingFormat] = useState('')
  const [bookingPlatform, setBookingPlatform] = useState('')
  const [bookingUrl, setBookingUrl]   = useState('')
  const [existingDomain, setExistingDomain] = useState('')
  const [currentSiteUrl, setCurrentSiteUrl] = useState('')
  const [gbpUrl, setGbpUrl]           = useState('')
  const [logoAssetLink, setLogoAssetLink] = useState('')
  const [brandColors, setBrandColors] = useState('')
  const [exampleSites, setExampleSites] = useState('')
  const [bio, setBio]                 = useState('')
  const [testimonialsLink, setTestimonialsLink] = useState('')
  const [showPricing, setShowPricing] = useState<'' | 'yes' | 'no'>('')
  const [primaryCta, setPrimaryCta]   = useState('')
  // short-form fields
  const [siteId, setSiteId]           = useState('')
  const [siteReference, setSiteReference] = useState('')
  const [details, setDetails]         = useState('')

  const isNewBuild = requestType === 'new_build'
  const isShortForm = requestType === 'refresh' || requestType === 'support' || requestType === 'billing_transfer'

  function validate(): string | null {
    if (!requestType) return 'Please select a request type.'
    if (isNewBuild) {
      if (!studioName.trim()) return 'Studio name is required.'
      if (!ownerName.trim())  return 'Your name is required.'
      if (!cityState.trim())  return 'City & state is required.'
      if (!instruments.trim()) return 'Instrument(s) is required.'
      if (!bio.trim())         return 'Short bio is required.'
      if (!primaryCta.trim())  return 'Primary goal for visitors is required.'
    }
    if (isShortForm) {
      if (!details.trim()) return 'Please describe what you need.'
    }
    return null
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validationError = validate()
    if (validationError) { setError(validationError); return }
    setError(null)

    startTransition(async () => {
      const result = await submitSquarespaceRequest({
        request_type:     requestType as RequestType,
        studio_name:      studioName || undefined,
        owner_name:       ownerName || undefined,
        city_state:       cityState || undefined,
        instruments:      instruments || undefined,
        ages_served:      agesServed || undefined,
        teaching_format:  teachingFormat || undefined,
        booking_platform: bookingPlatform || undefined,
        booking_url:      bookingUrl || undefined,
        existing_domain:  existingDomain || undefined,
        current_site_url: currentSiteUrl || undefined,
        gbp_url:          gbpUrl || undefined,
        logo_asset_link:  logoAssetLink || undefined,
        brand_colors:     brandColors || undefined,
        example_sites:    exampleSites || undefined,
        bio:              bio || undefined,
        testimonials_link: testimonialsLink || undefined,
        show_pricing:     showPricing === 'yes' ? true : showPricing === 'no' ? false : undefined,
        primary_cta:      primaryCta || undefined,
        site_id:          siteId || undefined,
        site_reference:   siteReference || undefined,
        details:          details || undefined,
      })
      if (result.error) {
        setError(result.error)
      } else {
        setSubmitted(true)
        // Optimistically prepend
        setRequests(prev => [{
          id: Math.random().toString(),
          request_type: requestType as RequestType,
          status: 'requested',
          created_at: new Date().toISOString(),
        } as SquarespaceRequest, ...prev])
      }
    })
  }

  if (submitted) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
            Squarespace Concierge
          </h2>
          <p className="text-sm text-[var(--ink-3)] mt-0.5">Request a new site or updates to an existing OTB-built site.</p>
        </div>

        <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 p-7 flex flex-col items-center text-center gap-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(22,163,74,0.12)' }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
              <path d="M4 11l5 5 9-9" stroke="#15803d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="text-base font-medium text-[var(--ink)]">Request submitted!</p>
            <p className="text-sm text-[var(--ink-3)] mt-1 max-w-sm">
              You'll receive a confirmation email shortly. Here's what happens next:
            </p>
          </div>
          <ol className="text-sm text-[var(--ink-2)] text-left space-y-1.5 w-full max-w-sm">
            {['We review your intake and build a draft', "We send you a Squarespace Contributor invite", "You add personal photos and final touches", "We launch — and stay on as a contributor after"].map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full text-[10px] font-semibold flex items-center justify-center mt-0.5"
                  style={{ background: 'var(--accent-l)', color: 'var(--accent-text)' }}>
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <button
            onClick={() => setSubmitted(false)}
            className="text-sm text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors mt-2"
          >
            Submit another request
          </button>
        </div>

        <RequestList requests={requests} />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
          Squarespace Concierge
        </h2>
        <p className="text-sm text-[var(--ink-3)] mt-0.5">
          Request a new Squarespace site or updates to an existing OTB-built site.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 p-6 flex flex-col gap-6">

        {/* Request type */}
        <div className={fieldClass}>
          <label className={labelClass}>Request type <span style={{ color: 'var(--red)' }}>*</span></label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {([
              ['new_build',        'New website build',     'I need a brand-new site built from scratch'],
              ['refresh',          'Refresh existing site',  'Update or redesign an OTB-built site'],
              ['support',          'Support / fix',         'Something on my site needs fixing'],
              ['billing_transfer', 'Billing transfer',      'Transfer my site billing to me'],
            ] as const).map(([val, label, desc]) => (
              <button
                key={val}
                type="button"
                onClick={() => setRequestType(val)}
                className={[
                  'text-left px-4 py-3 rounded-lg border transition-all',
                  requestType === val
                    ? 'border-[var(--accent-text)] bg-[var(--accent-text)]/5'
                    : 'border-[var(--ink)]/12 hover:border-[var(--ink)]/25',
                ].join(' ')}
              >
                <p className="text-sm font-medium text-[var(--ink)]">{label}</p>
                <p className="text-xs text-[var(--ink-3)] mt-0.5">{desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ── New build: full intake ──────────────────────────────────────── */}
        {isNewBuild && (
          <>
            <hr className="border-[var(--ink)]/6" />
            <p className="text-xs font-semibold text-[var(--ink-3)] uppercase tracking-wide -mb-2">Studio basics</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className={fieldClass}>
                <label className={labelClass}>Studio name <span style={{ color: 'var(--red)' }}>*</span></label>
                <input className={inputClass} value={studioName} onChange={e => setStudioName(e.target.value)} placeholder="Kelly's Piano Studio" />
              </div>
              <div className={fieldClass}>
                <label className={labelClass}>Your name <span style={{ color: 'var(--red)' }}>*</span></label>
                <input className={inputClass} value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Kelly Riordan" />
              </div>
              <div className={fieldClass}>
                <label className={labelClass}>City &amp; state <span style={{ color: 'var(--red)' }}>*</span></label>
                <input className={inputClass} value={cityState} onChange={e => setCityState(e.target.value)} placeholder="Austin, TX" />
              </div>
              <div className={fieldClass}>
                <label className={labelClass}>Instrument(s) taught <span style={{ color: 'var(--red)' }}>*</span></label>
                <input className={inputClass} value={instruments} onChange={e => setInstruments(e.target.value)} placeholder="Piano, voice" />
              </div>
              <div className={fieldClass}>
                <label className={labelClass}>Ages served</label>
                <input className={inputClass} value={agesServed} onChange={e => setAgesServed(e.target.value)} placeholder="5 and up, all ages" />
              </div>
              <div className={fieldClass}>
                <label className={labelClass}>Teaching format</label>
                <select className={inputClass} value={teachingFormat} onChange={e => setTeachingFormat(e.target.value)}>
                  <option value="">Select…</option>
                  <option value="in-person">In-person only</option>
                  <option value="online">Online only</option>
                  <option value="hybrid">Hybrid (in-person + online)</option>
                </select>
              </div>
            </div>

            <hr className="border-[var(--ink)]/6" />
            <p className="text-xs font-semibold text-[var(--ink-3)] uppercase tracking-wide -mb-2">Booking</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className={fieldClass}>
                <label className={labelClass}>Booking platform</label>
                <select className={inputClass} value={bookingPlatform} onChange={e => setBookingPlatform(e.target.value)}>
                  <option value="">Select…</option>
                  <option>Fons</option>
                  <option>My Music Staff</option>
                  <option>Calendly</option>
                  <option>Other</option>
                </select>
              </div>
              <div className={fieldClass}>
                <label className={labelClass}>Booking or portal URL</label>
                <input className={inputClass} value={bookingUrl} onChange={e => setBookingUrl(e.target.value)} placeholder="https://app.fons.io/…" />
              </div>
            </div>

            <hr className="border-[var(--ink)]/6" />
            <p className="text-xs font-semibold text-[var(--ink-3)] uppercase tracking-wide -mb-2">Web presence</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className={fieldClass}>
                <label className={labelClass}>Existing domain + registrar</label>
                <input className={inputClass} value={existingDomain} onChange={e => setExistingDomain(e.target.value)} placeholder="kellypiano.com (GoDaddy)" />
              </div>
              <div className={fieldClass}>
                <label className={labelClass}>Current site URL</label>
                <input className={inputClass} value={currentSiteUrl} onChange={e => setCurrentSiteUrl(e.target.value)} placeholder="https://kellypiano.com" />
              </div>
              <div className={fieldClass}>
                <label className={labelClass}>Google Business Profile link</label>
                <input className={inputClass} value={gbpUrl} onChange={e => setGbpUrl(e.target.value)} placeholder="https://maps.app.goo.gl/…" />
              </div>
            </div>

            <hr className="border-[var(--ink)]/6" />
            <p className="text-xs font-semibold text-[var(--ink-3)] uppercase tracking-wide -mb-2">Brand</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className={fieldClass}>
                <label className={labelClass}>Logo / assets link (Drive, Dropbox, etc.)</label>
                <input className={inputClass} value={logoAssetLink} onChange={e => setLogoAssetLink(e.target.value)} placeholder="https://drive.google.com/…" />
              </div>
              <div className={fieldClass}>
                <label className={labelClass}>Brand colors</label>
                <input className={inputClass} value={brandColors} onChange={e => setBrandColors(e.target.value)} placeholder="Navy blue, warm white, gold" />
              </div>
              <div className={`${fieldClass} sm:col-span-2`}>
                <label className={labelClass}>1–3 example sites you like (URLs)</label>
                <input className={inputClass} value={exampleSites} onChange={e => setExampleSites(e.target.value)} placeholder="https://example.com, https://other.com" />
              </div>
            </div>

            <hr className="border-[var(--ink)]/6" />
            <p className="text-xs font-semibold text-[var(--ink-3)] uppercase tracking-wide -mb-2">Content</p>

            <div className={fieldClass}>
              <label className={labelClass}>Short bio <span style={{ color: 'var(--red)' }}>*</span></label>
              <textarea
                className={`${inputClass} resize-none`}
                rows={5}
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="Tell us about your background, teaching philosophy, credentials, and what makes your studio special…"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className={fieldClass}>
                <label className={labelClass}>Testimonials / Google reviews link</label>
                <input className={inputClass} value={testimonialsLink} onChange={e => setTestimonialsLink(e.target.value)} placeholder="https://g.page/r/…/review" />
              </div>
              <div className={fieldClass}>
                <label className={labelClass}>Display pricing on site?</label>
                <select className={inputClass} value={showPricing} onChange={e => setShowPricing(e.target.value as '' | 'yes' | 'no')}>
                  <option value="">Select…</option>
                  <option value="yes">Yes — show prices</option>
                  <option value="no">No — contact for pricing</option>
                </select>
              </div>
              <div className={`${fieldClass} sm:col-span-2`}>
                <label className={labelClass}>Primary goal for visitors <span style={{ color: 'var(--red)' }}>*</span></label>
                <select className={inputClass} value={primaryCta} onChange={e => setPrimaryCta(e.target.value)}>
                  <option value="">Select…</option>
                  <option value="book_trial">Book a trial lesson</option>
                  <option value="contact_form">Fill out a contact form</option>
                  <option value="phone_call">Call me directly</option>
                </select>
              </div>
            </div>
          </>
        )}

        {/* ── Short form: refresh / support / billing_transfer ───────────── */}
        {isShortForm && (
          <>
            <hr className="border-[var(--ink)]/6" />

            {mySites.length > 0 ? (
              <div className={fieldClass}>
                <label className={labelClass}>Which site? <span style={{ color: 'var(--red)' }}>*</span></label>
                <select className={inputClass} value={siteId} onChange={e => setSiteId(e.target.value)}>
                  <option value="">Select a site…</option>
                  {mySites.map(s => (
                    <option key={s.id} value={s.id}>{s.site_name}{s.primary_url ? ` (${s.primary_url})` : ''}</option>
                  ))}
                  <option value="__other__">Other / not listed</option>
                </select>
              </div>
            ) : null}

            {(mySites.length === 0 || siteId === '__other__') && (
              <div className={fieldClass}>
                <label className={labelClass}>Site name or URL {mySites.length === 0 && <span style={{ color: 'var(--red)' }}>*</span>}</label>
                <input
                  className={inputClass}
                  value={siteReference}
                  onChange={e => setSiteReference(e.target.value)}
                  placeholder="kellypiano.squarespace.com or kellypiano.com"
                />
              </div>
            )}

            <div className={fieldClass}>
              <label className={labelClass}>What do you need? <span style={{ color: 'var(--red)' }}>*</span></label>
              <textarea
                className={`${inputClass} resize-none`}
                rows={5}
                value={details}
                onChange={e => setDetails(e.target.value)}
                placeholder={
                  requestType === 'billing_transfer'
                    ? "Confirm you'd like the billing transferred to you. Include your Squarespace account email if different from your OTB login."
                    : 'Describe what needs to change or be fixed…'
                }
              />
            </div>
          </>
        )}

        {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}

        <button
          type="submit"
          disabled={isPending || !requestType}
          className="self-start px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--accent-text)', color: 'var(--canvas)' }}
        >
          {isPending ? 'Submitting…' : 'Submit request'}
        </button>
      </form>

      <RequestList requests={requests} />
    </div>
  )
}

function RequestList({ requests }: { requests: SquarespaceRequest[] }) {
  if (requests.length === 0) return null
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-[var(--ink)]">Your requests</h3>
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 divide-y divide-[var(--ink)]/6">
        {requests.map(req => {
          const badge = STATUS_BADGE[req.status] ?? STATUS_BADGE.requested
          return (
            <div key={req.id} className="px-5 py-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--ink)]">
                  {TYPE_LABELS[req.request_type] ?? req.request_type}
                  {req.studio_name ? ` — ${req.studio_name}` : ''}
                </p>
                <p className="text-xs text-[var(--ink-3)] mt-0.5">{formatDate(req.created_at)}</p>
              </div>
              <span
                className="shrink-0 px-2 py-0.5 rounded-md text-xs font-medium"
                style={{ background: badge.bg, color: badge.color }}
              >
                {badge.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
