import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getStaffContext } from '@/lib/staff'
import { listLssSessions, maskZoomUrl, readZoomJoinUrl } from '@/lib/live-support-server'
import { hostsBySession, listCoaches } from '@/lib/lss-sync'
import { adminClient } from '@/lib/supabase/admin'
import { getGoogleStatus } from '@/app/actions/lss-calendar'
import AdminShell from '../AdminShell'
import LssAdminClient from './LssAdminClient'

export const metadata: Metadata = { title: 'Live Support Sessions' }

export default async function AdminLssPage({
  searchParams,
}: {
  searchParams: Promise<{ google_error?: string; google_connected?: string }>
}) {
  const staff = await getStaffContext()
  if (!staff) redirect('/dashboard')

  const sp = await searchParams
  const [sessions, zoomUrl, coaches, hosts, google, settings] = await Promise.all([
    listLssSessions(),
    readZoomJoinUrl(),
    listCoaches(),
    hostsBySession(),
    getGoogleStatus(),
    adminClient.from('lss_settings').select('last_sync_at, last_sync_summary').eq('id', true).maybeSingle(),
  ])

  const linked = await adminClient.from('lss_sessions').select('id').not('google_event_id', 'is', null)
  const lastSync = settings.data?.last_sync_at
    ? `${new Date(settings.data.last_sync_at as string).toLocaleString('en-US', { timeZone: 'America/Chicago' })} Central — ${settings.data.last_sync_summary ?? ''}`
    : null

  return (
    <AdminShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        {/* Only the masked form of the Zoom URL ever reaches the browser, even for admins. */}
        <LssAdminClient
          sessions={sessions}
          maskedZoomUrl={maskZoomUrl(zoomUrl)}
          coaches={coaches.filter(c => c.active).map(c => ({ id: c.id, first_name: c.first_name }))}
          hostIdsBySession={Object.fromEntries([...hosts].map(([sid, list]) => [sid, list.map(c => c.id)]))}
          linkedSessionIds={(linked.data ?? []).map(r => r.id as string)}
          google={google.data ?? null}
          googleFlash={{ error: sp.google_error, connected: sp.google_connected === '1' }}
          lastSync={lastSync}
        />
      </main>
    </AdminShell>
  )
}
