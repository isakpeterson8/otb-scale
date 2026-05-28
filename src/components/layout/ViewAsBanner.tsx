'use client'

import { useTransition } from 'react'
import { exitViewAs } from '@/app/actions/admin'

const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  scale: 'Scale',
  graduate: 'Graduate',
  lifetime: 'Lifetime',
}

export function ViewAsBanner({ studioName, tier }: { studioName: string; tier?: string | null }) {
  const [isPending, startTransition] = useTransition()

  function handleExit() {
    startTransition(async () => {
      await exitViewAs()
      window.location.href = '/admin'
    })
  }

  const tierLabel = tier ? TIER_LABELS[tier] ?? tier : null
  const bannerText = tierLabel
    ? `Viewing as ${studioName} — ${tierLabel} Tier — Read only mode`
    : `Viewing as ${studioName} — Read only mode`

  return (
    <div
      className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium"
      style={{ background: 'rgba(139,69,19,0.15)', color: '#c97b3a', borderBottom: '1px solid rgba(139,69,19,0.25)' }}
    >
      <span className="truncate mr-3 min-w-0">{bannerText}</span>
      <button
        onClick={handleExit}
        disabled={isPending}
        className="px-3 py-1 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
        style={{ background: 'rgba(139,69,19,0.2)', color: '#c97b3a' }}
      >
        {isPending ? 'Exiting…' : 'Exit View'}
      </button>
    </div>
  )
}
