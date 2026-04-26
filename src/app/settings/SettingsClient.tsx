'use client'

import { useState, useTransition, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { upsertSettings, disconnectGmail } from '@/app/actions/settings'
import type { Profile, UserSettings } from '@/types/database'

interface Props {
  profile: Profile | null
  settings: UserSettings | null
  email: string
  gmailConnected: boolean
}

function OAuthNotice({
  onConnected,
  onError,
}: {
  onConnected: () => void
  onError: (msg: string) => void
}) {
  const searchParams = useSearchParams()
  useEffect(() => {
    if (searchParams.get('gmail_connected')) onConnected()
    const err = searchParams.get('gmail_error')
    if (err) onError(`Gmail connection failed: ${err.replace(/_/g, ' ')}`)
  }, [searchParams, onConnected, onError])
  return null
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 p-6 space-y-4">
      <h3 className="text-sm font-medium text-[var(--ink)] border-b border-[var(--ink)]/8 pb-3">{title}</h3>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-[var(--ink-3)] mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputClass = 'w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]'
const readonlyClass = 'w-full px-3 py-2 rounded-lg border border-[var(--ink)]/8 bg-[var(--dark-2)] text-sm text-[var(--ink-3)] select-none'

export default function SettingsClient({ profile, settings, email, gmailConnected }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [gmailEnabled, setGmailEnabled] = useState(settings?.gmail_send_enabled ?? false)

  function handleDisconnect() {
    if (!confirm('Disconnect Gmail? You will need to reconnect to send emails from the app.')) return
    startTransition(async () => {
      const result = await disconnectGmail()
      if (result.error) setError(result.error)
      else setGmailEnabled(false)
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    const fd = new FormData(e.currentTarget)
    fd.set('gmail_send_enabled', gmailEnabled ? 'true' : 'false')
    startTransition(async () => {
      const result = await upsertSettings(fd)
      if (result.error) setError(result.error)
      else setSaved(true)
    })
  }

  return (
    <div className="space-y-5">
      <Suspense>
        <OAuthNotice
          onConnected={() => setSaved(true)}
          onError={(msg) => setError(msg)}
        />
      </Suspense>

      <div>
        <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
          Settings
        </h2>
        <p className="text-sm text-[var(--ink-3)] mt-0.5">Manage your profile and studio preferences</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Section title="Profile">
          <Field label="Display name">
            <input
              name="display_name"
              type="text"
              defaultValue={settings?.display_name ?? profile?.display_name ?? ''}
              placeholder="Your name"
              className={inputClass}
            />
          </Field>
          <Field label="Email">
            <div className={readonlyClass}>{email}</div>
          </Field>
          <Field label="Role">
            <div className={readonlyClass}>{profile?.role === 'otb_admin' ? 'OTB Admin' : 'Studio Owner'}</div>
          </Field>
        </Section>

        <Section title="Studio Info">
          <Field label="Studio name">
            <input
              name="studio_name"
              type="text"
              defaultValue={settings?.studio_name ?? ''}
              placeholder="My Music Studio"
              className={inputClass}
            />
          </Field>
          <Field label="Location">
            <input
              name="location"
              type="text"
              defaultValue={settings?.location ?? ''}
              placeholder="Portland, OR"
              className={inputClass}
            />
          </Field>
          <Field label="Phone number">
            <input
              name="phone"
              type="tel"
              defaultValue={settings?.phone ?? ''}
              placeholder="(555) 000-0000"
              className={inputClass}
            />
          </Field>
          <Field label="Instruments taught">
            <input
              name="instruments"
              type="text"
              defaultValue={settings?.instruments ?? ''}
              placeholder="Piano, Guitar, Voice"
              className={inputClass}
            />
          </Field>
        </Section>

        <Section title="Email Defaults">
          <Field label="Default sender name">
            <input
              name="sender_name"
              type="text"
              defaultValue={settings?.sender_name ?? ''}
              placeholder="Your Name"
              className={inputClass}
            />
          </Field>
          <Field label="Reply-to email">
            <input
              name="reply_to_email"
              type="email"
              defaultValue={settings?.reply_to_email ?? ''}
              placeholder="you@example.com"
              className={inputClass}
            />
          </Field>
        </Section>

        <Section title="Email Integration">
          <div className="flex items-center gap-4">
            <span
              className="text-sm transition-colors"
              style={{ color: gmailEnabled ? 'rgba(0,0,0,0.4)' : '#000000', fontWeight: gmailEnabled ? 400 : 600 }}
            >
              Copy to clipboard
            </span>
            <button
              type="button"
              onClick={() => setGmailEnabled(!gmailEnabled)}
              className={[
                'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors',
                gmailEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--ink)]/15',
              ].join(' ')}
              role="switch"
              aria-checked={gmailEnabled}
            >
              <span
                className={[
                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform',
                  gmailEnabled ? 'translate-x-5' : 'translate-x-0',
                ].join(' ')}
              />
            </button>
            <span
              className="text-sm transition-colors"
              style={{ color: gmailEnabled ? '#04ADEF' : 'rgba(0,0,0,0.4)', fontWeight: gmailEnabled ? 600 : 400 }}
            >
              Send from app
            </span>
          </div>

          {gmailEnabled && (
            <div className="pt-1">
              {gmailConnected ? (
                <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[var(--green-l)] border border-[var(--green)]/20">
                  <div className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                      <circle cx="7" cy="7" r="6" stroke="var(--green)" strokeWidth="1.3" />
                      <path d="M4.5 7l2 2 3-3" stroke="var(--green)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <p className="text-xs text-[var(--green)] font-medium">Gmail connected</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={isPending}
                    className="text-xs text-[var(--ink-3)] hover:text-[var(--red)] transition-colors disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--ink)]/8">
                  <p className="text-xs text-[var(--ink-2)]">Connect your Gmail account to send emails directly from the app.</p>
                  <a
                    href="/api/auth/google"
                    className="ml-4 shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--ink)] text-xs font-medium hover:bg-[var(--accent-text)] hover:text-[var(--canvas)] transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                    Connect Gmail
                  </a>
                </div>
              )}
            </div>
          )}
        </Section>

        {error && (
          <p className="text-xs text-[var(--red)] bg-[var(--red-l)] px-3 py-2 rounded-lg">{error}</p>
        )}
        {saved && (
          <p className="text-xs text-[var(--green)] bg-[var(--green-l)] px-3 py-2 rounded-lg">Settings saved.</p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="px-6 py-2.5 rounded-lg bg-[var(--accent)] text-[var(--ink)] text-sm font-medium hover:bg-[var(--accent-text)] hover:text-[var(--canvas)] disabled:opacity-60 transition-colors"
          >
            {isPending ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
