#!/usr/bin/env node
/**
 * seed-work-plan-template.ts
 *
 * One-time (re-runnable) maintenance script that loads the standard work plan
 * template into work_plan_templates + work_plan_template_tasks.
 *
 * Maintenance script, not a user action, so it uses the service-role key from
 * the gitignored .env (falling back to .env.local). Nothing in the app runtime
 * may do this — app mutations go through the request-scoped staff client so RLS
 * stays the real gate.
 *
 * Idempotent: upserts the template by name, then REPLACES its tasks (deletes
 * every task for that template, re-inserts from the seed). Re-running after
 * editing the JSON leaves the template row — and any work_plans.template_id
 * pointing at it — intact.
 *
 * Usage:
 *   node --experimental-strip-types scripts/seed-work-plan-template.ts
 *   node --experimental-strip-types scripts/seed-work-plan-template.ts --dry-run
 *
 * Reads scripts/data/work-plan-template-seed.json. Only `tasks` is loaded;
 * `excluded_from_template` is documentation of what was deliberately left out
 * and is ignored.
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const TEMPLATE_NAME = 'OTB Scale Standard Work Plan'
const MILESTONE_TAGS = ['website', 'gbp', 'instagram', 'flyer', 'seo', 'general']

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DRY_RUN = process.argv.includes('--dry-run')

interface SeedLink {
  url: string
  label: string | null
  internal: boolean
}

interface SeedTask {
  title: string
  timeframe_group: string
  week_number: number | null
  is_recurring: boolean
  starts_after_week: number | null
  sort_order: number
  milestone_tag: string
  description: string | null
  links: SeedLink[]
  /** Team-only caveat. Maps to internal_note — never merged into description. */
  flag: string | null
}

function loadEnv(): Record<string, string> {
  for (const file of ['.env', '.env.local']) {
    try {
      const content = readFileSync(join(ROOT, file), 'utf-8')
      const env: Record<string, string> = {}
      for (const line of content.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.+)$/)
        if (m) env[m[1].trim()] = m[2].trim()
      }
      if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) return env
    } catch {
      // try the next file
    }
  }
  console.error('❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env or .env.local')
  process.exit(1)
}

const env = loadEnv()
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

function loadTasks(): SeedTask[] {
  const raw = JSON.parse(
    readFileSync(join(ROOT, 'scripts/data/work-plan-template-seed.json'), 'utf-8'),
  ) as { tasks: SeedTask[] }

  if (!Array.isArray(raw.tasks) || raw.tasks.length === 0) {
    console.error('❌  Seed file has no tasks array')
    process.exit(1)
  }

  // Fail loudly here rather than on the CHECK constraint mid-insert.
  const badTag = raw.tasks.find(t => !MILESTONE_TAGS.includes(t.milestone_tag))
  if (badTag) {
    console.error(`❌  Unknown milestone_tag "${badTag.milestone_tag}" on task "${badTag.title}"`)
    process.exit(1)
  }
  const badLinks = raw.tasks.find(t => !Array.isArray(t.links))
  if (badLinks) {
    console.error(`❌  links is not an array on task "${badLinks.title}"`)
    process.exit(1)
  }

  return raw.tasks
}

async function main() {
  const tasks = loadTasks()
  const groups = [...new Set(tasks.map(t => t.timeframe_group))]
  console.log(`Seed: ${tasks.length} tasks across ${groups.length} groups (${groups.join(', ')})`)

  if (DRY_RUN) {
    console.log('— dry run, nothing written —')
    for (const t of tasks) {
      console.log(
        `  [${t.timeframe_group}#${t.sort_order}] ${t.title}` +
          `  tag=${t.milestone_tag} links=${t.links.length}` +
          (t.flag ? '  internal_note=yes' : ''),
      )
    }
    return
  }

  // Upsert the template by name so re-runs keep the same id, and any
  // work_plans.template_id already pointing at it stays valid.
  const { data: template, error: templateError } = await supabase
    .from('work_plan_templates')
    .upsert(
      { name: TEMPLATE_NAME, description: 'Standard OTB Scale launch and recurring cadence plan.' },
      { onConflict: 'name' },
    )
    .select('id')
    .single()

  if (templateError || !template) {
    console.error('❌  Template upsert failed:', templateError?.message)
    process.exit(1)
  }
  console.log(`Template "${TEMPLATE_NAME}" → ${template.id}`)

  // Replace this template's tasks wholesale.
  const { error: deleteError } = await supabase
    .from('work_plan_template_tasks')
    .delete()
    .eq('template_id', template.id)

  if (deleteError) {
    console.error('❌  Clearing existing tasks failed:', deleteError.message)
    process.exit(1)
  }

  const rows = tasks.map(t => ({
    template_id: template.id,
    title: t.title,
    description: t.description,
    internal_note: t.flag,
    timeframe_group: t.timeframe_group,
    week_number: t.week_number,
    is_recurring: t.is_recurring,
    starts_after_week: t.starts_after_week,
    sort_order: t.sort_order,
    milestone_tag: t.milestone_tag,
    links: t.links,
  }))

  const { error: insertError, count } = await supabase
    .from('work_plan_template_tasks')
    .insert(rows, { count: 'exact' })

  if (insertError) {
    console.error('❌  Task insert failed:', insertError.message)
    process.exit(1)
  }

  console.log(`✅  Inserted ${count ?? rows.length} tasks (${rows.filter(r => r.internal_note).length} with an internal note)`)
}

main().catch(err => {
  console.error('❌  Unexpected failure:', err)
  process.exit(1)
})
