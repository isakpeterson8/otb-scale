#!/usr/bin/env node
/**
 * upload-library.mjs
 *
 * Uploads OTB education videos from /Volumes/External/Kajabi to Cloudflare
 * Stream and inserts rows into education_library_items.
 *
 * Prerequisites — run this SQL in the Supabase dashboard first:
 *   ALTER TABLE public.education_library_items ADD COLUMN IF NOT EXISTS transcript_text text;
 *   ALTER TABLE public.education_library_items ADD COLUMN IF NOT EXISTS is_placeholder boolean NOT NULL DEFAULT false;
 *
 * Usage:
 *   node scripts/upload-library.mjs              # full run
 *   node scripts/upload-library.mjs --dry-run    # preview only, no uploads
 */

import { createReadStream, statSync, existsSync, readFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { Upload } from 'tus-js-client'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = join(__dirname, '..')
const KAJABI    = '/Volumes/External/Kajabi'
const DRY_RUN   = process.argv.includes('--dry-run')

// ── Load .env.local ───────────────────────────────────────────────────────────
function loadEnv() {
  const content = readFileSync(join(ROOT, '.env.local'), 'utf-8')
  const env = {}
  for (const line of content.split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.+)$/)
    if (m) env[m[1].trim()] = m[2].trim()
  }
  return env
}

const env            = loadEnv()
const CF_ACCOUNT_ID  = env.CLOUDFLARE_ACCOUNT_ID
const CF_API_TOKEN   = env.CLOUDFLARE_API_TOKEN
const SUPABASE_URL   = env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY   = env.SUPABASE_SERVICE_ROLE_KEY

if (!CF_ACCOUNT_ID || !CF_API_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  Missing env vars — check .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── RTF → plain text (macOS built-in) ────────────────────────────────────────
function rtfToText(rtfPath) {
  try {
    return execFileSync('textutil', ['-convert', 'txt', '-stdout', rtfPath], {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    }).trim()
  } catch {
    return null
  }
}

// ── Cloudflare Stream TUS upload ─────────────────────────────────────────────
function uploadToStream(filePath, title) {
  return new Promise((resolve, reject) => {
    const fileSize   = statSync(filePath).size
    const fileStream = createReadStream(filePath)
    let cfUid = null

    const upload = new Upload(fileStream, {
      endpoint: `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream`,
      headers:  { Authorization: `Bearer ${CF_API_TOKEN}` },
      chunkSize: 50 * 1024 * 1024, // 50 MB chunks
      uploadSize: fileSize,
      metadata: { name: title, requiresignedurls: 'false' },

      onAfterResponse(_req, res) {
        const id = res.getHeader('stream-media-id')
        if (id) cfUid = id
      },

      onProgress(uploaded, total) {
        const pct = Math.round((uploaded / total) * 100)
        process.stdout.write(
          `\r    ↑ ${pct}%  ${mb(uploaded)} / ${mb(total)} MB   `
        )
      },

      onSuccess() {
        process.stdout.write('\r    ✓ upload complete                         \n')
        if (!cfUid && upload.url) {
          cfUid = upload.url.split('/').pop().split('?')[0]
        }
        resolve(cfUid)
      },

      onError: reject,
    })

    upload.start()
  })
}

function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(0)
}

// ── Catalog ───────────────────────────────────────────────────────────────────
// num        — original Kajabi number (used as position * 10 in DB)
// title      — clean display title
// category   — slug matching CATEGORIES in EducationClient
// filename_base — file name without extension (null = no file exists yet)
// is_placeholder — video needs to be re-filmed

