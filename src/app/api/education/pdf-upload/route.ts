import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

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

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const filename = `${Date.now()}-${file.name.replace(/[^a-z0-9._-]/gi, '_')}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await adminClient.storage
    .from('education-library')
    .upload(filename, buffer, { contentType: file.type, upsert: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: { publicUrl } } = adminClient.storage
    .from('education-library')
    .getPublicUrl(filename)

  return NextResponse.json({ url: publicUrl })
}
