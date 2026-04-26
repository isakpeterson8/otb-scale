import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function PendingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  async function signOut() {
    'use server'
    const supabase2 = await createClient()
    await supabase2.auth.signOut()
    redirect('/auth/login')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--canvas)] px-4">
      <div className="w-full max-w-sm flex flex-col items-center gap-6 text-center">
        <img src="/otb-logo.png" alt="Outside The Bachs" width={100} style={{ objectFit: 'contain' }} />

        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-8 flex flex-col gap-4">
          <h1 className="text-lg font-semibold text-[var(--ink)]">Account pending approval</h1>
          <p className="text-sm text-[var(--ink-2)] leading-relaxed">
            Your account is under review. You'll receive an email once an admin has approved your access.
          </p>
          <p className="text-xs text-[var(--ink-3)]">{user.email}</p>

          <form action={signOut}>
            <button
              type="submit"
              className="text-xs text-[var(--ink-3)] hover:text-[var(--ink)] underline transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
