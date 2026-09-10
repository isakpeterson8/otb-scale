#!/usr/bin/env node
/**
 * verify-owner-unique.ts
 *
 * Proves the studios.owner_user_id unique constraint actually blocks a second
 * studio for the same owner, and that getStudioId()'s recovery path returns the
 * existing studio instead of null.
 *
 * Nothing else covers this. smoke-test-work-plans.ts creates its fixture studio
 * with owner_user_id NULL — deliberately, so the staff SELECT policy is what
 * gets tested — and Postgres exempts NULLs from uniqueness, so that test passes
 * whether or not the constraint exists.
 *
 * PREREQUISITE: 20260909000003_studio_owner_unique.sql applied. Run before
 * that and step 2 FAILS loudly rather than silently passing — the duplicate
 * insert succeeds, which is the bug. Teardown deletes every studio belonging to
 * the test owner, so even that failure leaves nothing behind.
 *
 * WRITES TO PRODUCTION: creates a disposable auth user and one or two studios,
 * then deletes them in a finally block.
 *
 * Usage:
 *   node --experimental-strip-types scripts/verify-owner-unique.ts
 *
 * Exit 0 = the constraint blocks duplicates and the re-select path recovers.
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const UNIQUE_VIOLATION = '23505'

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
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!URL || !SERVICE_KEY || !ANON_KEY) {
  console.error('❌  Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY across .env / .env.local')
  process.exit(1)
}

const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })

const results: { name: string; pass: boolean; detail: string }[] = []
function assert(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail })
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'}  ${name}\n         ${detail}`)
}

async function studioCountFor(ownerId: string): Promise<number> {
  const { count } = await admin
    .from('studios')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', ownerId)
  return count ?? 0
}

async function main() {
  const stamp = Date.now()
  const email = `owner.unique.${stamp}@example.com`
  const password = `Ou-${stamp}-${Math.random().toString(36).slice(2, 10)}!`
  let userId: string | null = null
  let firstStudioId: string | null = null

  try {
    // ── SETUP ────────────────────────────────────────────────────────────────
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (createError || !created?.user) throw new Error(`createUser failed: ${createError?.message}`)
    userId = created.user.id
    console.log(`Test user ${email} → ${userId}\n`)

    // ── 1. First studio with a NON-NULL owner ────────────────────────────────
    const { data: first, error: firstError } = await admin
      .from('studios')
      .insert({ name: `OWNER UNIQUE TEST ${stamp}`, owner_user_id: userId })
      .select('id')
      .single()
    assert(
      'first studio for a non-null owner is created',
      !firstError && !!first,
      firstError ? `failed: ${firstError.message}` : `studio → ${first!.id}`,
    )
    if (!first) throw new Error('cannot continue without the first studio')
    firstStudioId = first.id

    // ── 2. THE POINT: a second studio for the same owner must be rejected ────
    const { data: second, error: secondError } = await admin
      .from('studios')
      .insert({ name: `OWNER UNIQUE TEST dup ${stamp}`, owner_user_id: userId })
      .select('id')
    const countAfter = await studioCountFor(userId)
    assert(
      'duplicate studio for the same owner is rejected with 23505',
      secondError?.code === UNIQUE_VIOLATION && !second?.length && countAfter === 1,
      secondError
        ? `blocked with ${secondError.code}: ${secondError.message}; owner still has ${countAfter} studio`
        : `LEAK — insert succeeded (owner now has ${countAfter}); the unique constraint is NOT in place`,
    )

    // ── 3. The app's recovery path, under a real session ─────────────────────
    // Mirrors getStudioId(): insert, and on 23505 re-select by owner_user_id
    // rather than returning null.
    const asUser = createClient(URL, ANON_KEY, { auth: { persistSession: false } })
    const { error: signInError } = await asUser.auth.signInWithPassword({ email, password })
    if (signInError) throw new Error(`sign-in failed: ${signInError.message}`)

    const { error: raceError } = await asUser
      .from('studios')
      .insert({ name: `race loser ${stamp}`, owner_user_id: userId })
      .select('id')
      .single()

    let recoveredId: string | null = null
    if (raceError?.code === UNIQUE_VIOLATION) {
      const { data: winner } = await asUser
        .from('studios')
        .select('id')
        .eq('owner_user_id', userId)
        .limit(1)
        .maybeSingle()
      recoveredId = winner?.id ?? null
    }
    assert(
      'race loser re-selects the existing studio instead of getting null',
      raceError?.code === UNIQUE_VIOLATION && recoveredId === firstStudioId,
      raceError?.code === UNIQUE_VIOLATION
        ? recoveredId === firstStudioId
          ? `blocked with 23505, then recovered studio ${recoveredId} — matches the winner`
          : `blocked with 23505 but re-select returned ${recoveredId ?? 'null'} — getStudioId() would return null here`
        : `insert was NOT blocked (${raceError?.code ?? 'no error'}) — constraint missing, so the recovery path cannot be tested`,
    )

    const finalCount = await studioCountFor(userId)
    assert('owner still has exactly one studio', finalCount === 1, `${finalCount} studio(s)`)
  } finally {
    // ── TEARDOWN ─────────────────────────────────────────────────────────────
    // Deletes BY OWNER, not by tracked id, so a failed run that managed to
    // create a duplicate still cleans both up.
    const steps: string[] = []
    if (userId) {
      const { error: studioError, count } = await admin
        .from('studios')
        .delete({ count: 'exact' })
        .eq('owner_user_id', userId)
      steps.push(`studios ${studioError ? 'FAILED — ' + studioError.message : `deleted (${count ?? 0})`}`)
      await admin.from('profiles').delete().eq('id', userId)
      const { error: userError } = await admin.auth.admin.deleteUser(userId)
      steps.push(`user ${userError ? 'FAILED — ' + userError.message : 'deleted'}`)
      const left = await studioCountFor(userId)
      if (left !== 0) steps.push(`⚠️  ${left} studio(s) still present for the test owner`)
    }
    console.log(`\nTeardown: ${steps.join(', ')}`)
  }

  const failed = results.filter(r => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (failed.length > 0) {
    console.error(`❌  ${failed.map(f => f.name).join('; ')}`)
    process.exit(1)
  }
  console.log('✅  The unique constraint blocks duplicate owners, and the race loser recovers the existing studio.')
}

main().catch(err => {
  console.error('❌  Unexpected failure:', err)
  process.exit(1)
})
