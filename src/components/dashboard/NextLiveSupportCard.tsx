'use client'

import Link from 'next/link'
import type { LssSessionSummary } from '@/lib/live-support'
import JoinButton from '@/components/live-support/JoinButton'
import { fmtLocalDateTime, useNow } from '@/components/live-support/useNow'

export default function NextLiveSupportCard({ session }: { session: LssSessionSummary | null }) {
  const now = useNow(60_000)

  return (
    <section className="bg-[#f3f4f6] rounded-2xl p-5 flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-[#6b7280]">Next Live Support Session</p>
      {session ? (
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold text-[#111827]" style={{ fontFamily: 'var(--font-heading)' }}>{session.title}</p>
            {session.coach_names && <p className="text-sm text-[#374151]">with {session.coach_names}</p>}
            <p className="text-sm text-[#6b7280] mt-0.5" suppressHydrationWarning>
              {now ? fmtLocalDateTime(session.starts_at) : ' '}
            </p>
          </div>
          <JoinButton session={session} />
        </div>
      ) : (
        <p className="text-sm text-[#6b7280]">No session is scheduled yet — check back soon.</p>
      )}
      <Link href="/live-support" className="text-sm text-[#0284a8] hover:underline self-start">Past recordings →</Link>
    </section>
  )
}
