#!/usr/bin/env node
/**
 * probe-school-outreach-rls.ts
 *
 * Proves the School Outreach boundary holds for a REAL non-admin session, and
 * that the composite foreign keys added by 20260927000001 make a cross-studio
 * row impossible rather than merely disallowed by policy.
 *
 * Every assertion runs through an anon-key client signed in as TEST_EMAIL. The
 * service-role key is used ONLY to create the fixtures the probe studio does not
 * have (it owns no schools) and to tear them down.
 *
 * WRITES: creates one school, two contacts and one activity row on the TEST
 * studio, then deletes all of it in a finally block. Also attempts several writes
 * that MUST be rejected; if any is accepted the script says so loudly and removes
 * the row it should not have been able to create.
 *
 * Usage:
 *   node --experimental-strip-types scripts/probe-school-outreach-rls.ts
 *
 * Exit 0 = the boundary holds. Non-zero = at least one check failed.
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

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
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const TEST_EMAIL = env.TEST_EMAIL
const TEST_PASSWORD = env.TEST_PASSWORD

if (!URL_ || !ANON) {
  console.error('❌  Need NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}
if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error('❌  Need TEST_EMAIL and TEST_PASSWORD in .env.local (a real NON-ADMIN account)')
  process.exit(1)
}
if (!SERVICE) {
  console.error('❌  Need SUPABASE_SERVICE_ROLE_KEY: this probe must create fixtures the test studio lacks')
  process.exit(1)
}

const results: { name: string; state: 'PASS' | 'FAIL' | 'SKIP'; detail: string }[] = []
function record(name: string, state: 'PASS' | 'FAIL' | 'SKIP', detail: string) {
  results.push({ name, state, detail })
  const icon = state === 'PASS' ? '✅ PASS' : state === 'FAIL' ? '❌ FAIL' : '⏭  SKIP'
  console.log(`${icon}  ${name}\n         ${detail}`)
}

const TAG = `RLS probe ${Date.now()}`

async function main() {
  const anon: SupabaseClient = createClient(URL_!, ANON!, { auth: { persistSession: false } })
  const admin: SupabaseClient = createClient(URL_!, SERVICE!, { auth: { persistSession: false } })

  const { data: session, error: signInError } = await anon.auth.signInWithPassword({
    email: TEST_EMAIL!, password: TEST_PASSWORD!,
  })
  if (signInError || !session?.user) {
    console.error(`❌  Sign-in failed for ${TEST_EMAIL}: ${signInError?.message}`)
    process.exit(1)
  }
  const userId = session.user.id
  console.log(`\nSigned in as ${TEST_EMAIL} (${userId})\n`)

  const { data: profile } = await admin
    .from('profiles').select('role, studio_id').eq('id', userId).maybeSingle()
  const role = profile?.role ?? '(none)'
  const myStudio = profile?.studio_id as string | null

  if (role === 'otb_admin' || role === 'otb_staff') {
    record('Test account is NOT staff', 'FAIL',
      `role=${role} — the otb_admin SELECT policy would make every check meaningless.`)
    summarise(); process.exit(1)
  }
  record('Test account is NOT staff', 'PASS', `role=${role}, studio_id=${myStudio ?? 'NULL'}`)
  if (!myStudio) {
    record('Test account has a studio', 'FAIL', 'studio_id is NULL; nothing can be scoped to it')
    summarise(); process.exit(1)
  }

  // A school belonging to someone else, for the cross-studio attempts.
  const { data: foreign } = await admin
    .from('school_outreach').select('id, studio_id').neq('studio_id', myStudio).limit(1)
  const foreignSchoolId = (foreign?.[0]?.id as string | undefined) ?? null
  const { data: foreignContacts } = foreignSchoolId
    ? await admin.from('school_contacts').select('id').eq('school_id', foreignSchoolId).limit(1)
    : { data: null }
  const foreignContactId = (foreignContacts?.[0]?.id as string | undefined) ?? null

  let mySchoolId: string | null = null
  let myContactId: string | null = null
  let otherContactId: string | null = null
  const strayIds: { table: string; id: string }[] = []

  try {
    // ── Fixtures on the test studio (service role) ──────────────────────────
    const { data: created, error: createError } = await admin
      .from('school_outreach')
      .insert({ studio_id: myStudio, school_name: `${TAG} school`, stage: 'lead' })
      .select('id').single()
    if (createError || !created) throw new Error(`fixture school failed: ${createError?.message}`)
    mySchoolId = created.id as string

    const { data: cs, error: csError } = await admin
      .from('school_contacts')
      .insert([
        { studio_id: myStudio, school_id: mySchoolId, name: `${TAG} primary`,
          email: 'probe-primary@example.com', is_primary: true, subject_area: 'band' },
        { studio_id: myStudio, school_id: mySchoolId, name: `${TAG} second`,
          email: 'probe-second@example.com', is_primary: false, subject_area: 'choir' },
      ])
      .select('id, is_primary')
    if (csError || !cs) throw new Error(`fixture contacts failed: ${csError?.message}`)
    myContactId = (cs.find(c => c.is_primary)?.id ?? cs[0].id) as string
    otherContactId = (cs.find(c => !c.is_primary)?.id ?? cs[1].id) as string

    // ── anon reaches nothing ────────────────────────────────────────────────
    const anonClient = createClient(URL_!, ANON!, { auth: { persistSession: false } })
    for (const table of ['school_outreach', 'school_contacts', 'school_outreach_activity']) {
      const { data, error } = await anonClient.from(table).select('id').limit(5)
      record(`anon sees nothing in ${table}`,
        error || (data?.length ?? 0) === 0 ? 'PASS' : 'FAIL',
        error ? `blocked: ${error.message}` : `${data?.length ?? 0} rows`)
    }

    // ── The member sees their own rows and only their own ────────────────────
    const { data: visibleSchools } = await anon.from('school_outreach').select('id, studio_id')
    const foreignVisible = (visibleSchools ?? []).filter(r => r.studio_id !== myStudio).length
    const ownVisible = (visibleSchools ?? []).some(r => r.id === mySchoolId)
    record('Member sees own school, and no other studio\'s',
      ownVisible && foreignVisible === 0 ? 'PASS' : 'FAIL',
      `own visible=${ownVisible}, foreign visible=${foreignVisible} of ${visibleSchools?.length ?? 0} rows`)

    const { data: visibleContacts } = await anon.from('school_contacts').select('id, studio_id')
    const foreignContactsVisible = (visibleContacts ?? []).filter(r => r.studio_id !== myStudio).length
    record('Member sees only own school_contacts',
      foreignContactsVisible === 0 ? 'PASS' : 'FAIL',
      `${visibleContacts?.length ?? 0} visible, ${foreignContactsVisible} foreign`)

    // ── Ordinary writes the member SHOULD be able to do ─────────────────────
    const { data: logged, error: logError } = await anon
      .from('school_outreach_activity')
      .insert({
        studio_id: myStudio, school_id: mySchoolId, contact_id: myContactId,
        activity_type: 'call', notes: `${TAG} call`, created_by: userId,
      })
      .select('id').single()
    if (logged) strayIds.push({ table: 'school_outreach_activity', id: logged.id as string })
    record('Member can log an activity on their own school',
      logError ? 'FAIL' : 'PASS',
      logError ? `rejected: ${logError.message}` : `created ${logged?.id}`)

    // ── Cross-studio attempts, all of which MUST be refused ─────────────────
    if (!foreignSchoolId) {
      record('Cannot add a contact to another studio\'s school', 'SKIP', 'no foreign school found')
      record('Cannot log activity on another studio\'s school', 'SKIP', 'no foreign school found')
    } else {
      // Claiming own studio_id while pointing at a foreign school — the case the
      // policies alone would have permitted and the composite FK now blocks.
      const { data: bad1, error: e1 } = await anon
        .from('school_contacts')
        .insert({ studio_id: myStudio, school_id: foreignSchoolId, name: `${TAG} smuggled` })
        .select('id')
      if (bad1?.[0]) strayIds.push({ table: 'school_contacts', id: bad1[0].id as string })
      record('Cannot add a contact to another studio\'s school',
        e1 ? 'PASS' : 'FAIL',
        e1 ? `rejected: ${e1.message}` : 'ACCEPTED — cross-studio contact created!')

      const { data: bad2, error: e2 } = await anon
        .from('school_outreach_activity')
        .insert({ studio_id: myStudio, school_id: foreignSchoolId, activity_type: 'call', created_by: userId })
        .select('id')
      if (bad2?.[0]) strayIds.push({ table: 'school_outreach_activity', id: bad2[0].id as string })
      record('Cannot log activity on another studio\'s school',
        e2 ? 'PASS' : 'FAIL',
        e2 ? `rejected: ${e2.message}` : 'ACCEPTED — cross-studio activity created!')
    }

    // Declaring a foreign studio_id outright — this is the RLS WITH CHECK.
    const { data: bad3, error: e3 } = await anon
      .from('school_outreach')
      .insert({ studio_id: foreign?.[0]?.studio_id ?? myStudio, school_name: `${TAG} foreign`, stage: 'lead' })
      .select('id')
    if (bad3?.[0]) strayIds.push({ table: 'school_outreach', id: bad3[0].id as string })
    record('Cannot create a school under another studio_id',
      foreignSchoolId ? (e3 ? 'PASS' : 'FAIL') : 'SKIP',
      !foreignSchoolId ? 'no foreign studio to name'
        : e3 ? `rejected: ${e3.message}` : 'ACCEPTED — wrote into another studio!')

    // A contact from a DIFFERENT school on an activity row — the (contact_id,
    // school_id) composite FK.
    if (foreignContactId) {
      const { data: bad4, error: e4 } = await anon
        .from('school_outreach_activity')
        .insert({
          studio_id: myStudio, school_id: mySchoolId, contact_id: foreignContactId,
          activity_type: 'call', created_by: userId,
        })
        .select('id')
      if (bad4?.[0]) strayIds.push({ table: 'school_outreach_activity', id: bad4[0].id as string })
      record('Cannot attach a contact from a different school',
        e4 ? 'PASS' : 'FAIL',
        e4 ? `rejected: ${e4.message}` : 'ACCEPTED — mismatched contact accepted!')
    } else {
      record('Cannot attach a contact from a different school', 'SKIP', 'no foreign contact found')
    }

    // ── One primary per school is enforced by the partial unique index ───────
    const { data: bad5, error: e5 } = await anon
      .from('school_contacts')
      .update({ is_primary: true })
      .eq('id', otherContactId)
      .select('id')
    const stillOne = await admin
      .from('school_contacts').select('id', { count: 'exact', head: true })
      .eq('school_id', mySchoolId).eq('is_primary', true)
    record('Two primary contacts on one school is impossible',
      e5 ? 'PASS' : (stillOne.count === 1 ? 'PASS' : 'FAIL'),
      e5 ? `rejected: ${e5.message}`
         : `update returned ${bad5?.length ?? 0} row(s); primaries now = ${stillOne.count}`)

    // ── Deleting a contact keeps the history entry, unattributed ─────────────
    if (logged && myContactId) {
      await admin.from('school_contacts').delete().eq('id', myContactId)
      const { data: after } = await admin
        .from('school_outreach_activity').select('id, contact_id, school_id')
        .eq('id', logged.id).maybeSingle()
      const survived = !!after && after.contact_id === null && after.school_id === mySchoolId
      record('Deleting a contact clears attribution but keeps the history',
        survived ? 'PASS' : 'FAIL',
        after ? `contact_id=${after.contact_id}, school_id kept=${after.school_id === mySchoolId}`
              : 'the history row was deleted too')
      myContactId = null
    }
  } finally {
    // ── Teardown ────────────────────────────────────────────────────────────
    let failures = 0
    for (const stray of strayIds) {
      const { error } = await admin.from(stray.table).delete().eq('id', stray.id)
      if (error) { failures++; console.log(`   ⚠ could not remove ${stray.table} ${stray.id}: ${error.message}`) }
    }
    if (mySchoolId) {
      // Cascades to contacts and activity via the composite FKs.
      const { error } = await admin.from('school_outreach').delete().eq('id', mySchoolId)
      if (error) { failures++; console.log(`   ⚠ could not remove fixture school ${mySchoolId}: ${error.message}`) }
    }
    const { count: leftover } = await admin
      .from('school_outreach').select('id', { count: 'exact', head: true }).like('school_name', `${TAG}%`)
    record('Probe cleaned up after itself',
      failures === 0 && (leftover ?? 0) === 0 ? 'PASS' : 'FAIL',
      failures === 0 && (leftover ?? 0) === 0
        ? 'fixtures removed, nothing left behind'
        : `${failures} delete error(s), ${leftover ?? 0} fixture school(s) remaining — remove rows named "${TAG}%" by hand`)
  }

  summarise()
}

function summarise() {
  const pass = results.filter(r => r.state === 'PASS').length
  const fail = results.filter(r => r.state === 'FAIL').length
  const skip = results.filter(r => r.state === 'SKIP').length
  console.log('\n' + '─'.repeat(64))
  console.log(`  ${pass} passed · ${fail} failed · ${skip} skipped`)
  if (fail > 0) {
    console.log('\n  FAILED:')
    results.filter(r => r.state === 'FAIL').forEach(r => console.log(`    ❌ ${r.name}`))
  }
  if (skip > 0) {
    console.log('\n  SKIPPED (not proof of safety):')
    results.filter(r => r.state === 'SKIP').forEach(r => console.log(`    ⏭  ${r.name} — ${r.detail}`))
  }
  console.log('─'.repeat(64) + '\n')
}

main()
  .then(() => process.exit(results.some(r => r.state === 'FAIL') ? 1 : 0))
  .catch(err => { console.error('Fatal:', err); process.exit(1) })
