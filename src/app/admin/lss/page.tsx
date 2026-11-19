import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getStaffContext } from '@/lib/staff'
import { listLssSessions, maskZoomUrl, readZoomJoinUrl } from '@/lib/live-support-server'
import AdminShell from '../AdminShell'
import LssAdminClient from './LssAdminClient'

export const metadata: Metadata = { title: 'Live Support Sessions' }

export default async function AdminLssPage() {
  const staff = await getStaffContext()
  if (!staff) redirect('/dashboard')

  const [sessions, zoomUrl] = await Promise.all([listLssSessions(), readZoomJoinUrl()])

  return (
    <AdminShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        {/* Only the masked form of the Zoom URL ever reaches the browser, even for admins. */}
        <LssAdminClient sessions={sessions} maskedZoomUrl={maskZoomUrl(zoomUrl)} />
      </main>
    </AdminShell>
  )
}
