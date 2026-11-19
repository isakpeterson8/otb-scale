// Live Support Sessions — server-only helpers. Never import from a client component:
// this module reads lss_settings (the Zoom join URL) with the service role.

import { adminClient } from '@/lib/supabase/admin'
import { getCachedClient, getCachedStudioTier } from '@/lib/supabase/cached'
import { getStudioId } from '@/app/actions/_shared'
import { hasFeatureAccess } from '@/lib/features'
import type { LssSessionSummary } from '@/lib/live-support'

export type LiveSupportAccess =
  | { status: 'anonymous' }
  | { status: 'denied'; tier: string }
  | { status: 'allowed'; tier: string; isAdmin: boolean; viewOnly: boolean }

/**
 * Whether the current viewer may use Live Support Sessions. Same shape as the
 * education library gate: under View As the VIEWED studio's tier decides, so an
 * admin viewing a Graduate studio sees the denial; a real admin otherwise passes.
 */
export async function getLiveSupportAccess(): Promise<LiveSupportAccess> {
  const ctx = await getStudioId()
  if (!ctx) return { status: 'anonymous' }
  const tier = await getCachedStudioTier(ctx.studioId)
  const allowed = ctx.viewOnly
    ? hasFeatureAccess(tier, 'live_support')
    : ctx.isAdmin || hasFeatureAccess(tier, 'live_support')
  return allowed
    ? { status: 'allowed', tier, isAdmin: ctx.isAdmin, viewOnly: ctx.viewOnly }
    : { status: 'denied', tier }
}

const SESSION_COLUMNS =
  'id, title, coach_names, starts_at, duration_minutes, description, facebook_event_url, recording_url'

/**
 * Sessions as the signed-in user sees them through RLS (Scale/Lifetime or staff).
 * Uses the request-scoped client, so a misconfigured gate fails closed (empty).
 */
export async function listLssSessions(): Promise<LssSessionSummary[]> {
  const supabase = await getCachedClient()
  const { data } = await supabase
    .from('lss_sessions')
    .select(SESSION_COLUMNS)
    .order('starts_at', { ascending: true })
  return (data ?? []) as LssSessionSummary[]
}

/** The shared Zoom join URL. Server-side only; never pass this to a client component. */
export async function readZoomJoinUrl(): Promise<string | null> {
  const { data } = await adminClient
    .from('lss_settings')
    .select('zoom_join_url')
    .eq('id', true)
    .maybeSingle()
  const url = (data?.zoom_join_url as string | null | undefined)?.trim()
  return url ? url : null
}

/** A display-safe stand-in for the Zoom URL: host plus the last 4 characters. */
export function maskZoomUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const tail = url.replace(/\/+$/, '').slice(-4)
    return `${u.host}/••••••${tail}`
  } catch {
    return '••••••'
  }
}
