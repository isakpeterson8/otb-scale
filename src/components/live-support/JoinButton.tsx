'use client'

import { isJoinOpen, LSS_JOIN_OPENS_MINUTES, LSS_JOIN_PATH, type LssSessionSummary } from '@/lib/live-support'
import { useNow } from './useNow'

/**
 * Active from 10 minutes before the start until the end. A plain <a>, not
 * next/link: /lss/join is a route handler that redirects off-site.
 */
export default function JoinButton({ session }: { session: Pick<LssSessionSummary, 'starts_at' | 'duration_minutes'> }) {
  const now = useNow()
  const open = now ? isJoinOpen(session, now) : false

  if (!open) {
    return (
      <span
        aria-disabled
        className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-[#e5e7eb] text-[#6b7280] cursor-not-allowed"
      >
        Opens {LSS_JOIN_OPENS_MINUTES} min before
      </span>
    )
  }
  return (
    <a
      href={LSS_JOIN_PATH}
      target="_blank"
      rel="noopener"
      className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity"
      style={{ background: 'var(--accent-text)' }}
    >
      Join
    </a>
  )
}
