#!/usr/bin/env node
/**
 * smoke-test-work-plans.ts
 *
 * Proves the Phase 1 work plan stack works for a real staff session, with RLS
 * as the gate. Service role is used ONLY to create and tear down fixtures —
 * every assertion runs through an anon-key client signed in as a staff user,
 * because auth.uid() is null under the service role and RLS is skipped there,
 * so a service-role "pass" would prove nothing.
 *
 * Prerequisites, in order:
 *   1. 20260909000001_work_plans.sql applied in the SQL editor
 *   2. node --experimental-strip-types scripts/seed-work-plan-template.ts
 *
 * WRITES TO PRODUCTION: creates a disposable staff user and a disposable
 * studio, clones a plan onto it, then deletes all of it in a finally block.
 *
 * Usage:
 *   node --experimental-strip-types scripts/smoke-test-work-plans.ts
 *
 * Exit 0 = the stack works for staff. Non-zero = at least one assertion failed.
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const TEMPLATE_NAME = 'OTB Scale Standard Work Plan'
const EXPECTED_TASKS = 49
const EXPECTED_INTERNAL_NOTES = 4

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

async function main() {
  const stamp = Date.now()
  const email = `workplan.smoke.${stamp}@example.com`
  const password = `Wp-${stamp}-${Math.random().toString(36).slice(2, 10)}!`
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

    const { error: roleError } = await admin
      .from('profiles')
      .update({ role: 'otb_staff', status: 'approved' })
      .eq('id', userId)
    if (roleError) throw new Error(`promoting test user to staff failed: ${roleError.message}`)

    // owner_user_id is deliberately NULL: if it pointed at the test user, the
    // pre-existing "Users can select their own studios" policy would satisfy
    // the studios read and the new staff policy would go untested.
    const { data: studio, error: studioError } = await admin
      .from('studios')
      .insert({ name: `SMOKE TEST work plans ${stamp}`, owner_user_id: null })
      .select('id')
      .single()
    if (studioError || !studio) throw new Error(`test studio insert failed: ${studioError?.message}`)
    studioId = studio.id
    console.log(`Staff user ${email} → ${userId}\nTest studio → ${studioId}\n`)

    // ── STAFF SESSION (anon key, RLS applies) ────────────────────────────────
    const staff: SupabaseClient = createClient(URL, ANON_KEY, { auth: { persistSession: false } })
    const { data: signIn, error: signInError } = await staff.auth.signInWithPassword({ email, password })
    if (signInError || !signIn?.session) throw new Error(`staff sign-in failed: ${signInError?.message}`)
    assert('staff session established via anon key', signIn.user?.id === userId, `session uid = ${signIn.user?.id}`)

    // ── 1. templates readable by staff ───────────────────────────────────────
    const { data: templates, error: templateError } = await staff
      .from('work_plan_templates')
      .select('id, name')
      .eq('name', TEMPLATE_NAME)
    const template = templates?.[0]
    assert(
      'staff can SELECT work_plan_templates',
      !templateError && !!template,
      templateError ? `blocked: ${templateError.message}` : `found "${template?.name}" → ${template?.id}`,
    )
    if (!template) throw new Error('cannot continue without the seeded template — run the seed script first')

    // ── 2. studios readable by staff (proves the new staff SELECT policy) ────
    const { data: studios, error: studiosError } = await staff
      .from('studios')
      .select('id, name')
      .eq('id', studioId)
    assert(
      'staff can SELECT studios via the new staff policy',
      !studiosError && studios?.length === 1,
      studiosError
        ? `blocked: ${studiosError.message}`
        : studios?.length === 1
          ? `read studio "${studios[0].name}" with owner_user_id NULL`
          : 'returned 0 rows — the "Staff can read studios" policy is missing, so the admin list would render empty',
    )

    // ── 3. clone RPC ─────────────────────────────────────────────────────────
    const { data: rpcPlanId, error: rpcError } = await staff.rpc('create_work_plan_from_template', {
      p_template_id: template.id,
      p_studio_id: studioId,
    })
    planId = (rpcPlanId as string) ?? null
    assert(
      'clone RPC returns a new work_plan id',
      !rpcError && !!planId,
      rpcError ? `failed: ${rpcError.message}` : `plan → ${planId}`,
    )
    if (!planId) throw new Error('cannot continue without a cloned plan')

    const { data: clonedTasks, error: tasksError } = await staff
      .from('work_plan_tasks')
      .select('id, title, timeframe_group, internal_note, links, week_number, is_recurring')
      .eq('work_plan_id', planId)
    const notes = (clonedTasks ?? []).filter(t => t.internal_note != null).length
    assert(
      `clone copied ${EXPECTED_TASKS} tasks`,
      !tasksError && clonedTasks?.length === EXPECTED_TASKS,
      tasksError ? `blocked: ${tasksError.message}` : `${clonedTasks?.length} tasks`,
    )
    assert(
      `clone preserved ${EXPECTED_INTERNAL_NOTES} internal_notes`,
      notes === EXPECTED_INTERNAL_NOTES,
      `${notes} tasks carry an internal_note`,
    )
    const withLinks = (clonedTasks ?? []).filter(t => Array.isArray(t.links) && t.links.length > 0).length
    const recurring = (clonedTasks ?? []).filter(t => t.is_recurring).length
    assert(
      'clone preserved links and the recurring/week split',
      withLinks > 0 && recurring > 0,
      `${withLinks} tasks with links, ${recurring} recurring, ` +
        `${(clonedTasks ?? []).filter(t => t.week_number != null).length} with a week_number`,
    )

    // ── 4. instance-table write path ─────────────────────────────────────────
    const { data: inserted, error: insertError } = await staff
      .from('work_plan_tasks')
      .insert({
        work_plan_id: planId,
        title: 'Smoke test task',
        timeframe_group: 'Week 1',
        week_number: 1,
        sort_order: 999,
        milestone_tag: 'general',
        links: [{ url: 'https://studio.outsidethebachs.com/leads', label: null, internal: true }],
      })
      .select('id, title')
      .single()
    assert(
      'staff can INSERT into work_plan_tasks',
      !insertError && !!inserted,
      insertError ? `blocked: ${insertError.message}` : `inserted ${inserted?.id}`,
    )

    if (inserted) {
      const doneAt = new Date().toISOString()
      const { data: updated, error: updateError } = await staff
        .from('work_plan_tasks')
        .update({ is_done: true, done_at: doneAt, done_by: userId })
        .eq('id', inserted.id)
        .select('id, is_done, done_at, done_by, updated_at')
        .single()
      assert(
        'staff can UPDATE a task (done toggle) and updated_at fires',
        !updateError && updated?.is_done === true && !!updated?.updated_at,
        updateError ? `blocked: ${updateError.message}` : `is_done=${updated?.is_done} done_by=${updated?.done_by} updated_at=${updated?.updated_at}`,
      )
    }

    const { data: plan, error: planError } = await staff
      .from('work_plans')
      .select('id, title, status, is_published, studio_id, created_by')
      .eq('id', planId)
      .single()
    assert(
      'staff can SELECT the work_plans row, is_published defaults false',
      !planError && plan?.is_published === false && plan?.created_by === userId,
      planError ? `blocked: ${planError.message}` : `status=${plan?.status} is_published=${plan?.is_published} created_by=self`,
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
  console.log('✅  Work plan stack works for a real staff session with RLS as the gate.')
}

main().catch(err => {
  console.error('❌  Unexpected failure:', err)
  process.exit(1)
})
