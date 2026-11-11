/**
 * The one place a cadence email is recorded as sent (or un-sent), and the one
 * place a school's stage is moved automatically.
 *
 * Every "email sent" path goes through recordEmailSent: the manual "Mark #N
 * sent" button, Send via Gmail, and the bulk "Mark next email sent". It moves
 * the cadence one step, sets the next due date, and moves the school forward
 * Lead → Initial Contact.
 *
 * Stage moves are forward-only: advanceSchoolStage only updates schools whose
 * stage_rank is below the target's, so a school that is already further along
 * (Replied, Visit Scheduled, Not Interested, …) is never moved back.
 *
 * Callers pass the Supabase client they already hold, so RLS applies as the
 * signed-in member. Kept free of Next.js imports so scripts can call it too.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SchoolOutreachStage } from '@/types/database'

/** Mirrors the generated school_outreach.stage_rank column (20261101000001_list_views.sql). */
export const SCHOOL_STAGE_RANK: Record<SchoolOutreachStage, number> = {
  lead: 1,
  initial_contact: 2,
  replied: 3,
  classroom_visit_offered: 4,
  visit_scheduled: 5,
  visit_completed: 6,
  not_interested: 7,
}

export function isSchoolStage(v: unknown): v is SchoolOutreachStage {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(SCHOOL_STAGE_RANK, v)
}

/** Days between cadence emails. */
export const CADENCE_GAP_DAYS = 6
const DAY_MS = 24 * 60 * 60 * 1000
const LAST_EMAIL = 4

/**
 * Moves the given schools to `target`, but only those currently BEFORE it in
 * the pipeline. Returns the ids that actually moved.
 */
export async function advanceSchoolStage(
  supabase: SupabaseClient,
  schoolIds: string | string[],
  target: SchoolOutreachStage,
  opts: { studioId?: string } = {},
): Promise<{ advanced: string[]; error: string | null }> {
  const ids = Array.isArray(schoolIds) ? schoolIds : [schoolIds]
  if (ids.length === 0) return { advanced: [], error: null }

  let q = supabase
    .from('school_outreach')
    .update({ stage: target })
    .in('id', ids)
    .lt('stage_rank', SCHOOL_STAGE_RANK[target])
  if (opts.studioId) q = q.eq('studio_id', opts.studioId)

  const { data, error } = await q.select('id')
  if (error) return { advanced: [], error: error.message }
  return { advanced: ((data ?? []) as { id: string }[]).map(r => r.id), error: null }
}

type EnrollmentRow = {
  id: string
  school_id: string
  status: string
  current_email_number: number | null
  email_1_sent_at: string | null
  email_2_sent_at: string | null
  email_3_sent_at: string | null
  email_4_sent_at: string | null
}

const ENROLLMENT_COLS =
  'id, school_id, status, current_email_number, email_1_sent_at, email_2_sent_at, email_3_sent_at, email_4_sent_at'

