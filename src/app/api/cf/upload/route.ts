import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Creates a Cloudflare Stream direct creator upload URL.
// Client uses the returned uploadURL with tus-js-client to upload directly to Cloudflare.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'otb_admin' && profile?.role !== 'otb_staff') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const body = await req.json()
  const { name, size } = body as { name: string; size: number }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.CLOUDFLARE_API_TOKEN

  if (!accountId || !apiToken) {
    return NextResponse.json({ error: 'Cloudflare credentials not configured' }, { status: 500 })
  }

  const cfRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        maxDurationSeconds: 7200,
        requireSignedURLs: false,
        meta: { name },
      }),
    }
  )

  if (!cfRes.ok) {
    const text = await cfRes.text()
    console.error('[cf/upload] Cloudflare API error:', text)
    return NextResponse.json({ error: 'Failed to create upload URL' }, { status: 502 })
  }

  const cfData = await cfRes.json()
  const { uid, uploadURL } = cfData.result ?? {}

  if (!uid || !uploadURL) {
    return NextResponse.json({ error: 'Invalid Cloudflare response' }, { status: 502 })
  }

  return NextResponse.json({ uid, uploadURL })
}
