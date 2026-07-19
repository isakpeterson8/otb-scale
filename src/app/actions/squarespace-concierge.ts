'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { getStudioId } from '@/app/actions/_shared'
import { Resend } from 'resend'
import { COPY_PACK_PROMPT, CIRCLE_SYNC_PROMPT } from '@/lib/squarespace-prompts'
import type {
  SquarespaceRequest,
  SquaresspaceSite,
  SquaresspaceSyncLog,
  RequestType,
  RequestStatus,
  SiteStatus,
  SiteDateType,
} from '@/types/database'

const resend = new Resend(process.env.RESEND_API_KEY)

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await adminClient
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'otb_admin' || profile?.role === 'otb_staff') return user
  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase())
  if (user.email && adminEmails.includes(user.email.toLowerCase())) return user
  return null
}

function emailShell(bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td align="center" style="padding-bottom:24px;">
          <img src="https://studio.outsidethebachs.com/otb-logo.png" alt="Outside The Bachs" width="140" style="display:block;"/>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:12px;padding:36px 40px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
          ${bodyContent}
        </td></tr>
        <tr><td align="center" style="padding-top:24px;font-size:12px;color:#9ca3af;">
          <a href="https://outsidethebachs.com" style="color:#9ca3af;text-decoration:none;">outsidethebachs.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  new_build:        'New website build',
  refresh:          'Refresh existing site',
  support:          'Support / fix',
  billing_transfer: 'Billing transfer',
}

// ── Member actions ────────────────────────────────────────────────────────────

export type SubmitInput = {
  request_type: RequestType
  // new_build
  studio_name?: string
  owner_name?: string
  city_state?: string
  instruments?: string
  ages_served?: string
  teaching_format?: string
  booking_platform?: string
  booking_url?: string
  existing_domain?: string
  current_site_url?: string
  gbp_url?: string
  logo_asset_link?: string
  brand_colors?: string
  example_sites?: string
  bio?: string
  testimonials_link?: string
  show_pricing?: boolean
  primary_cta?: string
  // refresh/support/billing_transfer
  site_id?: string
  site_reference?: string
  details?: string
}

