import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getStudioId } from '@/app/actions/_shared'
import AppShell from '@/components/layout/AppShell'
import ContactsClient from './ContactsClient'
import type { Contact } from '@/types/database'

export const metadata: Metadata = { title: 'Contacts' }

export default async function ContactsPage() {
  const ctx = await getStudioId()
  if (!ctx) redirect('/auth/login')
  const { supabase, studioId } = ctx

  const { data } = await supabase
    .from('contacts')
    .select('*')
    .eq('studio_id', studioId)
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
