#!/usr/bin/env node
/**
 * smoke-test-work-plans-refusal.ts
 *
 * The negative half of the work plan smoke test: proves a NON-staff user is
 * kept out. smoke-test-work-plans.ts proves staff get in; passing that says
 * nothing about whether anyone else is refused.
 *
 * Method: a disposable user is created and left on the DEFAULT role the
 * handle_new_user trigger assigns (studio_owner — asserted, not assumed), then
 * signed in through the anon key so RLS applies. Service role is used only for
 * fixtures, for the control counts, and for teardown.
 *
 * The control counts matter: under RLS a refused SELECT returns zero rows
 * rather than an error, and an empty table also returns zero rows. So every
 * SELECT refusal is paired with a service-role count proving rows really exist
 * for the non-staff user to be refused.
 *
 * Prerequisites: migration applied and seed run.
 *
 * WRITES TO PRODUCTION: creates a disposable user, studio, work plan and tasks,
 * then deletes all of it in a finally block.
 *
 * Usage:
 *   node --experimental-strip-types scripts/smoke-test-work-plans-refusal.ts
 *
 * Exit 0 = non-staff are refused everywhere. Non-zero = at least one refusal
 * did not hold, i.e. the gate leaks.
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_ROLE = 'studio_owner'
const WORK_PLAN_TABLES = [
  'work_plan_templates',
  'work_plan_template_tasks',
  'work_plans',
  'work_plan_tasks',
] as const

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

/** Rows the service role can see — the control for every "0 rows" refusal. */
async function controlCount(table: string): Promise<number> {
  const { count } = await admin.from(table).select('id', { count: 'exact', head: true })
  return count ?? 0
}

