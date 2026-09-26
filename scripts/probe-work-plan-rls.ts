#!/usr/bin/env node
/**
 * probe-work-plan-rls.ts
 *
 * Proves the Phase 2 client work-plan boundary holds for a REAL non-admin
 * session — the one thing View As cannot test, because View As runs on the
 * service-role client where auth.uid() is null and RLS is skipped entirely.
 *
 * Every assertion runs through an anon-key client signed in as TEST_EMAIL,
 * exactly as the browser does. The service-role key is used ONLY to discover
 * fixture ids (a task in an unpublished plan, a task in another studio) and to
 * restore a status if an RPC that should have been rejected succeeded. If it is
 * absent, those checks SKIP rather than silently passing.
 *
 * WRITES: none, except the two RPC calls that are expected to be REJECTED. If
 * either is accepted, that is a security failure — the script says so loudly and
 * reverts the task's status.
 *
 * Usage:
 *   node --experimental-strip-types scripts/probe-work-plan-rls.ts
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
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? null
const TEST_EMAIL = env.TEST_EMAIL
const TEST_PASSWORD = env.TEST_PASSWORD
const OTHER_STUDIO_TASK_ID = env.OTHER_STUDIO_TASK_ID ?? null

if (!URL || !ANON_KEY) {
  console.error('❌  Need NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}
if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error('❌  Need TEST_EMAIL and TEST_PASSWORD in .env.local (a real NON-ADMIN account)')
  process.exit(1)
}

// Columns the client surfaces must never expose.
const FORBIDDEN_TASK_COLUMNS = ['internal_note', 'done_by']
const FORBIDDEN_PLAN_COLUMNS = ['studio_id', 'template_id', 'created_by']

const results: { name: string; state: 'PASS' | 'FAIL' | 'SKIP'; detail: string }[] = []

function record(name: string, state: 'PASS' | 'FAIL' | 'SKIP', detail: string) {
  results.push({ name, state, detail })
  const icon = state === 'PASS' ? '✅ PASS' : state === 'FAIL' ? '❌ FAIL' : '⏭  SKIP'
  console.log(`${icon}  ${name}\n         ${detail}`)
}

async function main() {
  const anon: SupabaseClient = createClient(URL!, ANON_KEY!, { auth: { persistSession: false } })
  const admin: SupabaseClient | null =
    SERVICE_KEY ? createClient(URL!, SERVICE_KEY, { auth: { persistSession: false } }) : null

  // ── Sign in exactly as the browser does ───────────────────────────────────
  const { data: session, error: signInError } = await anon.auth.signInWithPassword({
    email: TEST_EMAIL!,
    password: TEST_PASSWORD!,
  })
  if (signInError || !session?.user) {
    console.error(`❌  Sign-in failed for ${TEST_EMAIL}: ${signInError?.message}`)
    process.exit(1)
  }
  const userId = session.user.id
  console.log(`\nSigned in as ${TEST_EMAIL} (${userId})\n`)

  // ── Guard: this must NOT be a staff account, or every check is meaningless ─
  if (admin) {
    const { data: profile } = await admin
      .from('profiles')
      .select('role, studio_id')
      .eq('id', userId)
      .maybeSingle()
    const role = profile?.role ?? '(none)'
    if (role === 'otb_admin' || role === 'otb_staff') {
      record('Test account is NOT staff', 'FAIL',
        `role=${role} — staff bypass every member check via is_staff(). Use a non-staff account.`)
      summarise()
      process.exit(1)
    }
    record('Test account is NOT staff', 'PASS', `role=${role}, studio_id=${profile?.studio_id ?? 'NULL'}`)
    if (!profile?.studio_id) {
      record('Test account has profiles.studio_id', 'FAIL',
        'NULL — current_studio_id() returns null, so every client view returns zero rows.')
    } else {
      record('Test account has profiles.studio_id', 'PASS', profile.studio_id)
    }
  } else {
    record('Test account is NOT staff', 'SKIP', 'no SUPABASE_SERVICE_ROLE_KEY to check the role')
  }

  // ── 1. Client task view: no forbidden columns ─────────────────────────────
  const { data: taskRows, error: taskViewError } = await anon
    .from('work_plan_tasks_client')
    .select('*')

  if (taskViewError) {
    record('work_plan_tasks_client is readable', 'FAIL', taskViewError.message)
  } else if (!taskRows || taskRows.length === 0) {
    record('work_plan_tasks_client leaks no columns', 'SKIP',
      'zero visible rows — publish an active plan for this studio, then re-run')
  } else {
    const present = Object.keys(taskRows[0])
    const leaked = FORBIDDEN_TASK_COLUMNS.filter(c => present.includes(c))
    record('work_plan_tasks_client leaks no columns',
      leaked.length === 0 ? 'PASS' : 'FAIL',
      leaked.length === 0
        ? `${taskRows.length} row(s), ${present.length} columns, none forbidden`
        : `LEAKED: ${leaked.join(', ')}`)
  }

  // ── 2. Client plan view: no forbidden columns ─────────────────────────────
  const { data: planRows, error: planViewError } = await anon
    .from('work_plans_client')
    .select('*')

  if (planViewError) {
    record('work_plans_client is readable', 'FAIL', planViewError.message)
  } else if (!planRows || planRows.length === 0) {
    record('work_plans_client leaks no columns', 'SKIP',
      'zero visible rows — publish an active plan for this studio, then re-run')
  } else {
    const present = Object.keys(planRows[0])
    const leaked = FORBIDDEN_PLAN_COLUMNS.filter(c => present.includes(c))
    record('work_plans_client leaks no columns',
      leaked.length === 0 ? 'PASS' : 'FAIL',
      leaked.length === 0
        ? `${planRows.length} row(s), ${present.length} columns, none forbidden`
        : `LEAKED: ${leaked.join(', ')}`)

    // Every visible plan must be published AND active.
    const bad = planRows.filter(r => r.is_published !== true || r.status !== 'active')
    record('Only published + active plans are visible',
      bad.length === 0 ? 'PASS' : 'FAIL',
      bad.length === 0 ? `all ${planRows.length} visible plan(s) published and active`
                       : `${bad.length} row(s) should not be visible`)
  }

  // ── 3-5. Base tables and templates must return nothing ────────────────────
  for (const table of ['work_plans', 'work_plan_tasks', 'work_plan_templates', 'work_plan_template_tasks']) {
    const { data, error } = await anon.from(table).select('*')
    if (error) {
      // A permission error is an even stronger pass than an empty result.
      record(`${table} returns nothing to a member`, 'PASS', `blocked: ${error.message}`)
    } else {
      record(`${table} returns nothing to a member`,
        (data?.length ?? 0) === 0 ? 'PASS' : 'FAIL',
        (data?.length ?? 0) === 0 ? '0 rows' : `${data!.length} row(s) VISIBLE — RLS hole`)
    }
  }

  // ── 6. RPC on another studio's task must be rejected ──────────────────────
  let otherTaskId: string | null = OTHER_STUDIO_TASK_ID
  let ownStudioId: string | null = null
  if (admin) {
    const { data: profile } = await admin.from('profiles').select('studio_id').eq('id', userId).maybeSingle()
    ownStudioId = profile?.studio_id ?? null
    if (!otherTaskId && ownStudioId) {
      const { data } = await admin
        .from('work_plan_tasks')
        .select('id, work_plans!inner(studio_id)')
        .neq('work_plans.studio_id', ownStudioId)
        .limit(1)
      otherTaskId = (data?.[0]?.id as string | undefined) ?? null
    }
  }
  await probeRpcRejected(
    'RPC on another studio\'s task is rejected',
    otherTaskId,
    anon, admin,
    'no OTHER_STUDIO_TASK_ID set and none discoverable',
  )

  // ── 7. RPC on own UNPUBLISHED/archived plan must be rejected ──────────────
  let unpublishedTaskId: string | null = null
  if (admin && ownStudioId) {
    const { data } = await admin
      .from('work_plan_tasks')
      .select('id, work_plans!inner(studio_id, is_published, status)')
      .eq('work_plans.studio_id', ownStudioId)
      .limit(50)
    const rows = (data ?? []) as { id: string; work_plans: unknown }[]
    unpublishedTaskId = rows.find(r => {
      const p = r.work_plans as { is_published: boolean; status: string }
      return p.is_published !== true || p.status !== 'active'
    })?.id ?? null
  }
  await probeRpcRejected(
    'RPC on own unpublished/archived plan is rejected',
    unpublishedTaskId,
    anon, admin,
    'this studio has no unpublished or archived plan to probe',
  )

  summarise()
}

/**
 * Calls the status RPC on a task the member must not be able to touch.
 * Rejection is the pass. Acceptance is a security failure, and the original
 * status is restored immediately via the service role.
 */
