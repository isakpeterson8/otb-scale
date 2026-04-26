import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'
import ContactsClient from './ContactsClient'
import type { Contact } from '@/types/database'

export default async function ContactsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data } = await supabase
    .from('contacts')
    .select('*')
    .order('created_at', { ascending: false })

  const contacts = (data ?? []) as Contact[]

  return (
    <AppShell>
      <main className="flex-1 px-4 md:px-8 py-5 md:py-7">
        <ContactsClient contacts={contacts} />
      </main>
    </AppShell>
  )
}
