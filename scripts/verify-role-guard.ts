#!/usr/bin/env node
/**
 * verify-role-guard.ts
 *
 * Runtime proof that a non-staff user cannot self-escalate profiles.role.
 *
 * The SQL editor cannot prove this: it connects as a superuser and bypasses
 * RLS entirely, so a policy can look correct there and still be open to a real
 * logged-in user. This script signs in as a genuine disposable user with the
 * ANON key and drives every assertion through that session.
 *
 * WRITES TO PRODUCTION: it creates a real auth user (which the handle_new_user
 * trigger mirrors into profiles with status 'pending', so it appears briefly in
 * the admin approval queue) and deletes both in a finally block. A failed
 * assertion still tears down.
 *
 * Tests nothing but behaviour — it does not create, alter or drop any policy.
 *
 * Usage:
 *   node --experimental-strip-types scripts/verify-role-guard.ts
 *
 * Exit code 0 = the guard holds. Non-zero = escalation succeeded (hole open) or
 * legitimate self-edits broke.
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_ROLE = 'studio_owner' // set by handle_new_user; 82/85 live profiles
const BENIGN_COLUMN = 'display_name'
const ESCALATION_TARGETS = ['otb_admin', 'otb_staff']

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

/** Merge .env and .env.local — the service-role key is in both, the anon key only in .env.local. */
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
function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail })
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'}  ${name}\n         ${detail}`)
}

async function roleOf(userId: string): Promise<string | null> {
  // Ground truth, read with the service role so RLS cannot mask the answer.
  const { data } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle()
  return data?.role ?? null
}

async function main() {
  const stamp = Date.now()
  const email = `roleguard.test.${stamp}@example.com`
  const password = `Rg-${stamp}-${Math.random().toString(36).slice(2, 10)}!`
  let userId: string | null = null

  try {
    // ── 1. SETUP (service role) ──────────────────────────────────────────────
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createError || !created?.user) throw new Error(`createUser failed: ${createError?.message}`)
    userId = created.user.id
    console.log(`Test user ${email} → ${userId}\n`)

    // handle_new_user should have mirrored it into profiles; insert only if not.
    let baseline = await roleOf(userId)
    if (baseline === null) {
      const { error } = await admin.from('profiles').insert({ id: userId, email, role: DEFAULT_ROLE, status: 'pending' })
      if (error) throw new Error(`profiles insert failed: ${error.message}`)
      baseline = DEFAULT_ROLE
    }
    record(
      'setup: profile exists with default non-staff role',
      baseline === DEFAULT_ROLE,
      `role = ${baseline} (expected ${DEFAULT_ROLE})`,
    )

    // ── 2. AUTHED SESSION (anon key, so RLS applies) ─────────────────────────
    const asUser = createClient(URL, ANON_KEY, { auth: { persistSession: false } })
    const { data: signIn, error: signInError } = await asUser.auth.signInWithPassword({ email, password })
    if (signInError || !signIn?.session) throw new Error(`sign-in failed: ${signInError?.message}`)
    record(
      'session: signed in as the test user via the anon key',
      signIn.user?.id === userId,
      `session uid = ${signIn.user?.id}`,
    )

    // ── 3. NEGATIVE TESTS — the point of the script ──────────────────────────
    for (const target of ESCALATION_TARGETS) {
      const { data: rows, error } = await asUser
        .from('profiles')
        .update({ role: target })
        .eq('id', userId)
        .select('id, role')

      const after = await roleOf(userId)
      const changed = after === target
      const rejectedLoudly = !!error
      const rejectedSilently = !error && (rows?.length ?? 0) === 0

      record(
        `negative: self-escalation to '${target}' is rejected`,
        !changed && (rejectedLoudly || rejectedSilently),
        rejectedLoudly
          ? `blocked with ${error!.code ?? 'error'}: ${error!.message}; role still '${after}'`
          : rejectedSilently
            ? `blocked silently — 0 rows updated (policy USING hid the row); role still '${after}'`
            : `ESCALATED — role is now '${after}'`,
      )
    }

    // ── 4. POSITIVE TEST — the fix must not break legitimate self-edits ──────
    const newName = `Role Guard Test ${stamp}`
    const { data: nameRows, error: nameError } = await asUser
      .from('profiles')
      .update({ [BENIGN_COLUMN]: newName })
      .eq('id', userId)
      .select(`id, ${BENIGN_COLUMN}`)

    const { data: check } = await admin.from('profiles').select(BENIGN_COLUMN).eq('id', userId).maybeSingle()
    const persisted = (check as Record<string, unknown> | null)?.[BENIGN_COLUMN]
    record(
      `positive: user can still edit their own ${BENIGN_COLUMN}`,
      !nameError && (nameRows?.length ?? 0) === 1 && persisted === newName,
      nameError
        ? `REGRESSION — blocked with ${nameError.code ?? 'error'}: ${nameError.message}`
        : `updated ${nameRows?.length ?? 0} row(s); stored value = ${JSON.stringify(persisted)}`,
    )
  } finally {
    // ── 5. TEARDOWN (service role), even if an assertion threw ───────────────
    if (userId) {
      const { error: profileDeleteError } = await admin.from('profiles').delete().eq('id', userId)
      const { error: userDeleteError } = await admin.auth.admin.deleteUser(userId)
      const left = await roleOf(userId)
      console.log(
        `\nTeardown: profile ${profileDeleteError ? 'FAILED — ' + profileDeleteError.message : 'deleted'}, ` +
          `auth user ${userDeleteError ? 'FAILED — ' + userDeleteError.message : 'deleted'}` +
          (left === null ? '' : `  ⚠️  profile row still present (role ${left})`),
      )
    }
  }

  const failed = results.filter(r => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (failed.length > 0) {
    console.error(`❌  ${failed.map(f => f.name).join('; ')}`)
    process.exit(1)
  }
  console.log('✅  Role guard holds: a non-staff user cannot self-escalate, and normal profile edits still work.')
}

main().catch(err => {
  console.error('❌  Unexpected failure:', err)
  process.exit(1)
})