async function probeRpcRejected(
  name: string,
  taskId: string | null,
  anon: SupabaseClient,
  admin: SupabaseClient | null,
  skipReason: string,
) {
  if (!taskId) {
    record(name, 'SKIP', skipReason)
    return
  }

  // Capture the current status first so an unexpected success can be undone.
  let before: string | null = null
  if (admin) {
    const { data } = await admin.from('work_plan_tasks').select('status').eq('id', taskId).maybeSingle()
    before = (data?.status as string | undefined) ?? null
  }
  // Aim at a value different from the current one, so a silent no-op cannot
  // masquerade as a rejection.
  const attempt = before === 'done' ? 'todo' : 'done'

  const { error } = await anon.rpc('set_work_plan_task_status', {
    p_task_id: taskId,
    p_status: attempt,
  })

  if (error) {
    record(name, 'PASS', `rejected (${error.code ?? 'no code'}): ${error.message}`)
    return
  }

  // Accepted — this is the bad path.
  console.log('\n🚨🚨🚨  SECURITY FAILURE: the RPC accepted a write it should have refused.  🚨🚨🚨\n')
  if (admin && before !== null) {
    const { error: revertError } = await admin
      .from('work_plan_tasks')
      .update({ status: before })
      .eq('id', taskId)
    record(name, 'FAIL',
      `ACCEPTED on task ${taskId} (set to '${attempt}'). ` +
      (revertError ? `REVERT FAILED: ${revertError.message} — restore status='${before}' by hand!`
                   : `reverted to '${before}'.`))
  } else {
    record(name, 'FAIL',
      `ACCEPTED on task ${taskId} (set to '${attempt}') and no service-role key to revert — ` +
      'restore this task\'s status by hand.')
  }
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
    console.log('\n  SKIPPED (not proof of safety — resolve and re-run):')
    results.filter(r => r.state === 'SKIP').forEach(r => console.log(`    ⏭  ${r.name} — ${r.detail}`))
  }
  console.log('─'.repeat(64) + '\n')
}

main()
  .then(() => {
    process.exit(results.some(r => r.state === 'FAIL') ? 1 : 0)
  })
  .catch(err => {
    console.error('Fatal:', err)
    process.exit(1)
  })