export async function submitSquarespaceRequest(
  input: SubmitInput
): Promise<{ error?: string }> {
  const ctx = await getStudioId()
  if (!ctx) return { error: 'Not authenticated' }
  if (ctx.viewOnly) return { error: 'Cannot submit requests in View As mode' }
  const { studioId, userId, userEmail } = ctx

  const { error } = await adminClient.from('squarespace_requests').insert({
    studio_id:        studioId,
    user_id:          userId,
    request_type:     input.request_type,
    status:           'requested',
    site_id:          input.site_id ?? null,
    studio_name:      input.studio_name ?? null,
    owner_name:       input.owner_name ?? null,
    city_state:       input.city_state ?? null,
    instruments:      input.instruments ?? null,
    ages_served:      input.ages_served ?? null,
    teaching_format:  input.teaching_format ?? null,
    booking_platform: input.booking_platform ?? null,
    booking_url:      input.booking_url ?? null,
    existing_domain:  input.existing_domain ?? null,
    current_site_url: input.current_site_url ?? null,
    gbp_url:          input.gbp_url ?? null,
    logo_asset_link:  input.logo_asset_link ?? null,
    brand_colors:     input.brand_colors ?? null,
    example_sites:    input.example_sites ?? null,
    bio:              input.bio ?? null,
    testimonials_link: input.testimonials_link ?? null,
    show_pricing:     input.show_pricing ?? null,
    primary_cta:      input.primary_cta ?? null,
    site_reference:   input.site_reference ?? null,
    details:          input.details ?? null,
  })

  if (error) return { error: error.message }

  // Confirmation email to member
  const memberEmail = userEmail
  if (memberEmail) {
    const typeLabel = REQUEST_TYPE_LABELS[input.request_type]
    await resend.emails.send({
      from: 'Outside The Bachs <noreply@outsidethebachs.com>',
      to: [memberEmail],
      subject: `We received your Squarespace request — ${typeLabel}`,
      html: emailShell(`
        <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Request received!</h2>
        <p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
          Thanks for submitting your <strong>${typeLabel}</strong> request. Here's what happens next:
        </p>
        <ol style="margin:0 0 20px;padding-left:20px;font-size:14px;color:#374151;line-height:2;">
          <li>We review your intake and build a draft</li>
          <li>We send you a Squarespace Contributor invite</li>
          <li>You add personal photos and any final touches</li>
          <li>We launch and stay on as a contributor</li>
        </ol>
        <p style="margin:0;font-size:14px;color:#6b7280;">
          You can track your request status at
          <a href="https://studio.outsidethebachs.com/squarespace-concierge" style="color:#0284a8;">studio.outsidethebachs.com/squarespace-concierge</a>.
        </p>
      `),
      text: `Request received!\n\nThanks for submitting your ${typeLabel} request.\n\nWhat happens next:\n1. We review your intake and build a draft\n2. We send you a Squarespace Contributor invite\n3. You add personal photos and final touches\n4. We launch and stay on as a contributor\n\nTrack your request: https://studio.outsidethebachs.com/squarespace-concierge`,
    })
  }

  // Admin notification
  const adminEmails = process.env.ADMIN_NOTIFY_EMAILS ?? process.env.ADMIN_EMAILS ?? ''
  if (adminEmails) {
    const typeLabel = REQUEST_TYPE_LABELS[input.request_type]
    await resend.emails.send({
      from: 'Outside The Bachs <noreply@outsidethebachs.com>',
      to: adminEmails.split(',').map(e => e.trim()).filter(Boolean),
      subject: `New Squarespace request: ${typeLabel}`,
      text: [
        `New Squarespace concierge request`,
        `Type: ${typeLabel}`,
        input.studio_name ? `Studio: ${input.studio_name}` : '',
        input.owner_name  ? `Owner: ${input.owner_name}` : '',
        input.city_state  ? `Location: ${input.city_state}` : '',
        ``,
        `Review: https://studio.outsidethebachs.com/admin/concierge`,
      ].filter(Boolean).join('\n'),
      html: emailShell(`
        <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">New Squarespace Request</h2>
        <table style="width:100%;font-size:14px;color:#374151;border-collapse:collapse;">
          <tr><td style="padding:4px 0;color:#6b7280;width:120px;">Type</td><td>${typeLabel}</td></tr>
          ${input.studio_name ? `<tr><td style="padding:4px 0;color:#6b7280;">Studio</td><td>${input.studio_name}</td></tr>` : ''}
          ${input.owner_name  ? `<tr><td style="padding:4px 0;color:#6b7280;">Owner</td><td>${input.owner_name}</td></tr>` : ''}
          ${input.city_state  ? `<tr><td style="padding:4px 0;color:#6b7280;">Location</td><td>${input.city_state}</td></tr>` : ''}
        </table>
        <div style="margin-top:24px;">
          <a href="https://studio.outsidethebachs.com/admin/concierge"
             style="display:inline-block;padding:10px 20px;background:#0284a8;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
            View in pipeline →
          </a>
        </div>
      `),
    })
  }

  revalidatePath('/squarespace-concierge')
  return {}
}

