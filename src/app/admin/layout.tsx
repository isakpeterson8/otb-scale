import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isDesignerEmail } from '@/lib/designer'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'otb_admin' || profile?.role === 'otb_staff'
  // Designers pass the layout gate but are scoped to the Canva tab by
  // /admin/page.tsx; every other /admin sub-page re-checks for admin role.
  if (!isAdmin && !isDesignerEmail(user.email)) {
    redirect('/dashboard')
  }

  return <>{children}</>
}