const CATALOG = [
  // ── Welcome & Orientation ──────────────────────────────────────────────────
  { num: 1,  title: 'Start Here',                        category: 'orientation',   filename_base: null,                                               is_placeholder: true  },
  { num: 2,  title: 'Weekly Cadence Form',               category: 'orientation',   filename_base: null,                                               is_placeholder: true  },
  { num: 3,  title: 'Joining the Facebook Group',        category: 'orientation',   filename_base: '3 welcome orientation facebook group',              is_placeholder: false },
  { num: 4,  title: 'Communication Pointers',            category: 'orientation',   filename_base: '4 welcome orientation comm pointers',               is_placeholder: false },
  { num: 5,  title: 'Your Work Plan',                    category: 'orientation',   filename_base: '5 welcome orientation work plan',                   is_placeholder: false },
  { num: 6,  title: 'Onboarding & Live Calls',           category: 'orientation',   filename_base: '6 welcome orientation onboarding and live calls',   is_placeholder: false },

  // ── Mindset & Success ──────────────────────────────────────────────────────
  { num: 7,  title: 'Task Batching',                     category: 'mindset',       filename_base: '7 creating success task batching',                  is_placeholder: false },
  { num: 8,  title: 'Maximize Your Results',             category: 'mindset',       filename_base: '8 creating success maximize results',               is_placeholder: false },
  { num: 9,  title: 'Goal Setting',                      category: 'mindset',       filename_base: '9 creating success goal setting',                   is_placeholder: false },
  { num: 10, title: 'Successful Habits',                 category: 'mindset',       filename_base: '10 creating success sucessful habits',              is_placeholder: false },
  { num: 11, title: 'Going for Your Goals',              category: 'mindset',       filename_base: '11 creating success going for your goals',          is_placeholder: false },
  { num: 13, title: 'Mindset',                           category: 'mindset',       filename_base: null,                                               is_placeholder: true  },

  // ── Ideal Student ──────────────────────────────────────────────────────────
  { num: 14, title: 'Identifying Your Ideal Student',    category: 'ideal-student', filename_base: '14 identifying your ideal student',                 is_placeholder: false },
  { num: 15, title: 'Red Flags, Part 1',                 category: 'ideal-student', filename_base: '15 identifying your ideal student red flags 1',    is_placeholder: false },
  { num: 16, title: 'Red Flags, Part 2',                 category: 'ideal-student', filename_base: '16 identifying your ideal student red flags 2',    is_placeholder: false },
  { num: 17, title: 'The Ideal Student Exercise',        category: 'ideal-student', filename_base: '17 identifying your ideal student excercise',       is_placeholder: false },

  // ── Marketing ─────────────────────────────────────────────────────────────
  { num: 18, title: 'Creating a Flyer',                  category: 'marketing',     filename_base: '18 marketing creating a flyer',                     is_placeholder: false },
  { num: 19, title: 'Creating a Website',                category: 'marketing',     filename_base: '19 marketing creating a website',                   is_placeholder: false },
  { num: 20, title: 'Website Checklist',                 category: 'marketing',     filename_base: null,                                               is_placeholder: true  },
  { num: 21, title: 'Social Media Guidelines',           category: 'marketing',     filename_base: '21 marketing social media guidelines',              is_placeholder: false },
  { num: 22, title: 'Google My Business',                category: 'marketing',     filename_base: null,                                               is_placeholder: true  },
  { num: 23, title: 'Testimonial Requests',              category: 'marketing',     filename_base: '23 marketing testimonial requests',                 is_placeholder: false },
  { num: 24, title: 'Inbound & SEO',                     category: 'marketing',     filename_base: null,                                               is_placeholder: true  },
  { num: 25, title: 'Conversion',                        category: 'marketing',     filename_base: null,                                               is_placeholder: true  },

  // ── Studio Structure & Policy ─────────────────────────────────────────────
  { num: 28, title: 'Policies vs. Contracts',            category: 'structure',     filename_base: '28 structure policy policies v contracts',          is_placeholder: false },
  { num: 29, title: 'Creating Your Policy',              category: 'structure',     filename_base: '29 structure policy creating',                      is_placeholder: false },
  { num: 30, title: 'Teacher Expectations',              category: 'structure',     filename_base: '30 structure policy teacher expectations',          is_placeholder: false },
  { num: 31, title: 'Student Expectations',              category: 'structure',     filename_base: '31 structure policy student expectations',          is_placeholder: false },
  { num: 32, title: 'Family Expectations',               category: 'structure',     filename_base: '32 structure policy family expectations',           is_placeholder: false },
  { num: 33, title: 'Scheduling',                        category: 'structure',     filename_base: '33 structure policy schedule',                      is_placeholder: false },
  { num: 34, title: 'Tuition Policy',                    category: 'structure',     filename_base: '34 structure policy tuition',                       is_placeholder: false },
  { num: 35, title: 'Payment Policy',                    category: 'structure',     filename_base: '35 structure policy payment',                       is_placeholder: false },
  { num: 36, title: 'Cancellation & Rescheduling',       category: 'structure',     filename_base: '36 structure policy cancel reschedule',             is_placeholder: false },
  { num: 37, title: 'Makeup Policy',                     category: 'structure',     filename_base: '37 structure policy makeup',                        is_placeholder: false },
  { num: 39, title: 'Materials Policy',                  category: 'structure',     filename_base: '39 structure policy materials',                     is_placeholder: false },
  { num: 40, title: 'Commitment Policy',                 category: 'structure',     filename_base: '40 structure policy commitment',                    is_placeholder: false },
  { num: 41, title: 'Photo & Video Release',             category: 'structure',     filename_base: '41 structure policy photo video release',           is_placeholder: false },
  { num: 42, title: 'Communication Preferences',         category: 'structure',     filename_base: '42 structure policy comm preferences',              is_placeholder: false },
  { num: 43, title: 'Studio Breaks',                     category: 'structure',     filename_base: '43 structure policy studio breaks',                 is_placeholder: false },
  { num: 44, title: 'Terms',                             category: 'structure',     filename_base: '44 structure policy terms',                         is_placeholder: false },
  { num: 45, title: 'Updating Expectations',             category: 'structure',     filename_base: '45 structure policy update expectations',           is_placeholder: false },
  { num: 46, title: 'Tuition Increase Schedule',         category: 'structure',     filename_base: '46 structure policy tuition increase schedule',     is_placeholder: false },
  { num: 47, title: 'Studio Events',                     category: 'structure',     filename_base: '47 structure policy studio events',                 is_placeholder: false },

  // ── Tuition & Rates ───────────────────────────────────────────────────────
  { num: 48, title: 'Rate Considerations, Part 1',       category: 'tuition',       filename_base: '48 tuition rate considerations 1',                  is_placeholder: false },
  { num: 49, title: 'Rate Considerations, Part 2',       category: 'tuition',       filename_base: '49 tuition rate considerations 2',                  is_placeholder: false },
  { num: 50, title: 'Rate Considerations, Part 3',       category: 'tuition',       filename_base: '50 tuition rate considerations 3',                  is_placeholder: false },
  { num: 51, title: 'Rate Considerations, Part 4',       category: 'tuition',       filename_base: '51 tuition rate considerations 4',                  is_placeholder: false },
  { num: 52, title: 'Flat Rate Calculation',             category: 'tuition',       filename_base: '52 tuition rate flate rate calculation',            is_placeholder: false },

  // ── Instruction Models ────────────────────────────────────────────────────
  { num: 53, title: 'Instruction Models Overview',       category: 'instruction',   filename_base: '53 instruction models overview',                    is_placeholder: false },
  { num: 54, title: 'Private Lessons, Part 1',           category: 'instruction',   filename_base: '54 instruction models private lessons 1',           is_placeholder: false },
  { num: 55, title: 'Private Lessons, Part 2',           category: 'instruction',   filename_base: '55 instruction models private lessons 2',           is_placeholder: false },
  { num: 56, title: 'Private Lessons, Part 3',           category: 'instruction',   filename_base: '56 instruction models private lessons 3',           is_placeholder: false },
  { num: 57, title: 'Group Lessons, Part 1',             category: 'instruction',   filename_base: '57 instruction models group lessons 1',             is_placeholder: false },
  { num: 58, title: 'Group Lessons, Part 2',             category: 'instruction',   filename_base: '58 instruction models group lessons 2',             is_placeholder: false },
  { num: 59, title: 'Group Lessons, Part 3',             category: 'instruction',   filename_base: '59 instruction models group lessons 3',             is_placeholder: false },
  { num: 60, title: 'Workshops, Part 1',                 category: 'instruction',   filename_base: '60 instruction models workshops 1',                 is_placeholder: false },
  { num: 61, title: 'Workshops, Part 2',                 category: 'instruction',   filename_base: '61 instruction models workshops 2',                 is_placeholder: false },
  { num: 62, title: 'Workshops, Part 3',                 category: 'instruction',   filename_base: '62 instruction models workshops 3',                 is_placeholder: false },
  { num: 63, title: 'Mommy & Me, Part 1',                category: 'instruction',   filename_base: '63 instruction models mommy me 1',                  is_placeholder: false },
  { num: 64, title: 'Mommy & Me, Part 2',                category: 'instruction',   filename_base: '64 instruction models mommy me 2',                  is_placeholder: false },
  { num: 65, title: 'Course Model',                      category: 'instruction',   filename_base: '65 instruction models course',                      is_placeholder: false },
  { num: 66, title: 'Async Model, Part 1',               category: 'instruction',   filename_base: '66 instruction models async 1',                     is_placeholder: false },
  { num: 67, title: 'Async Model, Part 2',               category: 'instruction',   filename_base: '67 instruction models async 2',                     is_placeholder: false },
  { num: 68, title: 'Camps, Part 1',                     category: 'instruction',   filename_base: '68 instruction models camps 1',                     is_placeholder: false },
  { num: 69, title: 'Camps, Part 2',                     category: 'instruction',   filename_base: '69 instruction models camps 2',                     is_placeholder: false },

  // ── A La Carte ────────────────────────────────────────────────────────────
  { num: 71, title: 'A La Carte Overview',               category: 'a-la-carte',    filename_base: '71 a la carte overview',                           is_placeholder: false },
  { num: 72, title: 'Price Policy',                      category: 'a-la-carte',    filename_base: '72 a la carte price policy',                       is_placeholder: false },
  { num: 73, title: 'Scheduling',                        category: 'a-la-carte',    filename_base: null,                                               is_placeholder: true  },

  // ── Trials & Consultations ────────────────────────────────────────────────
  { num: 74, title: 'Trials vs. Consultations, Part 1', category: 'consultations', filename_base: '74 trials vs consults 1',                          is_placeholder: false },
  { num: 75, title: 'Trials vs. Consultations, Part 2', category: 'consultations', filename_base: '75 trials vs consults 2',                          is_placeholder: false },
  { num: 76, title: 'Scheduling Trials',                category: 'consultations', filename_base: null,                                               is_placeholder: true  },
  { num: 77, title: 'Initial Contact',                  category: 'consultations', filename_base: null,                                               is_placeholder: true  },
  { num: 78, title: 'Overcoming Obstacles',             category: 'consultations', filename_base: null,                                               is_placeholder: true  },
  { num: 79, title: 'Closing a Trial',                  category: 'consultations', filename_base: null,                                               is_placeholder: true  },
  { num: 80, title: 'High-Ticket Sales',                category: 'consultations', filename_base: null,                                               is_placeholder: true  },
  { num: 81, title: 'Niching Down',                     category: 'consultations', filename_base: '81 consultations niching down',                    is_placeholder: false },
  { num: 82, title: 'Your Niche Statement',             category: 'consultations', filename_base: '82 consultations niche statement',                 is_placeholder: false },
  { num: 83, title: 'Your Thesis Statement',            category: 'consultations', filename_base: '83 consultations thesis statement',                is_placeholder: false },
  { num: 84, title: 'Action Plan',                      category: 'consultations', filename_base: '84 consultations action plan',                     is_placeholder: false },
  { num: 85, title: 'The Vehicle',                      category: 'consultations', filename_base: '85 consultations vehicle',                         is_placeholder: false },

  // ── Long-Term Enrollment ──────────────────────────────────────────────────
  { num: 88, title: 'Find',                             category: 'enrollment',    filename_base: '88 creating long term enrollment find',             is_placeholder: false },
  { num: 89, title: 'Create',                           category: 'enrollment',    filename_base: '89 creating long term enrollment create',           is_placeholder: false },
  { num: 90, title: 'Set',                              category: 'enrollment',    filename_base: '90 creating long term enrollment set',              is_placeholder: false },

  // ── Resources & Efficiency ────────────────────────────────────────────────
  { num: 92, title: 'Creating Resources, Part 1',      category: 'efficiency',    filename_base: '92 resources efficiency creating 1',                is_placeholder: false },
  { num: 93, title: 'Creating Resources, Part 2',      category: 'efficiency',    filename_base: '93 resources efficiency creating 2',                is_placeholder: false },
  { num: 94, title: 'Creating Resources, Part 3',      category: 'efficiency',    filename_base: '94 resources efficiency creating 3',                is_placeholder: false },
  { num: 95, title: 'Creating Resources, Part 4',      category: 'efficiency',    filename_base: '95 resources efficiency creating 4',                is_placeholder: false },

  // ── Summer Retention ──────────────────────────────────────────────────────
  { num: 96,  title: 'Summer Attrition',               category: 'summer',        filename_base: '96 summer attrition',                               is_placeholder: false },
  { num: 98,  title: 'Summer Phrases',                 category: 'summer',        filename_base: '98 summer phrases',                                 is_placeholder: false },
  { num: 99,  title: 'Summer Conflicts, Part 1',       category: 'summer',        filename_base: '99 summer conflicts 1',                             is_placeholder: false },
  { num: 100, title: 'Summer Conflicts, Part 2',       category: 'summer',        filename_base: '100 summer conflicts 2',                            is_placeholder: false },
  { num: 101, title: 'Retention Final',                category: 'summer',        filename_base: '101 summer retention final',                        is_placeholder: false },

  // ── Finding a Studio ──────────────────────────────────────────────────────
  { num: 102, title: 'Finding a Studio Overview',      category: 'studio-space',  filename_base: '102 finding studio overview',                       is_placeholder: false },
  { num: 103, title: 'Budgeting for Space',            category: 'studio-space',  filename_base: '103 finding studio budget',                         is_placeholder: false },
  { num: 104, title: 'Evaluating Potential Spaces',    category: 'studio-space',  filename_base: '104 finding studio potential',                      is_placeholder: false },
  { num: 105, title: 'Location Considerations',        category: 'studio-space',  filename_base: '105 finding studio location',                       is_placeholder: false },
  { num: 106, title: 'Contacting Landlords',           category: 'studio-space',  filename_base: '106 finding studio contact',                        is_placeholder: false },

  // ── Referrals & Affiliates ────────────────────────────────────────────────
  { num: 107, title: 'Affiliate Benefits',             category: 'affiliate',     filename_base: '107 affiliate benefits',                            is_placeholder: false },
  { num: 108, title: 'Sharing the Program',            category: 'affiliate',     filename_base: '108 affiliate sharing',                             is_placeholder: false },
  { num: 109, title: 'Suggested Affiliates',           category: 'affiliate',     filename_base: '109 affiliate suggested',                           is_placeholder: false },

  // ── LLC ───────────────────────────────────────────────────────────────────
  { num: 110, title: 'LLC Introduction',               category: 'llc',           filename_base: '110 LLC intro',                                     is_placeholder: false },
  { num: 111, title: 'Naming Your LLC',                category: 'llc',           filename_base: '111 LLC naming',                                    is_placeholder: false },
  { num: 112, title: 'Articles of Organization',       category: 'llc',           filename_base: '112 LLC articles',                                  is_placeholder: false },
  { num: 113, title: 'LLC Taxes',                      category: 'llc',           filename_base: '113 LLC tax',                                       is_placeholder: false },
  { num: 114, title: 'Annual Reports',                 category: 'llc',           filename_base: '114 LLC reports',                                   is_placeholder: false },

  // ── Tax ───────────────────────────────────────────────────────────────────
  { num: 115, title: 'Tax Overview',                   category: 'tax',           filename_base: '115 tax overview',                                  is_placeholder: false },
  { num: 116, title: 'Tax Options',                    category: 'tax',           filename_base: '116 tax options',                                   is_placeholder: false },
  { num: 117, title: 'Schedule C',                     category: 'tax',           filename_base: '117 tax schedule C',                                is_placeholder: false },
  { num: 118, title: 'Self-Employment Income',         category: 'tax',           filename_base: '118 tax income self emp',                           is_placeholder: false },
  { num: 119, title: 'Example Calculation',            category: 'tax',           filename_base: '119 tax example calc',                              is_placeholder: false },
  { num: 120, title: 'Quarterly Taxes',                category: 'tax',           filename_base: '120 tax quarterly',                                 is_placeholder: false },
  { num: 121, title: 'Deductions',                     category: 'tax',           filename_base: '121 tax deductions',                                is_placeholder: false },
  { num: 122, title: 'Common Deductions',              category: 'tax',           filename_base: '122 tax common deductions',                         is_placeholder: false },
  { num: 123, title: 'Tax Documentation',              category: 'tax',           filename_base: '123 tax documentation',                             is_placeholder: false },

  // ── Finance ───────────────────────────────────────────────────────────────
  { num: 124, title: 'Finance Overview',               category: 'finance',       filename_base: '124 finance overview',                              is_placeholder: false },
  { num: 125, title: 'Financial Terms',                category: 'finance',       filename_base: '125 finance terms',                                 is_placeholder: false },
  { num: 126, title: 'Balance Sheet',                  category: 'finance',       filename_base: '126 finance balance sheet',                         is_placeholder: false },
  { num: 127, title: 'Financial Essentials',           category: 'finance',       filename_base: '127 finance essentials',                            is_placeholder: false },
  { num: 128, title: 'Payment Systems',                category: 'finance',       filename_base: '128 finance payment',                               is_placeholder: false },
  { num: 129, title: 'Managing Expenses',              category: 'finance',       filename_base: '129 finance expenses',                              is_placeholder: false },

  // ── Independent Contractors ───────────────────────────────────────────────
  { num: 130, title: 'Independent Contractors Overview', category: 'ic',          filename_base: '130 IC overview',                                  is_placeholder: false },
  { num: 131, title: 'IC vs. Employee',                category: 'ic',            filename_base: '131 IC vs employee',                                is_placeholder: false },
  { num: 132, title: 'IRS Status Criteria',            category: 'ic',            filename_base: '132 IC status irs',                                 is_placeholder: false },
  { num: 133, title: 'Finding ICs',                    category: 'ic',            filename_base: '133 IC finding',                                    is_placeholder: false },
  { num: 134, title: 'IC Materials',                   category: 'ic',            filename_base: '134 IC materials',                                  is_placeholder: false },
  { num: 135, title: 'IC Contract',                    category: 'ic',            filename_base: '135 IC contract',                                   is_placeholder: false },
  { num: 136, title: 'Mistakes to Avoid',              category: 'ic',            filename_base: '136 IC avoid',                                      is_placeholder: false },
  { num: 137, title: 'Payment & Taxes',                category: 'ic',            filename_base: '137 IC payment tax',                                is_placeholder: false },

  // ── Content Creation ──────────────────────────────────────────────────────
  { num: 138, title: 'Content Expectations',           category: 'content',       filename_base: '138 content expectations',                          is_placeholder: false },
  { num: 139, title: 'What to Post',                   category: 'content',       filename_base: '139 content what',                                  is_placeholder: false },
  { num: 140, title: 'How Often to Post',              category: 'content',       filename_base: '140 content how often',                             is_placeholder: false },
  { num: 141, title: 'Content Tools',                  category: 'content',       filename_base: '141 content tools',                                 is_placeholder: false },
  { num: 142, title: 'Sample Game Plan',               category: 'content',       filename_base: '142 content sample gameplan',                       is_placeholder: false },
]

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const toUpload     = CATALOG.filter(i => !i.is_placeholder)
  const placeholders = CATALOG.filter(i => i.is_placeholder)

  console.log(`\n📚  OTB Education Library Upload${DRY_RUN ? '  (DRY RUN)' : ''}\n`)
  console.log(`    ${CATALOG.length} total items`)
  console.log(`    ${toUpload.length} videos to upload`)
  console.log(`    ${placeholders.length} placeholders\n`)

  // Fetch existing rows so we can skip already-done items (idempotent)
  const { data: existing } = await supabase
    .from('education_library_items')
    .select('title, category')
  const done = new Set((existing ?? []).map(r => `${r.category}::${r.title}`))

  let processed = 0, skipped = 0, failed = 0
  const errors = []

  for (let i = 0; i < CATALOG.length; i++) {
    const item = CATALOG[i]
    const key  = `${item.category}::${item.title}`

    console.log(`[${String(i + 1).padStart(3)}/${CATALOG.length}]  ${item.title}  (${item.category})`)

    if (done.has(key)) {
      console.log('         ⏭  already in DB\n')
      skipped++
      continue
    }

    // ── Placeholder ──────────────────────────────────────────────────────────
    if (item.is_placeholder) {
      if (!DRY_RUN) {
        const { error } = await supabase.from('education_library_items').insert({
          title:          item.title,
          type:           'video',
          category:       item.category,
          position:       item.num * 10,
          is_placeholder: true,
          cf_uid:         null,
          transcript_text: null,
        })
        if (error) {
          console.error(`         ✗  DB insert failed: ${error.message}\n`)
          failed++
          errors.push({ title: item.title, error: error.message })
          continue
        }
      }
      console.log('         ⬜  placeholder inserted\n')
      processed++
      continue
    }

    // ── Real video ───────────────────────────────────────────────────────────
    const videoPath = join(KAJABI, `${item.filename_base}.mp4`)
    const rtfPath   = join(KAJABI, `${item.filename_base}.rtf`)

    if (!existsSync(videoPath)) {
      console.error(`         ✗  video file not found: ${videoPath}\n`)
      failed++
      errors.push({ title: item.title, error: 'file not found' })
      continue
    }

    const sizeMb = (statSync(videoPath).size / 1024 / 1024).toFixed(0)
    console.log(`         📁  ${sizeMb} MB`)

    // Convert RTF → text
    let transcriptText = null
    if (existsSync(rtfPath)) {
      transcriptText = rtfToText(rtfPath)
      console.log(`         📝  transcript: ${transcriptText ? `${transcriptText.length} chars` : 'conversion failed'}`)
    }

    if (DRY_RUN) {
      console.log('         [dry run] would upload and insert\n')
      processed++
      continue
    }

    // Upload to Cloudflare Stream
    let cfUid = null
    try {
      cfUid = await uploadToStream(videoPath, item.title)
      if (!cfUid) throw new Error('No UID returned from Cloudflare')
    } catch (err) {
      console.error(`         ✗  upload failed: ${err.message}\n`)
      failed++
      errors.push({ title: item.title, error: String(err.message) })
      continue
    }

    // Patch requireSignedURLs=false (TUS metadata not always honoured)
    try {
      const patchRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/${cfUid}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requireSignedURLs: false }),
        }
      )
      if (!patchRes.ok) {
        console.warn(`         ⚠  requireSignedURLs patch failed (${patchRes.status}) — video may be locked`)
      }
    } catch (patchErr) {
      console.warn(`         ⚠  requireSignedURLs patch error: ${patchErr.message}`)
    }

    // Insert into DB
    const { error: dbErr } = await supabase.from('education_library_items').insert({
      title:           item.title,
      type:            'video',
      category:        item.category,
      position:        item.num * 10,
      is_placeholder:  false,
      cf_uid:          cfUid,
      transcript_text: transcriptText,
    })

    if (dbErr) {
      console.error(`         ✗  DB insert failed: ${dbErr.message}\n`)
      failed++
      errors.push({ title: item.title, error: dbErr.message })
      continue
    }

    console.log(`         ✓  done  cf_uid=${cfUid}\n`)
    processed++
  }

  console.log('─────────────────────────────────────')
  console.log(`  ✓  Processed : ${processed}`)
  console.log(`  ⏭  Skipped   : ${skipped}`)
  console.log(`  ✗  Failed    : ${failed}`)
  if (errors.length) {
    console.log('\nFailed items:')
    errors.forEach(e => console.log(`  - ${e.title}: ${e.error}`))
  }
  console.log('')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