export async function getMySquarespaceRequests(): Promise<SquarespaceRequest[]> {
  const ctx = await getStudioId()
  if (!ctx) return []
  const { userId } = ctx

  const { data } = await adminClient
    .from('squarespace_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  return (data ?? []) as SquarespaceRequest[]
}

export async function getMySquaresspaceSites(): Promise<SquaresspaceSite[]> {
  const ctx = await getStudioId()
  if (!ctx) return []
  const { userId } = ctx

  const { data } = await adminClient
    .from('squarespace_sites')
    .select('*')
    .eq('user_id', userId)
    .order('site_name', { ascending: true })

  return (data ?? []) as SquaresspaceSite[]
}

// ── Admin: pipeline ───────────────────────────────────────────────────────────

export async function getAllRequests(): Promise<SquarespaceRequest[]> {
  const caller = await requireAdmin()
  if (!caller) return []

  const { data } = await adminClient
    .from('squarespace_requests')
    .select('*')
    .order('created_at', { ascending: false })

  return (data ?? []) as SquarespaceRequest[]
}

export async function updateRequestStatus(
  id: string,
  status: RequestStatus
): Promise<{ error?: string }> {
  const caller = await requireAdmin()
  if (!caller) return { error: 'Unauthorized' }

  const { error } = await adminClient
    .from('squarespace_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/admin/concierge')
  return {}
}

export async function createSiteFromRequest(
  requestId: string
): Promise<{ siteId?: string; error?: string }> {
  const caller = await requireAdmin()
  if (!caller) return { error: 'Unauthorized' }

  const { data: req } = await adminClient
    .from('squarespace_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (!req) return { error: 'Request not found' }

  const { data: site, error: siteErr } = await adminClient
    .from('squarespace_sites')
    .insert({
      site_name:        req.studio_name ?? 'Unnamed Studio',
      primary_url:      req.current_site_url ?? null,
      scheduling_stack: req.booking_platform ?? null,
      user_id:          req.user_id,
      member_name:      req.owner_name ?? null,
      updated_at:       new Date().toISOString(),
    })
    .select('id')
    .single()

  if (siteErr || !site) return { error: siteErr?.message ?? 'Failed to create site' }

  await adminClient
    .from('squarespace_requests')
    .update({ site_id: site.id, updated_at: new Date().toISOString() })
    .eq('id', requestId)

  revalidatePath('/admin/concierge')
  revalidatePath('/admin/squarespace')
  return { siteId: site.id }
}

export async function generateCopyPack(
  requestId: string
): Promise<{ copyPack?: Record<string, unknown>; error?: string }> {
  const caller = await requireAdmin()
  if (!caller) return { error: 'Unauthorized' }

  const { data: req } = await adminClient
    .from('squarespace_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (!req) return { error: 'Request not found' }

  const intakeFields = {
    studio_name:      req.studio_name,
    owner_name:       req.owner_name,
    city_state:       req.city_state,
    instruments:      req.instruments,
    ages_served:      req.ages_served,
    teaching_format:  req.teaching_format,
    booking_platform: req.booking_platform,
    booking_url:      req.booking_url,
    gbp_url:          req.gbp_url,
    brand_colors:     req.brand_colors,
    example_sites:    req.example_sites,
    bio:              req.bio,
    testimonials_link: req.testimonials_link,
    show_pricing:     req.show_pricing,
    primary_cta:      req.primary_cta,
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY not configured' }

  const prompt = COPY_PACK_PROMPT.replace('{INTAKE_JSON}', JSON.stringify(intakeFields, null, 2))

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) return { error: `Claude API error: ${await res.text()}` }

  const data = await res.json()
  const raw = data.content?.[0]?.text ?? ''

  let copyPack: Record<string, unknown>
  try {
    copyPack = JSON.parse(raw)
  } catch {
    return { error: `Failed to parse Claude response as JSON: ${raw.slice(0, 200)}` }
  }

  const { error: updateErr } = await adminClient
    .from('squarespace_requests')
    .update({ copy_pack: copyPack, updated_at: new Date().toISOString() })
    .eq('id', requestId)

  if (updateErr) return { error: updateErr.message }

  revalidatePath('/admin/concierge')
  return { copyPack }
}

// ── Admin: registry ───────────────────────────────────────────────────────────

export async function getAllSites(): Promise<SquaresspaceSite[]> {
  const caller = await requireAdmin()
  if (!caller) return []

  const { data } = await adminClient
    .from('squarespace_sites')
    .select('*')
    .order('site_name', { ascending: true })

  return (data ?? []) as SquaresspaceSite[]
}

export async function updateSite(
  id: string,
  patch: Partial<Pick<SquaresspaceSite, 'plan_tier' | 'scheduling_stack' | 'template_version' | 'member_name' | 'notes' | 'status' | 'key_date' | 'date_type'>>
): Promise<{ error?: string }> {
  const caller = await requireAdmin()
  if (!caller) return { error: 'Unauthorized' }

  const { error } = await adminClient
    .from('squarespace_sites')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/admin/squarespace')
  return {}
}

export type CsvImportResult = {
  inserted: number
  updated: number
  skipped: number
  errors: string[]
}

export async function importSitesCsv(
  rows: Array<{
    site_name: string
    primary_url?: string
    is_custom_domain?: boolean
    status?: SiteStatus
    key_date?: string | null
    date_type?: SiteDateType
    circle_tags?: string
    plan_tier?: string
    scheduling_stack?: string
    template_version?: string
    member_name?: string
    notes?: string
  }>
): Promise<CsvImportResult> {
  const caller = await requireAdmin()
  if (!caller) return { inserted: 0, updated: 0, skipped: 0, errors: ['Unauthorized'] }

  const errors: string[] = []
  let inserted = 0
  let updated = 0
  let skipped = 0

  for (const row of rows) {
    if (!row.site_name?.trim()) { errors.push('Row missing site_name'); skipped++; continue }

    // Find existing by site_name + primary_url
    const { data: existing } = await adminClient
      .from('squarespace_sites')
      .select('id, plan_tier, scheduling_stack, template_version, member_name, notes')
      .eq('site_name', row.site_name.trim())
      .maybeSingle()

    if (existing) {
      // Never overwrite non-empty manual columns with blanks
      const patch: Record<string, unknown> = {
        primary_url:      row.primary_url ?? null,
        is_custom_domain: row.is_custom_domain ?? false,
        status:           row.status ?? 'active_trial',
        key_date:         row.key_date ?? null,
        date_type:        row.date_type ?? 'none',
        circle_tags:      row.circle_tags ?? null,
        updated_at:       new Date().toISOString(),
      }
      if (!existing.plan_tier        && row.plan_tier)        patch.plan_tier = row.plan_tier
      if (!existing.scheduling_stack && row.scheduling_stack) patch.scheduling_stack = row.scheduling_stack
      if (!existing.template_version && row.template_version) patch.template_version = row.template_version
      if (!existing.member_name      && row.member_name)      patch.member_name = row.member_name
      if (!existing.notes            && row.notes)            patch.notes = row.notes

      const { error } = await adminClient.from('squarespace_sites').update(patch).eq('id', existing.id)
      if (error) { errors.push(`Update failed for ${row.site_name}: ${error.message}`); skipped++ }
      else updated++
    } else {
      const { error } = await adminClient.from('squarespace_sites').insert({
        site_name:        row.site_name.trim(),
        primary_url:      row.primary_url ?? null,
        is_custom_domain: row.is_custom_domain ?? false,
        status:           row.status ?? 'active_trial',
        key_date:         row.key_date ?? null,
        date_type:        row.date_type ?? 'none',
        circle_tags:      row.circle_tags ?? null,
        plan_tier:        row.plan_tier ?? null,
        scheduling_stack: row.scheduling_stack ?? null,
        template_version: row.template_version ?? null,
        member_name:      row.member_name ?? null,
        notes:            row.notes ?? null,
      })
      if (error) { errors.push(`Insert failed for ${row.site_name}: ${error.message}`); skipped++ }
      else inserted++
    }
  }

  revalidatePath('/admin/squarespace')
  return { inserted, updated, skipped, errors }
}

// ── Phase 5: Circle sync ──────────────────────────────────────────────────────

export type CircleSyncRow = {
  site_name: string
  primary_url: string
  is_custom_domain: boolean
  status: SiteStatus
  key_date: string | null
  date_type: SiteDateType
  circle_tags: string
}

export type CircleDiff = {
  newSites: CircleSyncRow[]
  statusChanges: Array<{ existing: SquaresspaceSite; incoming: CircleSyncRow }>
  dateChanges: Array<{ existing: SquaresspaceSite; incoming: CircleSyncRow }>
  tagChanges: Array<{ existing: SquaresspaceSite; incoming: CircleSyncRow }>
  unchanged: number
}

export async function parseCircleDashboard(
  rawText: string
): Promise<{ diff?: CircleDiff; error?: string }> {
  const caller = await requireAdmin()
  if (!caller) return { error: 'Unauthorized' }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY not configured' }

  const prompt = CIRCLE_SYNC_PROMPT.replace('{DASHBOARD_TEXT}', rawText)

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) return { error: `Claude API error: ${await res.text()}` }

  const data = await res.json()
  const raw = data.content?.[0]?.text ?? ''

  let parsed: CircleSyncRow[]
  try {
    parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('not an array')
  } catch {
    return { error: `Failed to parse Claude response: ${raw.slice(0, 300)}` }
  }

  // Load existing sites for diffing
  const { data: existing } = await adminClient
    .from('squarespace_sites')
    .select('*')
    .order('site_name', { ascending: true })

  const existingMap = new Map<string, SquaresspaceSite>(
    (existing ?? []).map(s => [s.site_name.toLowerCase(), s as SquaresspaceSite])
  )

  const diff: CircleDiff = {
    newSites: [],
    statusChanges: [],
    dateChanges: [],
    tagChanges: [],
    unchanged: 0,
  }

  for (const row of parsed) {
    const match = existingMap.get(row.site_name.toLowerCase())
    if (!match) {
      diff.newSites.push(row)
      continue
    }
    const statusChanged = match.status !== row.status
    const dateChanged   = match.key_date !== row.key_date || match.date_type !== row.date_type
    const tagChanged    = (match.circle_tags ?? '') !== (row.circle_tags ?? '')

    if (statusChanged) diff.statusChanges.push({ existing: match, incoming: row })
    else if (dateChanged) diff.dateChanges.push({ existing: match, incoming: row })
    else if (tagChanged)  diff.tagChanges.push({ existing: match, incoming: row })
    else diff.unchanged++
  }

  return { diff }
}

export async function applyCircleSync(
  rows: CircleSyncRow[]
): Promise<{ error?: string; inserted: number; updated: number }> {
  const caller = await requireAdmin()
  if (!caller) return { error: 'Unauthorized', inserted: 0, updated: 0 }

  const { data: existing } = await adminClient
    .from('squarespace_sites')
    .select('id, site_name, plan_tier, scheduling_stack, template_version, member_name, notes')

  const existingMap = new Map<string, typeof existing extends (infer T)[] | null ? T : never>(
    (existing ?? []).map(s => [s!.site_name.toLowerCase(), s!])
  )

  let inserted = 0
  let updated = 0

  for (const row of rows) {
    const match = existingMap.get(row.site_name.toLowerCase())
    const now = new Date().toISOString()

    if (match) {
      await adminClient
        .from('squarespace_sites')
        .update({
          primary_url:      row.primary_url,
          is_custom_domain: row.is_custom_domain,
          status:           row.status,
          key_date:         row.key_date,
          date_type:        row.date_type,
          circle_tags:      row.circle_tags || null,
          updated_at:       now,
        })
        .eq('id', match.id)
      updated++
    } else {
      await adminClient
        .from('squarespace_sites')
        .insert({
          site_name:        row.site_name,
          primary_url:      row.primary_url,
          is_custom_domain: row.is_custom_domain,
          status:           row.status,
          key_date:         row.key_date,
          date_type:        row.date_type,
          circle_tags:      row.circle_tags || null,
        })
      inserted++
    }
  }

  // Log the sync
  await adminClient.from('squarespace_sync_log').insert({
    new_sites:       inserted,
    updated_sites:   updated,
    raw_input_chars: null,
    notes:           `${inserted} new, ${updated} updated`,
  })

  revalidatePath('/admin/squarespace')
  return { inserted, updated }
}

export async function getSyncLog(): Promise<SquaresspaceSyncLog[]> {
  const caller = await requireAdmin()
  if (!caller) return []
  const { data } = await adminClient
    .from('squarespace_sync_log')
    .select('*')
    .order('synced_at', { ascending: false })
    .limit(20)
  return (data ?? []) as SquaresspaceSyncLog[]
}
