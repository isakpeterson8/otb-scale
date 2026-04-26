import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'
import type { Contact, PipelineEvent, FinancialMonth } from '@/types/database'
import { PIPELINE_STAGES } from '@/types/database'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [contactsResult, pipelineResult, financialsResult, emailResult] = await Promise.all([
    supabase.from('contacts').select('id, status, created_at').order('created_at', { ascending: false }),
    supabase
      .from('pipeline_events')
      .select('id, stage, event_date, notes, contacts(name, email)')
      .order('event_date', { ascending: false }),
    supabase
      .from('financial_months')
      .select('month, revenue, expenses')
      .order('month', { ascending: false })
      .limit(6),
    supabase
      .from('email_sends')
      .select('id, sent_at, subject')
      .order('sent_at', { ascending: false })
      .limit(5),
  ])

  const contacts = (contactsResult.data ?? []) as Contact[]
  const pipeline = (pipelineResult.data ?? []) as unknown as (PipelineEvent & { contacts: { name: string; email: string | null } | null })[]
  const financials = (financialsResult.data ?? []) as FinancialMonth[]
  const recentEmails = emailResult.data ?? []

  const totalContacts = contacts.length
  const enrolledCount = pipeline.filter((e) => e.stage === 'new_enrollment').length
  const activeLeads = pipeline.filter((e) => !['new_enrollment', 'disenrolled'].includes(e.stage)).length

  const thisMonth = new Date().toISOString().slice(0, 7)
  const thisMonthFinancial = financials.find((f) => f.month === thisMonth)
  const monthlyRevenue = thisMonthFinancial?.revenue != null
    ? `$${(thisMonthFinancial.revenue / 100).toLocaleString()}`
    : '—'

  const recentPipeline = pipeline.slice(0, 5)

  const stats = [
    { label: 'Total Contacts', value: String(totalContacts) },
    { label: 'Active Leads', value: String(activeLeads) },
    { label: 'New Enrollments', value: String(enrolledCount) },
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

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--ink)]/8">
              <h2 className="text-sm font-medium text-[var(--ink)]">Recent Pipeline Activity</h2>
              <Link
                href="/pipeline"
                className="text-xs text-[var(--accent-text)] hover:text-[var(--ink)] transition-colors"
              >
                View all
              </Link>
            </div>

            {recentPipeline.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <p className="text-sm text-[var(--ink-3)]">No pipeline activity yet</p>
                <Link href="/pipeline" className="text-xs text-[var(--accent-text)]">Add an event →</Link>
              </div>
            ) : (
              <div className="divide-y divide-[var(--ink)]/6">
                {recentPipeline.map((event) => {
                  const contact = event.contacts as { name: string; email: string | null } | null
                  return (
                    <div key={event.id} className="flex items-center gap-3 px-5 py-3.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--ink)] truncate">
                          {contact?.name ?? 'Unknown'}
                        </p>
                        <p className="text-xs text-[var(--ink-3)] truncate mt-0.5">
                          {event.stage.replace(/_/g, ' ')} · {formatDistanceToNow(new Date(event.event_date), { addSuffix: true })}
                        </p>
                      </div>
                      <span
                        className={[
                          'shrink-0 text-xs px-2 py-0.5 rounded-full font-medium',
                          event.stage === 'new_enrollment'
                            ? 'bg-[var(--green-l)] text-[var(--green)]'
                            : event.stage === 'disenrolled'
                            ? 'bg-[var(--red-l)] text-[var(--red)]'
                            : 'bg-[var(--accent-light)] text-[var(--accent-text)]',
                        ].join(' ')}
                      >
                        {PIPELINE_STAGES.find((s) => s.value === event.stage)?.label ?? event.stage.replace(/_/g, ' ')}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="lg:col-span-2 bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--ink)]/8">
              <h2 className="text-sm font-medium text-[var(--ink)]">Recent Emails</h2>
              <Link
                href="/emails"
                className="text-xs text-[var(--accent-text)] hover:text-[var(--ink)] transition-colors"
              >
                View all
              </Link>
            </div>

            {recentEmails.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <p className="text-sm text-[var(--ink-3)]">No emails sent yet</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--ink)]/6">
                {recentEmails.map((email) => (
                  <div key={email.id} className="px-5 py-3.5">
                    <p className="text-sm text-[var(--ink)] truncate">{email.subject}</p>
                    <p className="text-xs text-[var(--ink-3)] mt-0.5">
                      {formatDistanceToNow(new Date(email.sent_at), { addSuffix: true })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
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
                    const rev = f.revenue != null ? f.revenue / 100 : null
                    const exp = f.expenses != null ? f.expenses / 100 : null
                    const net = rev != null && exp != null ? rev - exp : null
                    return (
                      <tr key={f.month} className="hover:bg-[var(--canvas)] transition-colors">
                        <td className="px-5 py-3 text-[var(--ink-2)]">{f.month}</td>
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
