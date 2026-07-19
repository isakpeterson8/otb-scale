import { adminClient } from '@/lib/supabase/admin'
import AppShell from '@/components/layout/AppShell'
import AdminNav from '@/components/layout/AdminNav'

async function getBadgeCounts() {
  const [pendingRes, conciergeRes, canvaRes] = await Promise.all([
    adminClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    adminClient
      .from('squarespace_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'requested'),
    adminClient
      .from('canva_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ])
  return {
    pendingCount:   pendingRes.count  ?? 0,
    requestsCount: (conciergeRes.count ?? 0) + (canvaRes.count ?? 0),
  }
}

export default async function AdminShell({ children }: { children: React.ReactNode }) {
  const { pendingCount, requestsCount } = await getBadgeCounts()

  return (
    <AppShell>
      <AdminNav pendingCount={pendingCount} requestsCount={requestsCount} />
      {children}
    </AppShell>
  )
}
