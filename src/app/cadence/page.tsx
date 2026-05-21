import { redirect } from 'next/navigation'
import { getStudioId } from '@/app/actions/_shared'
import AppShell from '@/components/layout/AppShell'
import UpgradeBanner from '@/components/UpgradeBanner'
import { hasFeatureAccess } from '@/lib/features'

export default async function CadencePage() {
  const ctx = await getStudioId()
  if (!ctx) redirect('/auth/login')
  const { supabase, studioId, userEmail } = ctx

  // Explicit server-side admin check in the page itself.
  // Compares auth email to ADMIN_EMAILS env var — does not rely on profiles table row lookup,
  // which can fail when admin profiles were manually inserted with a non-matching ID.
  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase())
  const isAdmin = !!(userEmail && adminEmails.includes(userEmail.toLowerCase()))

  const { data: studio } = await supabase
    .from('studios')
    .select('subscription_tier')
    .eq('id', studioId)
    .single()

  const tier = studio?.subscription_tier ?? 'free'
  const hasAccess = isAdmin || hasFeatureAccess(tier, 'cadence_form')

  return (
    <AppShell>
      <main className="flex-1 flex flex-col px-4 md:px-8 py-5 md:py-7">
        <div className="mb-5">
          <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
            Cadence Check-In
          </h2>
          <p className="text-sm text-[var(--ink-3)] mt-0.5">
            Complete your weekly cadence check-in to track progress and get support from your OTB advisor.
          </p>
        </div>

        {hasAccess ? (
          <div className="flex-1 rounded-xl border border-[var(--ink)]/8 overflow-hidden" style={{ minHeight: '600px' }}>
            <iframe
              src="http://cadence.outsidethebachs.com/"
              className="w-full h-full"
              style={{ border: 'none', minHeight: '600px' }}
              title="Cadence Check-In Form"
              allow="clipboard-write"
            />
          </div>
        ) : (
          <UpgradeBanner feature="Cadence Check-In" />
        )}
      </main>
    </AppShell>
  )
}
