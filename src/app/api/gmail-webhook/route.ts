import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  return runCheck()
}

export async function POST() {
  return runCheck()
}

async function runCheck() {
  const supabase = await createAdminClient()

  const { data: enrollments } = await supabase
    .from('cadence_enrollments')
    .select('id, user_id, gmail_thread_id')
    .eq('status', 'active')
    .not('gmail_thread_id', 'is', null)

  if (!enrollments?.length) {
    return NextResponse.json({ detected: 0, checked: 0 })
  }

  // Gmail OAuth integration needed — reply detection would run here per thread
  // const detected = await detectRepliesViaGmail(enrollments)

  return NextResponse.json({ detected: 0, checked: enrollments.length })
}
