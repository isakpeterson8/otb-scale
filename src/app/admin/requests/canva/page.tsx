import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminShell from '../../AdminShell'
import CanvaRequestsTab from '../../CanvaRequestsTab'
import { isDesignerEmail } from '@/lib/designer'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Canva Requests' }

/**
 * Canva requests used to live at /admin?tab=canva — a query param on a different
 * page from its sibling tab. Sibling tabs on different routes cannot be switched
 * by changing a query string, which is what made the Requests tabs stale until a
 * refresh. Both are plain routes now.
 *
 * Serves two audiences, as the old /admin branch did: full staff, and
 * designer-only accounts who see nothing else in the admin area.
 */
export default async function CanvaRequestsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isStaff = profile?.role === 'otb_admin' || profile?.role === 'otb_staff'
  const isDesigner = isDesignerEmail(user.email)

  if (!isStaff && !isDesigner) redirect('/dashboard')

  // canvaOnly collapses the nav to just this tab, so a designer is not shown
  // sections they cannot open.
  return (
    <AdminShell canvaOnly={!isStaff}>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <CanvaRequestsTab />
      </main>
    </AdminShell>
  )
}
