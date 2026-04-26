import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'
import type { Contact } from '@/types/database'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [contactsResult, financialsResult] = await Promise.all([
    supabase.from('contacts').select('id, name, email, status, created_at').order('created_at', { ascending: false }),
    supabase
      .from('studio_snapshots')
      .select('snapshot_date, collected_revenue, expenses')
      .order('snapshot_date', { ascending: false })
      .limit(6),
  ])

  const contacts = (contactsResult.data ?? []) as (Contact & { name: string })[]
  type FinRow = { snapshot_date: string; collected_revenue: number | null; expenses: number | null }
  const financials = (financialsResult.data ?? []) as FinRow[]

  const totalContacts = contacts.length
  const recentContacts = contacts.slice(0, 5)

  const now = new Date()
  const thisMonthDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const thisMonthFinancial = financials.find((f) => f.snapshot_date === thisMonthDate)
  const monthlyRevenue = thisMonthFinancial?.collected_revenue != null
    ? `$${Math.round(thisMonthFinancial.collected_revenue).toLocaleString()}`
    : '—'

  const stats = [
    { label: 'Total Contacts', value: String(totalContacts) },
    { label: 'Monthly Revenue', value: monthlyRevenue },
  ]

  return (
    <AppShell>
      <main className="flex-1 px-8 py-7 space-y-7">
        <div>
          <h2
            className="text-2xl text-[var(--ink)] mb-1"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Dashboard
          </h2>
          <p className="text-sm text-[var(--ink-3)]">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {stats.map(({ label, value }) => (
            <div
              key={label}
              className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 px-5 py-4"
            >
              <p className="text-xs text-[var(--ink-3)] mb-2 uppercase tracking-wide font-medium">
                {label}
              </p>
              <p
                className="text-3xl text-[var(--ink)] leading-none"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {value}
              </p>
            </div>
          ))}
        </div>

        <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--ink)]/8">
            <h2 className="text-sm font-medium text-[var(--ink)]">Recent Contacts</h2>
            <Link
              href="/contacts"
              className="text-xs text-[var(--accent-text)] hover:text-[var(--ink)] transition-colors"
            >
              View all
            </Link>
          </div>

          {recentContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <p className="text-sm text-[var(--ink-3)]">No contacts yet</p>
              <Link href="/contacts" className="text-xs text-[var(--accent-text)]">Add a contact →</Link>
            </div>
          ) : (
            <div className="divide-y divide-[var(--ink)]/6">
              {recentContacts.map((contact) => (
                <div key={contact.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--ink)] truncate">{contact.name}</p>
                    <p className="text-xs text-[var(--ink-3)] truncate mt-0.5">
                      {contact.email ?? '—'} · {formatDistanceToNow(new Date(contact.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {financials.length > 0 && (
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--ink)]/8">
              <h2 className="text-sm font-medium text-[var(--ink)]">Recent Financials</h2>
              <Link
                href="/financials"
                className="text-xs text-[var(--accent-text)] hover:text-[var(--ink)] transition-colors"
              >
                View all
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--ink)]/8">
                    <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Month</th>
                    <th className="text-right px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Revenue</th>
                    <th className="text-right px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Expenses</th>
                    <th className="text-right px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ink)]/6">
                  {financials.slice(0, 4).map((f) => {
                    const rev = f.collected_revenue != null ? Math.round(f.collected_revenue) : null
                    const exp = f.expenses != null ? Math.round(f.expenses) : null
                    const net = rev != null && exp != null ? rev - exp : null
                    const monthYear = new Date(f.snapshot_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                    return (
                      <tr key={f.snapshot_date} className="hover:bg-[var(--canvas)] transition-colors">
                        <td className="px-5 py-3 text-[var(--ink-2)]">{monthYear}</td>
                        <td className="px-5 py-3 text-right text-[var(--ink)]">
                          {rev != null ? `$${rev.toLocaleString()}` : '—'}
                        </td>
                        <td className="px-5 py-3 text-right text-[var(--ink-2)]">
                          {exp != null ? `$${exp.toLocaleString()}` : '—'}
                        </td>
                        <td className={`px-5 py-3 text-right font-medium ${net != null ? (net >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]') : 'text-[var(--ink-3)]'}`}>
                          {net != null ? `$${net.toLocaleString()}` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </AppShell>
  )
}
