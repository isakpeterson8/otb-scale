#!/usr/bin/env node
/**
 * ⚠️  NON-PRODUCTION ONLY. This script creates throwaway auth users, studios,
 * schools and cadence enrollments (and deletes them afterwards). Only run it
 * against a non-production Supabase project: point NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY at that project
 * first. Do NOT run it with the production keys in .env / .env.local.
 *
 * verify-cadence-stage.ts
 *
 * Proves the shared cadence logic in src/lib/cadence-progress.ts, as a real
 * NON-staff member signed in through the anon key (so RLS applies exactly as it
 * does for the School Outreach server actions):
 *
 *   - enroll → mark email 1 sent → school moves Lead → Initial Contact,
 *     email 2 due 6 days later;
 *   - marking the same email twice is refused (double click / two tabs);
 *   - mark #2 sent, then undo: back to email 1 sent, email 2 due recomputed,
 *     stage unchanged; a stale undo is refused;
 *   - a school already past Initial Contact is never moved back by a send;
 *   - undoing email 1 moves Initial Contact back to Lead;
 *   - bulk stage change on 3 schools is forward-only;
 *   - reply detection never moves Not Interested back to Replied;
 *   - another studio's school can't be moved.
 *
 * Writes to whichever project the env points at: creates a disposable user,
 * two studios and their schools/enrollments, then deletes all of it in a
 * finally block.
 *
 * Usage:
 *   node --experimental-strip-types scripts/verify-cadence-stage.ts
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// Loaded at runtime with its .ts extension (node strip-types needs it; tsc
// doesn't allow it in a static import).
const LIB_PATH = join(ROOT, 'src/lib/cadence-progress.ts')
const lib = (await import(LIB_PATH)) as typeof import('../src/lib/cadence-progress')

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const file of ['.env', '.env.local']) {
    try {
      for (const line of readFileSync(join(ROOT, file), 'utf-8').split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.+)$/)
        if (m && !env[m[1].trim()]) env[m[1].trim()] = m[2].trim()
      }
    } catch {
      // file may not exist
    }
  }
  return env
}

const env = loadEnv()
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!URL || !SERVICE_KEY || !ANON_KEY) {
  console.error('❌  Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY across .env / .env.local')
  process.exit(1)
}

const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })
const results: { name: string; pass: boolean }[] = []
function assert(name: string, pass: boolean, detail: string) {
  results.push({ name, pass })
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'}  ${name}\n         ${detail}`)
}

const DAY = 24 * 60 * 60 * 1000
const near = (a: string | null, b: number) => !!a && Math.abs(new Date(a).getTime() - b) < 60_000

async function stageOf(id: string): Promise<string> {
  const { data, error } = await admin.from('school_outreach').select('stage').eq('id', id).single()
  if (error || !data) throw new Error(`read school ${id}: ${error?.message}`)
  return data.stage as string
}

type Enr = {
  status: string; current_email_number: number | null
  email_1_sent_at: string | null; email_2_sent_at: string | null
  email_2_due_at: string | null; email_3_due_at: string | null
}
async function enrollmentOf(id: string): Promise<Enr> {
  const { data, error } = await admin
    .from('cadence_enrollments')
    .select('status, current_email_number, email_1_sent_at, email_2_sent_at, email_2_due_at, email_3_due_at')
    .eq('id', id)
    .single()
  if (error || !data) throw new Error(`read enrollment ${id}: ${error?.message}`)
  return data as Enr
}

async function main() {
  const stamp = Date.now()
  const email = `cadence.stage.${stamp}@example.com`
  const password = `Cs-${stamp}-${Math.random().toString(36).slice(2, 10)}!`
  let userId: string | null = null
  const studioIds: string[] = []

  try {
    // ── SETUP (service role) ─────────────────────────────────────────────────
    const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (createError || !created?.user) throw new Error(`createUser failed: ${createError?.message}`)
    userId = created.user.id

    for (const label of ['own', 'other']) {
      const { data: studio, error } = await admin
        .from('studios')
        .insert({ name: `CADENCE-STAGE TEST ${label} ${stamp}`, owner_user_id: null })
        .select('id')
        .single()
      if (error || !studio) throw new Error(`studio insert failed: ${error?.message}`)
      studioIds.push(studio.id)
    }
    const [own, other] = studioIds
    const { error: linkError } = await admin.from('profiles').update({ studio_id: own }).eq('id', userId)
    if (linkError) throw new Error(`profile link failed: ${linkError.message}`)

    async function school(name: string, stage: string, studioId = own): Promise<string> {
      const { data, error } = await admin
        .from('school_outreach')
        .insert({ studio_id: studioId, school_name: `${name} ${stamp}`, stage })
        .select('id')
        .single()
      if (error || !data) throw new Error(`school insert failed: ${error?.message}`)
      return data.id as string
    }

    // ── MEMBER SESSION (anon key, RLS applies) ───────────────────────────────
    const asUser: SupabaseClient = createClient(URL, ANON_KEY, { auth: { persistSession: false } })
    const { data: signIn, error: signInError } = await asUser.auth.signInWithPassword({ email, password })
    if (signInError || !signIn?.session) throw new Error(`sign-in failed: ${signInError?.message}`)
    const uid = userId

    async function enroll(schoolId: string): Promise<string> {
      // Same insert as enrollInCadence / bulkEnrollInCadence.
      const { data, error } = await asUser
        .from('cadence_enrollments')
        .insert({ school_id: schoolId, user_id: uid, opening_template: 'initial_contact', current_email_number: 0, status: 'active' })
        .select('id')
        .single()
      if (error || !data) throw new Error(`enroll failed: ${error?.message}`)
      return data.id as string
    }

    // 1. Enroll → mark email 1 sent → Initial Contact.
    const a = await school('Lead school', 'lead')
    const enrA = await enroll(a)
    const t1 = Date.now()
    const r1 = await lib.recordEmailSent(asUser, uid, enrA, 1)
    let e = await enrollmentOf(enrA)
    assert(
      'mark email 1 sent moves Lead → Initial Contact',
      !r1.error && r1.stageAdvanced && (await stageOf(a)) === 'initial_contact',
      `error=${r1.error}, stageAdvanced=${r1.stageAdvanced}, stage=${await stageOf(a)}`,
    )
    assert(
      'email 1 recorded, email 2 due in 6 days',
      e.current_email_number === 1 && !!e.email_1_sent_at && near(e.email_2_due_at, t1 + 6 * DAY),
      `current=${e.current_email_number}, email_2_due_at=${e.email_2_due_at}`,
    )

    // 2. Double mark refused.
    const dup = await lib.recordEmailSent(asUser, uid, enrA, 1)
    e = await enrollmentOf(enrA)
    assert('marking email 1 again is refused', !!dup.error && e.current_email_number === 1, `error=${dup.error}`)

    // 3. Mark #2, then undo.
    const r2 = await lib.recordEmailSent(asUser, uid, enrA, 2)
    e = await enrollmentOf(enrA)
    assert('mark #2 sent', !r2.error && e.current_email_number === 2 && !!e.email_2_sent_at && !!e.email_3_due_at,
      `error=${r2.error}, current=${e.current_email_number}, email_3_due_at=${e.email_3_due_at}`)
    const u2 = await lib.undoEmailSent(asUser, uid, enrA, 2)
    e = await enrollmentOf(enrA)
    const expectedDue = new Date(e.email_1_sent_at!).getTime() + 6 * DAY
    assert(
      'undo #2: back to email 1 sent, email 2 due recomputed, email 3 due cleared',
      !u2.error && u2.emailNumber === 2 && e.current_email_number === 1 && e.email_2_sent_at === null &&
        e.email_3_due_at === null && near(e.email_2_due_at, expectedDue) && e.status === 'active',
      `error=${u2.error}, current=${e.current_email_number}, email_2_sent_at=${e.email_2_sent_at}, email_2_due_at=${e.email_2_due_at}, email_3_due_at=${e.email_3_due_at}`,
    )
    assert('undo #2 leaves the stage at Initial Contact', !u2.stageReverted && (await stageOf(a)) === 'initial_contact', `stage=${await stageOf(a)}`)
    const stale = await lib.undoEmailSent(asUser, uid, enrA, 2)
    e = await enrollmentOf(enrA)
    assert('a stale undo (#2 again) is refused', !!stale.error && e.current_email_number === 1, `error=${stale.error}`)

    // 4. Forward-only on send.
    const b = await school('Scheduled school', 'visit_scheduled')
    const enrB = await enroll(b)
    const rb = await lib.recordEmailSent(asUser, uid, enrB, 1)
    assert('mark sent never moves Visit Scheduled back', !rb.error && !rb.stageAdvanced && (await stageOf(b)) === 'visit_scheduled',
      `error=${rb.error}, stage=${await stageOf(b)}`)

    // 5. Undo email 1 → back to Lead.
    const u1 = await lib.undoEmailSent(asUser, uid, enrA, 1)
    e = await enrollmentOf(enrA)
    assert('undo email 1 moves Initial Contact back to Lead',
      !u1.error && u1.stageReverted && (await stageOf(a)) === 'lead' && e.current_email_number === 0 && e.email_2_due_at === null,
      `error=${u1.error}, stage=${await stageOf(a)}, current=${e.current_email_number}`)

    // 6. Bulk stage change on 3 schools, forward-only.
    const s1 = await school('Bulk lead', 'lead')
    const s2 = await school('Bulk initial', 'initial_contact')
    const s3 = await school('Bulk completed', 'visit_completed')
    const bulk = await lib.advanceSchoolStage(asUser, [s1, s2, s3], 'replied', { studioId: own })
    const stages = [await stageOf(s1), await stageOf(s2), await stageOf(s3)]
    assert('bulk → Replied moves Lead and Initial Contact, leaves Visit Completed',
      !bulk.error && bulk.advanced.length === 2 && stages.join() === 'replied,replied,visit_completed',
      `error=${bulk.error}, moved=${bulk.advanced.length}, stages=${stages.join(', ')}`)

    // 7. Reply detection never moves Not Interested back.
    const ni = await school('Not interested', 'not_interested')
    await lib.advanceSchoolStage(asUser, ni, 'replied')
    assert('reply detection leaves Not Interested alone', (await stageOf(ni)) === 'not_interested', `stage=${await stageOf(ni)}`)

    // 8. Other studio's school is out of reach.
    const foreign = await school('Foreign lead', 'lead', other)
    const f = await lib.advanceSchoolStage(asUser, foreign, 'replied')
    assert("another studio's school can't be moved", f.advanced.length === 0 && (await stageOf(foreign)) === 'lead',
      `moved=${f.advanced.length}, stage=${await stageOf(foreign)}`)
  } finally {
    // ── TEARDOWN ─────────────────────────────────────────────────────────────
    // school_outreach → cadence_enrollments cascade.
    const steps: string[] = []
    for (const id of studioIds) {
      const { error } = await admin.from('school_outreach').delete().eq('studio_id', id)
      steps.push(`schools ${error ? 'FAILED — ' + error.message : 'deleted'}`)
    }
    if (userId) {
      await admin.from('profiles').delete().eq('id', userId)
      const { error } = await admin.auth.admin.deleteUser(userId)
      steps.push(`user ${error ? 'FAILED — ' + error.message : 'deleted'}`)
    }
    for (const id of studioIds) {
      const { error } = await admin.from('studios').delete().eq('id', id)
      steps.push(`studio ${error ? 'FAILED — ' + error.message : 'deleted'}`)
    }
    console.log(`\nTeardown: ${steps.join(', ')}`)
  }

  const failed = results.filter(r => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (failed.length) process.exit(1)
}

main().catch(err => {
  console.error('❌ ', err instanceof Error ? err.message : err)
  process.exit(1)
})
