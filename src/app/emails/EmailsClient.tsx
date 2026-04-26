'use client'

import { useState, useTransition } from 'react'
import { formatDate } from '@/lib/utils'
import { createTemplate, updateTemplate, deleteTemplate, updateCadenceItem } from '@/app/actions/emails'
import type { EmailSend, EmailTemplate, CadenceQueueItem, Contact } from '@/types/database'

type SendRow = EmailSend & {
  contacts: Pick<Contact, 'name' | 'email'> | null
  email_bodies: { content: string } | null
}

type QueueRow = CadenceQueueItem & {
  contacts: Pick<Contact, 'name' | 'email'> | null
  email_templates: Pick<EmailTemplate, 'name' | 'subject'> | null
}

interface EmailsClientProps {
  sends: SendRow[]
  templates: EmailTemplate[]
  queue: QueueRow[]
}

type Tab = 'sent' | 'templates' | 'queue'

function TemplateForm({
  template,
  onClose,
}: {
  template?: EmailTemplate
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = template
        ? await updateTemplate(template.id, formData)
        : await createTemplate(formData)
      if (result.error) setError(result.error)
      else onClose()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs text-[var(--ink-3)] mb-1">Template name *</label>
        <input
          name="name"
          required
          defaultValue={template?.name}
          className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
          placeholder="Follow-up #1"
        />
      </div>
      <div>
        <label className="block text-xs text-[var(--ink-3)] mb-1">Subject *</label>
        <input
          name="subject"
          required
          defaultValue={template?.subject}
          className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
          placeholder="Following up on your trial lesson"
        />
      </div>
      <div>
        <label className="block text-xs text-[var(--ink-3)] mb-1">Body *</label>
        <textarea
          name="body"
          required
          defaultValue={template?.body}
          rows={6}
          className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)] resize-none font-mono"
          placeholder="Hi {{name}}, ..."
        />
      </div>

      {error && (
        <p className="text-xs text-[var(--red)] bg-[var(--red-l)] px-3 py-2 rounded-lg">{error}</p>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--ink)] text-sm font-medium hover:bg-[var(--accent-text)] hover:text-[var(--canvas)] disabled:opacity-60 transition-colors"
        >
          {isPending ? 'Saving…' : template ? 'Save changes' : 'Create template'}
        </button>
      </div>
    </form>
  )
}

