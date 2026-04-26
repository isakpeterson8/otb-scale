import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'
import PipelineClient from './PipelineClient'
import type { PipelineEvent, Contact } from '@/types/database'

export default async function PipelinePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [pipelineResult, contactsResult] = await Promise.all([
    supabase
      .from('pipeline_events')
      .select('*, contacts(id, name, email)')
      .order('event_date', { ascending: false }),
    supabase
      .from('contacts')
      .select('id, name, email')
      .order('name', { ascending: true }),
  ])

  const events = (pipelineResult.data ?? []) as (PipelineEvent & {
    contacts: Pick<Contact, 'id' | 'name' | 'email'> | null
  })[]
  const contacts = (contactsResult.data ?? []) as Pick<Contact, 'id' | 'name' | 'email'>[]

  return (
    <AppShell>
      <main className="flex-1 px-8 py-7">
        <PipelineClient events={events} contacts={contacts} />
      </main>
    </AppShell>
  )
}
