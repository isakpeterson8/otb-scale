import type { Metadata } from 'next'
import Link from 'next/link'
import AppShell from '@/components/layout/AppShell'

export const metadata: Metadata = { title: 'Live Support Sessions' }

export default async function LssUnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const { reason } = await searchParams
  const notSet = reason === 'not-set'

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <div className="max-w-md mx-auto mt-10 text-center rounded-2xl p-8 bg-[var(--surface)] border border-[var(--ink)]/8">
          <h1 className="text-xl text-[var(--ink)] mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
            {notSet ? "The call link isn't ready yet" : 'Live Support Sessions are for active Scale members'}
          </h1>
          <p className="text-sm text-[var(--ink-3)] mb-6">
            {notSet
              ? 'Please check back a few minutes before the session starts.'
              : 'Your current plan doesn’t include the live group calls.'}
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent-text)]/10 text-[var(--accent-text)] hover:bg-[var(--accent-text)]/20 transition-colors"
          >
            Back to dashboard
          </Link>
        </div>
      </main>
    </AppShell>
  )
}