async function loadEnrollment(supabase: SupabaseClient, userId: string, enrollmentId: string) {
  const { data, error } = await supabase
    .from('cadence_enrollments')
    .select(ENROLLMENT_COLS)
    .eq('id', enrollmentId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return { row: null, error: error.message }
  if (!data) return { row: null, error: 'Cadence not found.' }
  return { row: data as EnrollmentRow, error: null }
}

export type RecordSentResult = {
  error: string | null
  schoolId: string | null
  /** True when this send moved the school from Lead to Initial Contact. */
  stageAdvanced: boolean
}

/**
 * Records email `emailNumber` of an enrollment as sent, sets the next email's
 * due date, and moves the school Lead → Initial Contact.
 *
 * `emailNumber` must be the enrollment's next email. The update is conditional
 * on current_email_number still being the value read, so a double click or two
 * open tabs can't skip an email.
 */
export async function recordEmailSent(
  supabase: SupabaseClient,
  userId: string,
  enrollmentId: string,
  emailNumber: number,
  now: Date = new Date(),
): Promise<RecordSentResult> {
  const fail = (error: string): RecordSentResult => ({ error, schoolId: null, stageAdvanced: false })
  if (!Number.isInteger(emailNumber) || emailNumber < 1 || emailNumber > LAST_EMAIL) return fail('Invalid email number.')

  const { row, error: loadError } = await loadEnrollment(supabase, userId, enrollmentId)
  if (!row) return fail(loadError ?? 'Cadence not found.')
  if (row.status !== 'active') return fail('This school is no longer in an active cadence.')

  const current = row.current_email_number ?? 0
  if (emailNumber !== current + 1) {
    return fail(
      emailNumber <= current
        ? `Email ${emailNumber} is already marked sent.`
        : `Email ${current + 1} hasn't been marked sent yet.`,
    )
  }

  const isLast = emailNumber === LAST_EMAIL
  const updates: Record<string, unknown> = {
    [`email_${emailNumber}_sent_at`]: now.toISOString(),
    current_email_number: emailNumber,
    status: isLast ? 'completed' : 'active',
  }
  if (!isLast) {
    updates[`email_${emailNumber + 1}_due_at`] = new Date(now.getTime() + CADENCE_GAP_DAYS * DAY_MS).toISOString()
  }

  let q = supabase.from('cadence_enrollments').update(updates).eq('id', enrollmentId).eq('user_id', userId)
  q = row.current_email_number === null ? q.is('current_email_number', null) : q.eq('current_email_number', current)
  const { data: updated, error } = await q.select('id')
  if (error) return fail(error.message)
  if (!updated?.length) return fail('This cadence changed in the meantime. Refresh and try again.')

  const { advanced, error: stageError } = await advanceSchoolStage(supabase, row.school_id, 'initial_contact')
  // The email is recorded either way; a stage failure is logged, not surfaced
  // as "not sent".
  if (stageError) console.error('[recordEmailSent] stage advance failed:', stageError)

  return { error: null, schoolId: row.school_id, stageAdvanced: advanced.length > 0 }
}

export type UndoSentResult = {
  error: string | null
  schoolId: string | null
  /** The email that was un-marked. */
  emailNumber: number | null
  /** True when undoing email 1 moved the school back from Initial Contact to Lead. */
  stageReverted: boolean
}

/**
 * Moves an enrollment back one step: clears the last email's sent date,
 * clears the due date that send set, and recomputes the now-next email's due
 * date from the previous email's sent date.
 *
 * Pass `expectedEmailNumber` (the email the caller thinks it is undoing) so a
 * stale Undo can't roll back a different email.
 *
 * Undoing email 1 moves the school back Initial Contact → Lead, but only when
 * no other cadence email to that school is still marked sent. Any later stage
 * is left alone.
 */
export async function undoEmailSent(
  supabase: SupabaseClient,
  userId: string,
  enrollmentId: string,
  expectedEmailNumber?: number,
): Promise<UndoSentResult> {
  const fail = (error: string): UndoSentResult => ({ error, schoolId: null, emailNumber: null, stageReverted: false })

  const { row, error: loadError } = await loadEnrollment(supabase, userId, enrollmentId)
  if (!row) return fail(loadError ?? 'Cadence not found.')

  const n = row.current_email_number ?? 0
  if (n < 1) return fail('No email has been marked sent yet.')
  if (expectedEmailNumber !== undefined && n !== expectedEmailNumber) {
    return fail(`Nothing undone: the latest email marked sent is now email ${n}.`)
  }
  const undoable = row.status === 'active' || (row.status === 'completed' && n === LAST_EMAIL)
  if (!undoable) return fail('This cadence was removed or got a reply, so it can’t be stepped back.')

  const updates: Record<string, unknown> = {
    [`email_${n}_sent_at`]: null,
    current_email_number: n - 1,
    status: 'active',
  }
  if (n < LAST_EMAIL) updates[`email_${n + 1}_due_at`] = null
  if (n - 1 >= 1) {
    const prevSent = row[`email_${n - 1}_sent_at` as keyof EnrollmentRow] as string | null
    if (prevSent) updates[`email_${n}_due_at`] = new Date(new Date(prevSent).getTime() + CADENCE_GAP_DAYS * DAY_MS).toISOString()
  }

  const { data: updated, error } = await supabase
    .from('cadence_enrollments')
    .update(updates)
    .eq('id', enrollmentId)
    .eq('user_id', userId)
    .eq('current_email_number', n)
    .select('id')
  if (error) return fail(error.message)
  if (!updated?.length) return fail('This cadence changed in the meantime. Refresh and try again.')

  let stageReverted = false
  if (n === 1) {
    const { count, error: countError } = await supabase
      .from('cadence_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', row.school_id)
      .or('email_1_sent_at.not.is.null,email_2_sent_at.not.is.null,email_3_sent_at.not.is.null,email_4_sent_at.not.is.null')
    if (!countError && (count ?? 0) === 0) {
      const { data: reverted } = await supabase
        .from('school_outreach')
        .update({ stage: 'lead' })
        .eq('id', row.school_id)
        .eq('stage', 'initial_contact')
        .select('id')
      stageReverted = !!reverted?.length
    }
  }

  return { error: null, schoolId: row.school_id, emailNumber: n, stageReverted }
}

/** Runs `fn` over `items` with at most `limit` in flight, keeping order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}
