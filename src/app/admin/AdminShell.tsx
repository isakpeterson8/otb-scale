import { unstable_cache } from 'next/cache'
import { adminClient } from '@/lib/supabase/admin'
import AppShell from '@/components/layout/AppShell'
import AdminNav from '@/components/layout/AdminNav'

// Badge counts are approximate — 30s TTL is acceptable; mutations call revalidatePath('/admin')
const getCachedBadgeCounts = unstable_cache(
  async () => {
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
  },
  ['admin-badge-counts'],
  { revalidate: 30 }
)

export default async function AdminShell({ children, canvaOnly }: { children: React.ReactNode; canvaOnly?: boolean }) {
  const { pendingCount, requestsCount } = await getCachedBadgeCounts()

  return (
    <AppShell>
      <AdminNav pendingCount={pendingCount} requestsCount={requestsCount} canvaOnly={canvaOnly} />
      {children}
    </AppShell>
  )
}
