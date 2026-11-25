import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { readTokenRow } from '@/lib/lss-google'
import { syncLssAttendees } from '@/lib/lss-sync'

// Nightly Live Support attendee sync (vercel.json crons). Vercel sends
// "Authorization: Bearer $CRON_SECRET"; anything else is refused.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = await readTokenRow()
  if (!token?.refresh_token) return NextResponse.json({ skipped: 'Google Calendar not connected' })

  try {
    // Soonest first, 2 s between sessions, stops on the first quota error.
    const results = await syncLssAttendees({}, 2000)
    const summary = results.map(r => ({
      session: r.sessionId,
      added: r.added.length,
      removed: r.removed.length,
      error: r.error,
      quota: r.quota,
    }))
    console.info('[lss] nightly sync', JSON.stringify(summary))
    return NextResponse.json({ sessions: results.length, results: summary })
  } catch (err) {
    console.error('[lss] nightly sync failed', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