async function main() {
  const stamp = Date.now()
  const email = `workplan.refusal.${stamp}@example.com`
  const password = `Wr-${stamp}-${Math.random().toString(36).slice(2, 10)}!`
  let userId: string | null = null
  let studioId: string | null = null
  let planId: string | null = null

  try {
    // ── SETUP (service role only) ────────────────────────────────────────────
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (createError || !created?.user) throw new Error(`createUser failed: ${createError?.message}`)
    userId = created.user.id

    const { data: profile } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle()
    assert(
      'test user sits on the default non-staff role',
      profile?.role === DEFAULT_ROLE,
      `role = ${profile?.role} (expected ${DEFAULT_ROLE}; NOT promoted to staff)`,
    )

    const { data: studio, error: studioError } = await admin
      .from('studios')
      .insert({ name: `REFUSAL TEST work plans ${stamp}`, owner_user_id: null })
      .select('id')
      .single()
    if (studioError || !studio) throw new Error(`test studio insert failed: ${studioError?.message}`)
    studioId = studio.id

    // A real plan with real tasks, so the refusals below are refusing something.
    const { data: plan, error: planError } = await admin
      .from('work_plans')
      .insert({ studio_id: studioId, title: `Refusal fixture ${stamp}` })
      .select('id')
      .single()
    if (planError || !plan) throw new Error(`fixture plan insert failed: ${planError?.message}`)
    planId = plan.id
    const { error: fixtureTaskError } = await admin.from('work_plan_tasks').insert({
      work_plan_id: planId, title: 'Fixture task', timeframe_group: 'Week 1', week_number: 1,
    })
    if (fixtureTaskError) throw new Error(`fixture task insert failed: ${fixtureTaskError.message}`)

    const controls: Record<string, number> = {}
    for (const t of WORK_PLAN_TABLES) controls[t] = await controlCount(t)
    const allPopulated = WORK_PLAN_TABLES.every(t => controls[t] > 0)
    assert(
      'control: every work_plan table has rows to be refused',
      allPopulated,
      WORK_PLAN_TABLES.map(t => `${t}=${controls[t]}`).join(', '),
    )
    if (!allPopulated) throw new Error('control failed — a zero-row SELECT below would prove nothing')

    const { data: templateRow } = await admin.from('work_plan_templates').select('id').limit(1).single()
    console.log(`\nNon-staff user ${email} → ${userId}\nFixture studio ${studioId}, plan ${planId}\n`)

    // ── NON-STAFF SESSION (anon key, RLS applies) ────────────────────────────
    const asUser: SupabaseClient = createClient(URL, ANON_KEY, { auth: { persistSession: false } })
    const { data: signIn, error: signInError } = await asUser.auth.signInWithPassword({ email, password })
    if (signInError || !signIn?.session) throw new Error(`sign-in failed: ${signInError?.message}`)
    assert('non-staff session established via anon key', signIn.user?.id === userId, `session uid = ${signIn.user?.id}`)

    // ── SELECT refusals ──────────────────────────────────────────────────────
    for (const table of WORK_PLAN_TABLES) {
      const { data, error } = await asUser.from(table).select('id')
      const visible = data?.length ?? 0
      assert(
        `non-staff SELECT on ${table} is refused`,
        !!error || visible === 0,
        error
          ? `blocked with ${error.code ?? 'error'}: ${error.message}`
          : visible === 0
            ? `0 rows visible while the service role sees ${controls[table]}`
            : `LEAK — ${visible} of ${controls[table]} rows visible`,
      )
    }

    // ── INSERT refusals ──────────────────────────────────────────────────────
    const inserts: { table: string; row: Record<string, unknown> }[] = [
      { table: 'work_plan_templates', row: { name: `refusal-${stamp}` } },
      { table: 'work_plan_template_tasks', row: { template_id: templateRow?.id, title: 'nope', timeframe_group: 'Week 1' } },
      { table: 'work_plans', row: { studio_id: studioId, title: 'nope' } },
      { table: 'work_plan_tasks', row: { work_plan_id: planId, title: 'nope', timeframe_group: 'Week 1' } },
    ]
    for (const { table, row } of inserts) {
      const { data, error } = await asUser.from(table).insert(row).select('id')
      const wrote = (data?.length ?? 0) > 0
      // Belt and braces: confirm the row count did not move either.
      const after = await controlCount(table)
      assert(
        `non-staff INSERT into ${table} is rejected`,
        !!error && !wrote && after === controls[table],
        error
          ? `blocked with ${error.code ?? 'error'}: ${error.message}; row count still ${after}`
          : `LEAK — insert succeeded, row count ${controls[table]} → ${after}`,
      )
    }

    // ── Clone RPC refusal (its internal is_staff re-check) ───────────────────
    const { data: rpcResult, error: rpcError } = await asUser.rpc('create_work_plan_from_template', {
      p_template_id: templateRow?.id,
      p_studio_id: studioId,
    })
    const plansAfter = await controlCount('work_plans')
    assert(
      'non-staff clone RPC is refused by its internal is_staff check',
      !!rpcError && !rpcResult && plansAfter === controls['work_plans'],
      rpcError
        ? `blocked: ${rpcError.message}; work_plans still ${plansAfter}`
        : `LEAK — RPC returned ${rpcResult}, work_plans ${controls['work_plans']} → ${plansAfter}`,
    )

    // ── Bonus: the staff studios policy must not over-grant ──────────────────
    const { data: studiosSeen } = await asUser.from('studios').select('id').eq('id', studioId)
    assert(
      'non-staff cannot read the fixture studio (staff policy does not over-grant)',
      (studiosSeen?.length ?? 0) === 0,
      `${studiosSeen?.length ?? 0} rows visible for a studio with owner_user_id NULL`,
    )
  } finally {
    // ── TEARDOWN (service role), even if an assertion threw ──────────────────
    const steps: string[] = []
    if (planId) {
      const { error } = await admin.from('work_plans').delete().eq('id', planId)
      steps.push(`plan ${error ? 'FAILED — ' + error.message : 'deleted (tasks cascade)'}`)
    }
    if (studioId) {
      const { error } = await admin.from('studios').delete().eq('id', studioId)
      steps.push(`studio ${error ? 'FAILED — ' + error.message : 'deleted'}`)
    }
    if (userId) {
      await admin.from('profiles').delete().eq('id', userId)
      const { error } = await admin.auth.admin.deleteUser(userId)
      steps.push(`user ${error ? 'FAILED — ' + error.message : 'deleted'}`)
    }
    console.log(`\nTeardown: ${steps.join(', ')}`)
  }

  const failed = results.filter(r => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (failed.length > 0) {
    console.error(`❌  ${failed.map(f => f.name).join('; ')}`)
    process.exit(1)
  }
  console.log('✅  Non-staff are refused on every work_plan table and on the clone RPC.')
}

main().catch(err => {
  console.error('❌  Unexpected failure:', err)
  process.exit(1)
})