export default function EmailsClient({ sends, templates, queue }: EmailsClientProps) {
  const [tab, setTab] = useState<Tab>('sent')
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [editTemplate, setEditTemplate] = useState<EmailTemplate | null>(null)
  const [previewEmail, setPreviewEmail] = useState<SendRow | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleDeleteTemplate(id: string) {
    if (!confirm('Delete this template?')) return
    startTransition(async () => {
      await deleteTemplate(id)
    })
  }

  function handleCadenceAction(id: string, status: string) {
    startTransition(async () => {
      await updateCadenceItem(id, status)
    })
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'sent', label: 'Sent', count: sends.length },
    { key: 'templates', label: 'Templates', count: templates.length },
    { key: 'queue', label: 'Queue', count: queue.filter((q) => q.status === 'pending').length },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
            Emails
          </h2>
        </div>
        {tab === 'templates' && (
          <button
            onClick={() => { setEditTemplate(null); setShowTemplateForm(true) }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--ink)] text-sm font-medium hover:bg-[var(--accent-text)] hover:text-[var(--canvas)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            New template
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 border-b border-[var(--ink)]/8">
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={[
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === key
                ? 'text-[var(--ink)] border-[var(--accent-text)]'
                : 'text-[var(--ink-3)] border-transparent hover:text-[var(--ink-2)]',
            ].join(' ')}
          >
            {label}
            {count > 0 && (
              <span className={`ml-1.5 text-xs ${tab === key ? 'text-[var(--accent-text)]' : 'text-[var(--ink-3)]'}`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {(showTemplateForm || editTemplate) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg bg-[var(--surface)] rounded-2xl border border-[var(--ink)]/8 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-medium text-[var(--ink)]">
                {editTemplate ? 'Edit template' : 'New template'}
              </h3>
              <button
                onClick={() => { setShowTemplateForm(false); setEditTemplate(null) }}
                className="text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <TemplateForm
              template={editTemplate ?? undefined}
              onClose={() => { setShowTemplateForm(false); setEditTemplate(null) }}
            />
          </div>
        </div>
      )}

      {previewEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg bg-[var(--surface)] rounded-2xl border border-[var(--ink)]/8 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-medium text-[var(--ink)]">{previewEmail.subject}</h3>
                <p className="text-xs text-[var(--ink-3)] mt-0.5">
                  To: {previewEmail.contacts?.name ?? 'Unknown'} · {formatDate(previewEmail.sent_at)}
                </p>
              </div>
              <button
                onClick={() => setPreviewEmail(null)}
                className="text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="bg-[var(--canvas)] rounded-xl p-4 max-h-96 overflow-y-auto">
              <pre className="text-sm text-[var(--ink-2)] whitespace-pre-wrap font-sans">
                {previewEmail.email_bodies?.content ?? 'No content available'}
              </pre>
            </div>
          </div>
        </div>
      )}

      {tab === 'sent' && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
          {sends.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <p className="text-sm text-[var(--ink-3)]">No emails sent yet.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ink)]/8">
                  <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">To</th>
                  <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Subject</th>
                  <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide hidden md:table-cell">Sent</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ink)]/6">
                {sends.map((send) => (
                  <tr key={send.id} className="hover:bg-[var(--canvas)] transition-colors">
                    <td className="px-5 py-3 text-[var(--ink-2)]">
                      {send.contacts?.name ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-[var(--ink)] truncate max-w-[200px]">{send.subject}</td>
                    <td className="px-5 py-3 text-[var(--ink-3)] text-xs hidden md:table-cell">
                      {formatDate(send.sent_at)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {send.email_bodies && (
                        <button
                          onClick={() => setPreviewEmail(send)}
                          className="text-xs text-[var(--accent-text)] hover:text-[var(--ink)] transition-colors"
                        >
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'templates' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-16 bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 gap-2">
              <p className="text-sm text-[var(--ink-3)]">No templates yet. Create one to get started.</p>
            </div>
          ) : (
            templates.map((tmpl) => (
              <div key={tmpl.id} className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 p-5 flex flex-col gap-3">
                <div>
                  <h3 className="text-sm font-medium text-[var(--ink)]">{tmpl.name}</h3>
                  <p className="text-xs text-[var(--ink-3)] mt-0.5 line-clamp-1">{tmpl.subject}</p>
                </div>
                <p className="text-xs text-[var(--ink-2)] line-clamp-3 flex-1">{tmpl.body}</p>
                <div className="flex items-center gap-2 pt-1 border-t border-[var(--ink)]/8">
                  <button
                    onClick={() => setEditTemplate(tmpl)}
                    className="text-xs text-[var(--accent-text)] hover:text-[var(--ink)] transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(tmpl.id)}
                    disabled={isPending}
                    className="text-xs text-[var(--ink-3)] hover:text-[var(--red)] transition-colors ml-auto"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'queue' && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
          {queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <p className="text-sm text-[var(--ink-3)]">No emails queued.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ink)]/8">
                  <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Contact</th>
                  <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Template</th>
                  <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide hidden md:table-cell">Scheduled</th>
                  <th className="text-left px-5 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ink)]/6">
                {queue.map((item) => (
                  <tr key={item.id} className="hover:bg-[var(--canvas)] transition-colors">
                    <td className="px-5 py-3 text-[var(--ink-2)]">{item.contacts?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-[var(--ink)]">{item.email_templates?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-[var(--ink-3)] text-xs hidden md:table-cell">
                      {formatDate(item.scheduled_at)}
                    </td>
                    <td className="px-5 py-3">
                      <span className={[
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                        item.status === 'sent' ? 'bg-[var(--green-l)] text-[var(--green)]'
                          : item.status === 'skipped' ? 'bg-white/8 text-[var(--ink-3)]'
                          : 'bg-[var(--amber-l)] text-[var(--amber)]',
                      ].join(' ')}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {item.status === 'pending' && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleCadenceAction(item.id, 'skipped')}
                            disabled={isPending}
                            className="text-xs text-[var(--ink-3)] hover:text-[var(--red)] transition-colors"
                          >
                            Skip
                          </button>
                        </div>
                      )}
                      {item.status === 'skipped' && (
                        <button
                          onClick={() => handleCadenceAction(item.id, 'pending')}
                          disabled={isPending}
                          className="text-xs text-[var(--accent-text)] hover:text-[var(--ink)] transition-colors"
                        >
                          Requeue
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
