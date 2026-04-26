import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'
import EmailsClient from './EmailsClient'
import type { EmailSend, EmailTemplate, CadenceQueueItem, Contact } from '@/types/database'

export default async function EmailsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [sendsResult, templatesResult, queueResult] = await Promise.all([
    supabase
      .from('email_sends')
      .select('*, contacts(name, email), email_bodies(content)')
      .order('sent_at', { ascending: false })
      .limit(50),
    supabase
      .from('email_templates')
      .select('*')
      .order('name', { ascending: true }),
    supabase
      .from('cadence_queue')
      .select('*, contacts(name, email), email_templates(name, subject)')
      .order('scheduled_at', { ascending: true })
      .limit(50),
  ])

  const sends = (sendsResult.data ?? []) as (EmailSend & {
    contacts: Pick<Contact, 'name' | 'email'> | null
    email_bodies: { content: string } | null
  })[]
  const templates = (templatesResult.data ?? []) as EmailTemplate[]
  const queue = (queueResult.data ?? []) as (CadenceQueueItem & {
    contacts: Pick<Contact, 'name' | 'email'> | null
    email_templates: Pick<EmailTemplate, 'name' | 'subject'> | null
  })[]

  return (
    <AppShell>
      <main className="flex-1 px-8 py-7">
        <EmailsClient sends={sends} templates={templates} queue={queue} />
      </main>
    </AppShell>
  )
}
