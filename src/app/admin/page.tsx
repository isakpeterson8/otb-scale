import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'
import { formatDate } from '@/lib/utils'
import type { Studio, Profile } from '@/types/database'

export default async function AdminPage() {
  const supabase = await createClient()

  const [studiosResult, profilesResult, contactsResult, pipelineResult] = await Promise.all([
    supabase.from('studios').select('*').order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, studio_id, role, display_name, email, created_at'),
    supabase.from('contacts').select('id, studio_id, created_at'),
    supabase.from('pipeline_events').select('id, studio_id, stage'),
  ])

  const studios = (studiosResult.data ?? []) as Studio[]
  const profiles = (profilesResult.data ?? []) as Profile[]
  const contacts = contactsResult.data ?? []
  const pipeline = pipelineResult.data ?? []

  const contactsByStudio = contacts.reduce<Record<string, number>>((acc, c) => {
    acc[c.studio_id] = (acc[c.studio_id] ?? 0) + 1
    return acc
  }, {})

  const enrolledByStudio = pipeline
    .filter((e) => e.stage === 'new_enrollment')
    .reduce<Record<string, number>>((acc, e) => {
      acc[e.studio_id] = (acc[e.studio_id] ?? 0) + 1
      return acc
    }, {})

  const profilesByStudio = profiles.reduce<Record<string, Profile>>((acc, p) => {
    if (p.studio_id) acc[p.studio_id] = p
    return acc
  }, {})

  const totalStudios = studios.length
  const totalContacts = contacts.length
  const totalEnrolled = pipeline.filter((e) => e.stage === 'enrolled').length
  const adminCount = profiles.filter((p) => p.role === 'otb_admin').length

  return (
    <AppShell>
      <main className="flex-1 px-8 py-7 space-y-7">
        <div>
          <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
            Admin
          </h2>
          <p className="text-sm text-[var(--ink-3)] mt-0.5">All studios across the platform</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Studios', value: String(totalStudios) },
            { label: 'Total Contacts', value: String(totalContacts) },
            { label: 'Total Enrolled', value: String(totalEnrolled) },
            { label: 'OTB Admins', value: String(adminCount) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 px-5 py-4">
              <p className="text-xs text-[var(--ink-3)] mb-2 uppercase tracking-wide font-medium">{label}</p>
              <p className="text-3xl text-[var(--ink)] leading-none" style={{ fontFamily: 'var(--font-heading)' }}>
                {value}
              </p>
            </div>
          ))}
        </div>

        <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--ink)]/8">
            <h3 className="text-sm font-medium text-[var(--ink)]">All Studios</h3>
          </div>
          {studios.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <p className="text-sm text-[var(--ink-3)]">No studios yet.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ink)]/8">
                  <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Studio</th>
                  <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide hidden md:table-cell">Owner</th>
                  <th className="text-right px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Contacts</th>
                  <th className="text-right px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Enrolled</th>
                  <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide hidden lg:table-cell">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ink)]/6">
                {studios.map((studio) => {
                  const owner = profilesByStudio[studio.id]
                  return (
                    <tr key={studio.id} className="hover:bg-[var(--canvas)] transition-colors">
                      <td className="px-5 py-3">
                        <div>
                          <p className="font-medium text-[var(--ink)]">{studio.name}</p>
                          {(studio.city || studio.state) && (
                            <p className="text-xs text-[var(--ink-3)]">
                              {[studio.city, studio.state].filter(Boolean).join(', ')}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-[var(--ink-2)] hidden md:table-cell">
                        {owner?.display_name ?? owner?.email ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-right text-[var(--ink-2)]">
                        {contactsByStudio[studio.id] ?? 0}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className={`text-sm font-medium ${(enrolledByStudio[studio.id] ?? 0) > 0 ? 'text-[var(--green)]' : 'text-[var(--ink-3)]'}`}>
                          {enrolledByStudio[studio.id] ?? 0}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[var(--ink-3)] text-xs hidden lg:table-cell">
                        {formatDate(studio.created_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--ink)]/8">
            <h3 className="text-sm font-medium text-[var(--ink)]">All Users</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ink)]/8">
                <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Name</th>
                <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide hidden md:table-cell">Email</th>
                <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Role</th>
                <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide hidden lg:table-cell">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ink)]/6">
              {profiles.map((profile) => (
                <tr key={profile.id} className="hover:bg-[var(--canvas)] transition-colors">
                  <td className="px-5 py-3 text-[var(--ink)]">{profile.display_name ?? '—'}</td>
                  <td className="px-5 py-3 text-[var(--ink-2)] hidden md:table-cell">{profile.email ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span className={[
                      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                      profile.role === 'otb_admin'
                        ? 'bg-[var(--accent-light)] text-[var(--accent-text)]'
                        : 'bg-white/8 text-[var(--ink-2)]',
                    ].join(' ')}>
                      {profile.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[var(--ink-3)] text-xs hidden lg:table-cell">
                    {formatDate(profile.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </AppShell>
  )
}
