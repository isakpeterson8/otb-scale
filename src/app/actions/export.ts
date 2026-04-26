'use server'

import { getStudioId } from './_shared'

function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function row(values: unknown[]): string {
  return values.map(cell).join(',')
}

function dollars(cents: number | null | undefined): string {
  if (cents == null) return ''
  return (cents / 100).toFixed(2)
}

export async function exportContacts(): Promise<{ csv: string | null; error: string | null }> {
  const ctx = await getStudioId()
  if (!ctx) return { csv: null, error: 'Unauthorized' }
  const { supabase, studioId } = ctx

  const { data, error } = await supabase
    .from('contacts')
    .select('name, email, phone, status, notes, created_at')
    .eq('studio_id', studioId)
    .order('created_at', { ascending: false })

  if (error) return { csv: null, error: error.message }

  const headers = row(['Name', 'Email', 'Phone', 'Status', 'Notes', 'Created At'])
  const rows = (data ?? []).map(c =>
    row([c.name, c.email, c.phone, c.status, c.notes, c.created_at])
  )
  return { csv: [headers, ...rows].join('\n'), error: null }
}

export async function exportSchoolOutreach(): Promise<{ csv: string | null; error: string | null }> {
  const ctx = await getStudioId()
  if (!ctx) return { csv: null, error: 'Unauthorized' }
  const { supabase, studioId } = ctx

  const [schoolsRes, cadenceRes] = await Promise.all([
    supabase
      .from('school_outreach')
      .select('id, school_name, contact_name, email, phone, stage, first_contact_date, last_interacted_date, next_step, next_step_due_date, notes')
      .eq('studio_id', studioId)
      .order('school_name'),
    supabase
      .from('cadence_enrollments')
      .select('school_id, status, current_email_number, email_1_sent_at, email_2_sent_at, email_3_sent_at, email_4_sent_at')
      .eq('user_id', ctx.userId)
      .order('created_at', { ascending: false }),
  ])

  if (schoolsRes.error) return { csv: null, error: schoolsRes.error.message }

  const latestCadence = new Map<string, { status: string; emails_sent: number }>()
  for (const c of (cadenceRes.data ?? [])) {
    if (!latestCadence.has(c.school_id)) {
      const emailsSent = [c.email_1_sent_at, c.email_2_sent_at, c.email_3_sent_at, c.email_4_sent_at].filter(Boolean).length
      latestCadence.set(c.school_id, { status: c.status, emails_sent: emailsSent })
    }
  }

  const headers = row([
    'School Name', 'Contact Name', 'Email', 'Phone', 'Stage',
    'Cadence Status', 'Emails Sent',
    'First Contact Date', 'Last Interacted Date',
    'Next Step', 'Next Step Due', 'Notes',
  ])
  const rows = (schoolsRes.data ?? []).map(s => {
    const cad = latestCadence.get(s.id)
    return row([
      s.school_name, s.contact_name, s.email, s.phone, s.stage,
      cad?.status ?? '', cad?.emails_sent ?? '',
      s.first_contact_date, s.last_interacted_date,
      s.next_step, s.next_step_due_date, s.notes,
    ])
  })
  return { csv: [headers, ...rows].join('\n'), error: null }
}

export async function exportPipeline(): Promise<{ csv: string | null; error: string | null }> {
  const ctx = await getStudioId()
  if (!ctx) return { csv: null, error: 'Unauthorized' }
  const { supabase, studioId } = ctx

  const { data, error } = await supabase
    .from('pipeline_events')
    .select('event_date, stage, notes, contacts(name, email)')
    .eq('studio_id', studioId)
    .order('event_date', { ascending: false })

  if (error) return { csv: null, error: error.message }

  const headers = row(['Event Date', 'Contact Name', 'Contact Email', 'Stage', 'Notes'])
  const rows = (data ?? []).map(e => {
    const contact = Array.isArray(e.contacts) ? e.contacts[0] : e.contacts
    return row([e.event_date, contact?.name ?? '', contact?.email ?? '', e.stage, e.notes])
  })
  return { csv: [headers, ...rows].join('\n'), error: null }
}

export async function exportFacebookGroups(): Promise<{ csv: string | null; error: string | null }> {
  const ctx = await getStudioId()
  if (!ctx) return { csv: null, error: 'Unauthorized' }
  const { supabase, studioId } = ctx

  const { data, error } = await supabase
    .from('facebook_groups')
    .select('group_name, group_url, group_location, group_membership_size, post_type, shared_with, posting_rules, application_date, acceptance_date, most_recent_post_date, is_active')
    .eq('studio_id', studioId)
    .order('group_name')

  if (error) return { csv: null, error: error.message }

  const headers = row([
    'Group Name', 'URL', 'Location', 'Members', 'Post Type',
    'Shared With', 'Posting Rules', 'Application Date', 'Acceptance Date',
    'Last Post Date', 'Active',
  ])
  const rows = (data ?? []).map(g =>
    row([
      g.group_name, g.group_url, g.group_location, g.group_membership_size,
      g.post_type, g.shared_with, g.posting_rules,
      g.application_date, g.acceptance_date, g.most_recent_post_date,
      g.is_active ? 'Yes' : 'No',
    ])
  )
  return { csv: [headers, ...rows].join('\n'), error: null }
}

export async function exportFinancials(): Promise<{ csv: string | null; error: string | null }> {
  const ctx = await getStudioId()
  if (!ctx) return { csv: null, error: 'Unauthorized' }
  const { supabase, studioId } = ctx

  const { data, error } = await supabase
    .from('studio_snapshots')
    .select('snapshot_date, enrollment, booked_hrs, goal_hrs, avail_hrs, leads, consults, poss_reg, new_enrollments, disenrollments, est_revenue, collected_revenue, expenses')
    .eq('studio_id', studioId)
    .order('snapshot_date', { ascending: false })

  if (error) return { csv: null, error: error.message }

  const headers = row([
    'Date', 'Enrollment', 'Booked Hrs', 'Goal Hrs', 'Avail Hrs',
    'Leads', 'Consults', 'Poss Reg', 'New Enrollments', 'Disenrollments',
    'Est Revenue', 'Collected Revenue', 'Expenses', 'Net',
  ])
  const rows = (data ?? []).map(f => {
    const net = (f.collected_revenue ?? 0) - (f.expenses ?? 0)
    return row([
      f.snapshot_date, f.enrollment, f.booked_hrs, f.goal_hrs, f.avail_hrs,
      f.leads, f.consults, f.poss_reg, f.new_enrollments, f.disenrollments,
      f.est_revenue, f.collected_revenue, f.expenses, net.toFixed(2),
    ])
  })
  return { csv: [headers, ...rows].join('\n'), error: null }
}
