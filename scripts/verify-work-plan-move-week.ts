#!/usr/bin/env node
/**
 * verify-work-plan-move-week.ts
 *
 * Proves, as a real NON-staff member signed in through the anon key (so RLS and
 * the RPCs' own checks apply exactly as they do for the board's server actions):
 *
 *   - a coach-set step moves between weeks, week_number follows, and
 *     original_timeframe_group is recorded on the first move only;
 *   - recurring steps and non-week targets are refused;
 *   - a coach-set step's content still cannot be edited;
 *   - another studio's step cannot be moved;
 *   - update_client_work_plan_task now keeps week_number in step.
 *
 * Prerequisite: 20261015000001_work_plan_move_week.sql applied.
 *
 * WRITES TO PRODUCTION: creates a disposable user, two studios, two plans and
 * their tasks, then deletes all of it in a finally block. Pass --keep to skip
 * teardown so the staff editor badge can be checked by eye; the script prints
 * the plan URL and the ids to delete afterwards. --keep only applies when every
 * check passed: a failed or aborted run always tears down.
 *
 * Usage:
 *   node --experimental-strip-types scripts/verify-work-plan-move-week.ts [--keep]
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const KEEP = process.argv.includes('--keep')

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

type TaskRow = {
  title: string; timeframe_group: string; week_number: number | null
  original_timeframe_group: string | null; is_recurring: boolean
}

async function readTask(id: string): Promise<TaskRow> {
  const { data, error } = await admin
    .from('work_plan_tasks')
    .select('title, timeframe_group, week_number, original_timeframe_group, is_recurring')
    .eq('id', id)
    .single()
  if (error || !data) throw new Error(`read task ${id} failed: ${error?.message}`)
  return data as TaskRow
}

async function insertTask(planId: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin
    .from('work_plan_tasks')
    .insert({ work_plan_id: planId, ...row })
    .select('id')
    .single()
  if (error || !data) throw new Error(`task insert failed: ${error?.message}`)
  return data.id as string
}

async function main() {
  const stamp = Date.now()
  const email = `workplan.moveweek.${stamp}@example.com`
  const password = `Mw-${stamp}-${Math.random().toString(36).slice(2, 10)}!`
  let userId: string | null = null
  const studioIds: string[] = []
  const planIds: string[] = []
  let completed = false

  try {
    // ── SETUP (service role only) ────────────────────────────────────────────
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (createError || !created?.user) throw new Error(`createUser failed: ${createError?.message}`)
    userId = created.user.id

    for (const label of ['own', 'other']) {
      const { data: studio, error } = await admin
        .from('studios')
        .insert({ name: `MOVE-WEEK TEST ${label} ${stamp}`, owner_user_id: null })
        .select('id')
        .single()
      if (error || !studio) throw new Error(`studio insert failed: ${error?.message}`)
      studioIds.push(studio.id)

      const { data: plan, error: planError } = await admin
        .from('work_plans')
        .insert({ studio_id: studio.id, title: `Move-week fixture (${label}) ${stamp}`, is_published: true })
        .select('id')
        .single()
      if (planError || !plan) throw new Error(`plan insert failed: ${planError?.message}`)
      planIds.push(plan.id)
    }
    const [ownPlan, otherPlan] = planIds

    const { error: linkError } = await admin.from('profiles').update({ studio_id: studioIds[0] }).eq('id', userId)
    if (linkError) throw new Error(`profile link failed: ${linkError.message}`)

    const { data: profile } = await admin.from('profiles').select('role, studio_id').eq('id', userId).single()
    assert(
      'test user is a non-staff member of the fixture studio',
      profile?.role !== 'otb_admin' && profile?.role !== 'otb_staff' && profile?.studio_id === studioIds[0],
      `role = ${profile?.role}, studio_id = ${profile?.studio_id}`,
    )

    const coachTask = await insertTask(ownPlan, {
      title: 'Coach-set step', description: 'Set by the coach', timeframe_group: 'Week 2', week_number: 2,
    })
    const recurringTask = await insertTask(ownPlan, {
      title: 'Recurring step', timeframe_group: 'Weekly', week_number: null, is_recurring: true,
    })
    const flaggedRecurring = await insertTask(ownPlan, {
      title: 'Recurring flag in a week group', timeframe_group: 'Week 3', week_number: 3, is_recurring: true,
    })
    const brainDumpTask = await insertTask(ownPlan, {
      title: 'Coach idea', timeframe_group: 'Brain dump', week_number: null,
    })
    const otherStudioTask = await insertTask(otherPlan, {
      title: 'Someone else\'s step', timeframe_group: 'Week 1', week_number: 1,
    })

    // ── MEMBER SESSION (anon key, RLS applies) ───────────────────────────────
    const asUser: SupabaseClient = createClient(URL, ANON_KEY, { auth: { persistSession: false } })
    const { data: signIn, error: signInError } = await asUser.auth.signInWithPassword({ email, password })
    if (signInError || !signIn?.session) throw new Error(`sign-in failed: ${signInError?.message}`)

    const move = (taskId: string, group: string) =>
      asUser.rpc('move_client_work_plan_task', { p_task_id: taskId, p_target_group: group })

    // 1. Coach-set step moves; original recorded.
    {
      const { error } = await move(coachTask, 'Week 4')
      const t = await readTask(coachTask)
      assert(
        'member moves a coach-set step Week 2 → Week 4',
        !error && t.timeframe_group === 'Week 4' && t.week_number === 4 && t.original_timeframe_group === 'Week 2',
        error ? `error: ${error.message}` : `group=${t.timeframe_group}, week_number=${t.week_number}, original=${t.original_timeframe_group}`,
      )
      assert('content untouched by the move', t.title === 'Coach-set step', `title=${t.title}`)
    }

    // 2. Second move keeps the first original.
    {
      const { error } = await move(coachTask, 'Week 5')
      const t = await readTask(coachTask)
      assert(
        'second move keeps original_timeframe_group = Week 2',
        !error && t.timeframe_group === 'Week 5' && t.week_number === 5 && t.original_timeframe_group === 'Week 2',
        error ? `error: ${error.message}` : `group=${t.timeframe_group}, week_number=${t.week_number}, original=${t.original_timeframe_group}`,
      )
    }

    // 3. Non-recurring Brain dump step moves into a week.
    {
      const { error } = await move(brainDumpTask, 'Week 1')
      const t = await readTask(brainDumpTask)
      assert(
        'Brain dump step moves into Week 1',
        !error && t.timeframe_group === 'Week 1' && t.week_number === 1 && t.original_timeframe_group === 'Brain dump',
        error ? `error: ${error.message}` : `group=${t.timeframe_group}, week_number=${t.week_number}, original=${t.original_timeframe_group}`,
      )
    }

    // 4. Recurring steps refused, both by group and by flag.
    for (const [id, label] of [[recurringTask, 'Weekly-group step'], [flaggedRecurring, 'is_recurring step in Week 3']] as const) {
      const before = await readTask(id)
      const { error } = await move(id, 'Week 6')
      const after = await readTask(id)
      assert(
        `moving a ${label} is refused`,
        !!error && after.timeframe_group === before.timeframe_group && after.original_timeframe_group === null,
        error ? `refused: ${error.message}` : `LEAK — now in ${after.timeframe_group}`,
      )
    }

    // 5. Targets outside Week 1-6 refused.
    for (const target of ['Week 7', 'Weekly', 'Brain dump', 'Week 0']) {
      const { error } = await move(coachTask, target)
      const t = await readTask(coachTask)
      assert(
        `target "${target}" is refused`,
        !!error && t.timeframe_group === 'Week 5',
        error ? `refused: ${error.message}` : `LEAK — now in ${t.timeframe_group}`,
      )
    }

    // 6. Another studio's step.
    {
      const { error } = await move(otherStudioTask, 'Week 3')
      const t = await readTask(otherStudioTask)
      assert(
        'another studio\'s step cannot be moved',
        !!error && t.timeframe_group === 'Week 1' && t.original_timeframe_group === null,
        error ? `refused: ${error.message}` : `LEAK — now in ${t.timeframe_group}`,
      )
    }

    // 7. Coach-set content still not editable.
    {
      const { error } = await asUser.rpc('update_client_work_plan_task', {
        p_task_id: coachTask, p_title: 'Hijacked', p_description: 'nope', p_timeframe_group: 'Week 1',
      })
      const t = await readTask(coachTask)
      assert(
        'member still cannot edit a coach-set step\'s content',
        !!error && t.title === 'Coach-set step' && t.timeframe_group === 'Week 5',
        error ? `refused: ${error.message}` : `LEAK — title=${t.title}`,
      )
    }

    // 8. Bug fix: client edit keeps week_number in step.
    {
      const { data: newId, error: createErr } = await asUser.rpc('create_client_work_plan_task', {
        p_plan_id: ownPlan, p_title: 'My own step', p_description: '', p_timeframe_group: 'Brain dump',
      })
      if (createErr || !newId) throw new Error(`client task create failed: ${createErr?.message}`)
      const { error } = await asUser.rpc('update_client_work_plan_task', {
        p_task_id: newId, p_title: 'My own step', p_description: '', p_timeframe_group: 'Week 3',
      })
      const t = await readTask(newId as string)
      assert(
        'client edit into Week 3 sets week_number = 3',
        !error && t.timeframe_group === 'Week 3' && t.week_number === 3 && t.original_timeframe_group === null,
        error ? `error: ${error.message}` : `group=${t.timeframe_group}, week_number=${t.week_number}, original=${t.original_timeframe_group}`,
      )
    }

    // 9. What the staff editor badge reads.
    {
      const t = await readTask(coachTask)
      const showsBadge = !!t.original_timeframe_group && t.original_timeframe_group !== t.timeframe_group
      assert(
        'staff editor would show "Moved from Week 2" on the coach-set step',
        showsBadge && t.original_timeframe_group === 'Week 2',
        `original=${t.original_timeframe_group}, current=${t.timeframe_group}`,
      )
    }

    // 10. Never exposed to members.
    {
      const { error } = await asUser.from('work_plan_tasks_client').select('original_timeframe_group').limit(1)
      assert(
        'original_timeframe_group is not readable through the client view',
        !!error,
        error ? `refused: ${error.message}` : 'LEAK — column selectable',
      )
    }

    completed = true
    if (KEEP && results.every(r => r.pass)) {
      console.log(`\n--keep: fixtures left in place.\n  Staff editor: /admin/work-plans/${ownPlan}`)
      console.log(`  Clean up: plans ${planIds.join(', ')}; studios ${studioIds.join(', ')}; user ${userId}`)
    }
  } finally {
    if (!(KEEP && completed && results.every(r => r.pass))) {
      const steps: string[] = []
      for (const id of planIds) {
        const { error } = await admin.from('work_plans').delete().eq('id', id)
        steps.push(`plan ${error ? 'FAILED — ' + error.message : 'deleted'}`)
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
  }

  const failed = results.filter(r => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (failed.length > 0) {
    console.error(`❌  ${failed.map(f => f.name).join('; ')}`)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('❌  Unexpected failure:', err)
  process.exit(1)
})
