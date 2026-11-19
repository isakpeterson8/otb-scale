import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import UpgradeBanner from '@/components/UpgradeBanner'
import { getLiveSupportAccess, listLssSessions } from '@/lib/live-support-server'
import LiveSupportClient from './LiveSupportClient'

export const metadata: Metadata = { title: 'Live Support' }

export default async function LiveSupportPage() {
  const access = await getLiveSupportAccess()
  if (access.status === 'anonymous') redirect('/auth/login?redirectTo=/live-support')

  if (access.status === 'denied') {
    return (
      <AppShell>
        <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
          <h2 className="text-2xl text-[var(--ink)] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
            Live Support
          </h2>
          <UpgradeBanner feature="Live Support Sessions" tier={access.tier} />
        </main>
      </AppShell>
    )
  }

  const sessions = await listLssSessions()

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <LiveSupportClient sessions={sessions} />
      </main>
    </AppShell>
  )
}
