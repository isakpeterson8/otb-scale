'use client'

import { useState, useTransition } from 'react'
import { requestTierUpgrade } from '@/app/actions/admin'

interface Props {
  feature: string
  /**
   * The viewing studio's tier. Only the education-library denial passes it:
   * a Graduate studio came down from Scale, so offering a Scale upgrade there
   * is wrong. Every other call site omits it and renders exactly as before.
   */
  tier?: string
}

function BannerIcon() {
  return (
    <div
      className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
      style={{ background: 'var(--accent-l)' }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 2l2.5 5.5 5.5.8-4 3.9 1 5.5L12 15l-5 2.7 1-5.5-4-3.9 5.5-.8L12 2z"
          fill="currentColor"
          style={{ color: 'var(--accent-text)' }}
        />
      </svg>
    </div>
  )
}

export default function UpgradeBanner({ feature, tier }: Props) {
  // Graduate: explain the plan, no upgrade CTA. Returns before the shared
  // upgrade markup below, which is left exactly as it was for every other tier.
  if (tier === 'graduate') {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[360px] px-4">
        <div className="text-center max-w-sm">
          <BannerIcon />
          <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            The education library is a Scale feature. As a Graduate, you&apos;ve completed the program, but your student tracking and financials stay with you here anytime. :)
          </p>
        </div>
      </div>
    )
  }

  const [isPending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)

  function handleRequest() {
    startTransition(async () => {
      const result = await requestTierUpgrade('scale')
      if (!result.error) setSent(true)
    })
  }

  return (
    <div className="flex-1 flex items-center justify-center min-h-[360px] px-4">
      <div className="text-center max-w-sm">
        <BannerIcon />
        <h3
          className="text-lg font-medium mb-2"
          style={{ fontFamily: 'var(--font-heading)', color: 'var(--ink)' }}
        >
          {feature} is a Scale feature.
        </h3>
        <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--ink-3)' }}>
          This feature is available on the Scale plan and above.
          {sent
            ? ' Your request has been sent — we\'ll be in touch soon!'
            : ' Click below to request access and an OTB team member will reach out.'}
        </p>

        {sent ? (
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'rgba(22,163,74,0.12)', color: '#15803d' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M2.5 7l3 3 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Request sent
          </div>
        ) : (
          <button
            onClick={handleRequest}
            disabled={isPending}
            className="px-5 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: 'var(--accent-l)', color: 'var(--accent-text)' }}
          >
            {isPending ? 'Sending…' : 'Request Access'}
          </button>
        )}
      </div>
    </div>
  )
}
