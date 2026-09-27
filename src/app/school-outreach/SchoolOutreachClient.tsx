'use client'

import { useState, useTransition, useEffect } from 'react'
import { createSchoolOutreach, updateSchoolOutreach, deleteSchoolOutreach } from '@/app/actions/school-outreach'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Toast, { useToast } from '@/components/ui/Toast'
import {
  enrollInCadence,
  markEmailSent,
  removeFromCadence,
  checkGmailReplies,
  sendCadenceEmail,
} from '@/app/actions/cadence'
import type { SchoolOutreach, SchoolOutreachStage, CadenceEnrollment, UserSettings } from '@/types/database'
import {
  SCHOOL_STAGES, SCHOOL_NEXT_STEP_OPTIONS, SCHOOL_SUBJECT_AREAS, SCHOOL_LOGGABLE_TYPES,
  type SchoolContact, type SchoolOutreachActivity, type SchoolNextStepOption,
  type SchoolSubjectArea,
} from '@/types/database'
import {
  activityLabel, emailableContacts, nextStepLabel, primaryContact, sortActivity,
  subjectAreaLabel, websiteDisplay,
} from '@/lib/school-outreach'
import {
  createSchoolContact, updateSchoolContact, deleteSchoolContact,
  setPrimarySchoolContact, logSchoolActivity, deleteSchoolActivity,
} from '@/app/actions/school-outreach'
import FilterTabs from '@/components/ui/FilterTabs'
import {
  OPENING_TEMPLATES,
  FOLLOWUP_EMAILS,
  type OpeningTemplateKey,
} from '@/lib/emailTemplates'
import { applyAutoFills } from '@/lib/utils'

interface Props {
  schools: SchoolOutreach[]
  enrollments: CadenceEnrollment[]
  contacts: SchoolContact[]
  activity: SchoolOutreachActivity[]
  settings: UserSettings | null
  /** Admin impersonating a studio: everything renders, nothing writes. */
  viewOnly: boolean
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtShort(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function StageBadge({ stage }: { stage: SchoolOutreachStage }) {
  const def = SCHOOL_STAGES.find((s) => s.value === stage)
  if (!def) return <span className="text-xs text-[var(--ink-3)]">{stage}</span>
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ background: def.bg, color: def.text }}
    >
      {def.label}
    </span>
  )
}

function getCadenceBadge(e: CadenceEnrollment | null, todayStr: string) {
  if (!e) return { label: 'Not enrolled', bg: 'rgba(0,0,0,0.04)', text: 'rgba(0,0,0,0.35)' }
  if (e.status === 'completed') return { label: 'Completed', bg: 'rgba(22,163,74,0.1)', text: 'var(--green)' }
  if (e.status === 'replied') return { label: 'Removed — replied', bg: 'rgba(4,173,239,0.1)', text: 'var(--accent-text)' }
  if (e.status === 'removed') {
    if (e.removal_reason === 'reply_detected') return { label: 'Removed — replied', bg: 'rgba(4,173,239,0.1)', text: 'var(--accent-text)' }
    return { label: 'Removed', bg: 'rgba(0,0,0,0.04)', text: 'rgba(0,0,0,0.35)' }
  }
  const num = e.current_email_number ?? 0
  if (num === 0) {
    return { label: 'Email 1 ready', bg: 'rgba(4,173,239,0.1)', text: 'var(--accent-text)' }
  }
  if (num === 1) {
    if (e.email_2_due_at && e.email_2_due_at.slice(0, 10) <= todayStr) {
      return { label: `Email 2 due ${fmtShort(e.email_2_due_at)}`, bg: 'rgba(180,83,9,0.1)', text: 'var(--amber)' }
    }
    return { label: 'Email 1 sent', bg: 'rgba(4,173,239,0.1)', text: 'var(--accent-text)' }
  }
  if (num === 2) {
    const d = e.email_3_due_at
    return { label: d ? `Email 3 due ${fmtShort(d)}` : 'Email 2 sent', bg: 'rgba(180,83,9,0.1)', text: 'var(--amber)' }
  }
  if (num === 3) {
    const d = e.email_4_due_at
    return { label: d ? `Email 4 due ${fmtShort(d)}` : 'Email 3 sent', bg: 'rgba(180,83,9,0.1)', text: 'var(--amber)' }
  }
  return { label: 'Completed', bg: 'rgba(22,163,74,0.1)', text: 'var(--green)' }
}

function getNextEmailNumber(e: CadenceEnrollment): number | null {
  if (e.status !== 'active') return null
  const num = e.current_email_number ?? 0
  if (num >= 4) return null
  return num + 1
}

function getNextEmailContent(e: CadenceEnrollment) {
  const nextNum = getNextEmailNumber(e)
  if (!nextNum) return null
  const openingTpl = OPENING_TEMPLATES[e.opening_template as OpeningTemplateKey]
  const openingSubject = openingTpl?.subject ?? 'Guest Instructor'
  if (nextNum === 1) {
    if (!openingTpl) return null
    return { emailNumber: 1, subject: openingTpl.subject, body: openingTpl.body }
  }
  if (nextNum === 2 || nextNum === 3 || nextNum === 4) {
    const tpl = FOLLOWUP_EMAILS[nextNum as 2 | 3 | 4]
    return { emailNumber: nextNum, subject: `Re: ${openingSubject}`, body: tpl.body }
  }
  return null
}

function HighlightedBody({ text }: { text: string }) {
  const parts = text.split(/(\$[A-Za-z][A-Za-z0-9]*)/g)
  return (
    <pre className="whitespace-pre-wrap text-sm text-[var(--ink-2)] font-sans leading-relaxed">
      {parts.map((part, i) =>
        /^\$[A-Za-z]/.test(part) ? (
          <span
            key={i}
            className="rounded px-0.5"
            style={{ background: 'rgba(4,173,239,0.15)', color: '#04ADEF' }}
          >
            {part}
          </span>
        ) : (
          part
        )
      )}
    </pre>
  )
}

function SchoolForm({ school, onClose }: { school?: SchoolOutreach; onClose: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Free text is only shown for "Other", but is never cleared: the original
  // wording stays in next_step so switching option does not destroy it.
  const [nextOption, setNextOption] = useState<SchoolNextStepOption | ''>(school?.next_step_option ?? '')

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = school ? await updateSchoolOutreach(school.id, fd) : await createSchoolOutreach(fd)
      if (result.error) setError(result.error)
      else onClose()
    })
  }

  const textField = (label: string, name: string, type = 'text', placeholder = '', required = false) => (
    <div>
      <label className="block text-xs text-[var(--ink-3)] mb-1">{label}{required && ' *'}</label>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={school ? (school[name as keyof SchoolOutreach] as string | number | null) ?? '' : ''}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
      />
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pr-1">
      {textField('School Name', 'school_name', 'text', 'Lincoln Elementary', true)}
      <div className="grid grid-cols-2 gap-3">
        {textField('Contact Name', 'contact_name', 'text', 'Ms. Johnson')}
        {textField('Phone', 'phone', 'tel', '(555) 000-0000')}
      </div>
      {textField('Email', 'email', 'email', 'principal@school.edu')}
      {textField('Website', 'website', 'text', 'lincolnelementary.org')}
      <p className="text-[11px] text-[var(--ink-3)] -mt-2">
        https:// is added automatically if you leave it off.
      </p>
      <div>
        <label className="block text-xs text-[var(--ink-3)] mb-1">Stage</label>
        <select
          name="stage"
          defaultValue={school?.stage ?? 'lead'}
          className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
        >
          {SCHOOL_STAGES.map(({ value, label }) => (
            <option key={value} value={value} className="bg-[var(--surface)]">{label}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {textField('First Contact Date', 'first_contact_date', 'date')}
        {textField('Last Interacted', 'last_interacted_date', 'date')}
      </div>
      <div>
        <label className="block text-xs text-[var(--ink-3)] mb-1">Next Step</label>
        <select
          name="next_step_option"
          value={nextOption}
          onChange={e => setNextOption(e.target.value as SchoolNextStepOption | '')}
          className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
        >
          <option value="" className="bg-[var(--surface)]">— None —</option>
          {SCHOOL_NEXT_STEP_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value} className="bg-[var(--surface)]">{label}</option>
          ))}
        </select>
      </div>
      {/* Rendered hidden rather than unmounted when another option is chosen, so
          the original free text is still submitted and never silently lost. */}
      <div className={nextOption === 'other' ? '' : 'hidden'}>
        <label className="block text-xs text-[var(--ink-3)] mb-1">Notes on the next step</label>
        <input
          name="next_step"
          type="text"
          defaultValue={school?.next_step ?? ''}
          placeholder="Follow up with the principal about the spring visit"
          className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
        />
      </div>
      {nextOption !== 'other' && school?.next_step && (
        <p className="text-[11px] text-[var(--ink-3)] -mt-1">
          Earlier note kept: “{school.next_step}”
        </p>
      )}
      {textField('Next Step Due Date', 'next_step_due_date', 'date')}
      <div>
        <label className="block text-xs text-[var(--ink-3)] mb-1">Notes</label>
        <textarea
          name="notes"
          defaultValue={school?.notes ?? ''}
          rows={3}
          placeholder="Any notes…"
          className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)] resize-none"
        />
      </div>
      {error && <p className="text-xs text-[var(--red)] bg-[var(--red-l)] px-3 py-2 rounded-lg">{error}</p>}
      <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ink)]/8">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--ink)] text-sm font-medium hover:bg-[var(--accent-text)] hover:text-[var(--canvas)] disabled:opacity-60 transition-colors"
        >
          {isPending ? 'Saving…' : school ? 'Save changes' : 'Add school'}
        </button>
      </div>
    </form>
  )
}

const OPENING_TEMPLATE_KEYS: OpeningTemplateKey[] = ['initial_contact', 'familiar_teacher', 'shared_student', 'virtual']
const OPENING_TEMPLATE_LABELS: Record<OpeningTemplateKey, string> = {
  initial_contact: 'Initial Contact',
  familiar_teacher: 'Familiar Teacher',
  shared_student: 'Shared Student',
  virtual: 'Virtual',
}

function EnrollModal({
  school,
  onClose,
  onEnroll,
  isPending,
}: {
  school: SchoolOutreach
  onClose: () => void
  onEnroll: (template: OpeningTemplateKey) => void
  isPending: boolean
}) {
  const [selected, setSelected] = useState<OpeningTemplateKey | null>(null)
  const [preview, setPreview] = useState<OpeningTemplateKey | null>(null)

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:bg-black/50 sm:px-4">
      <div className="flex-1 flex flex-col overflow-hidden bg-[var(--surface)] p-6 sm:flex-none sm:rounded-2xl sm:border sm:border-[var(--ink)]/8 sm:max-h-[90vh] sm:max-w-2xl w-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-medium text-[var(--ink)]">Enroll in Cadence</h3>
            <p className="text-xs text-[var(--ink-3)] mt-0.5">{school.school_name} — choose your opening email</p>
          </div>
          <button onClick={onClose} className="text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 overflow-y-auto flex-1 min-h-0">
          {OPENING_TEMPLATE_KEYS.map((key) => {
            const tpl = OPENING_TEMPLATES[key]
            const isSelected = selected === key
            return (
              <button
                key={key}
                onClick={() => setSelected(key)}
                className={[
                  'text-left p-4 rounded-xl border-2 transition-colors',
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent-light)]'
                    : 'border-[var(--ink)]/10 bg-[var(--canvas)] hover:border-[var(--ink)]/20',
                ].join(' ')}
              >
                <p className="text-sm font-medium text-[var(--ink)]">{OPENING_TEMPLATE_LABELS[key]}</p>
                <p className="text-xs text-[var(--ink-3)] mt-0.5 mb-2">{tpl.description}</p>
                <p className="text-xs text-[var(--ink-2)] line-clamp-2 leading-relaxed">{tpl.body.split('\n').filter(Boolean)[0]}</p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setPreview(preview === key ? null : key) }}
                  className="mt-2 text-xs text-[var(--accent-text)] hover:underline"
                >
                  {preview === key ? 'Hide preview' : 'Preview'}
                </button>
                {preview === key && (
                  <div className="mt-2 p-3 bg-[var(--surface)] rounded-lg max-h-48 overflow-y-auto border border-[var(--ink)]/8">
                    <HighlightedBody text={tpl.body} />
                  </div>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-[var(--ink)]/8 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
            Cancel
          </button>
          <button
            onClick={() => selected && onEnroll(selected)}
            disabled={!selected || isPending}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--ink)] text-sm font-medium hover:bg-[var(--accent-text)] hover:text-[var(--canvas)] disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Starting…' : 'Start Cadence'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TemplateViewerModal({
  school,
  enrollment,
  settings,
  contacts,
  onClose,
}: {
  school: SchoolOutreach
  enrollment: CadenceEnrollment
  settings: UserSettings | null
  contacts: SchoolContact[]
  onClose: () => void
}) {
  const rawContent = getNextEmailContent(enrollment)
  // Who can actually receive this, primary first. The server re-derives the
  // address from the id it is given, so this list is convenience, not trust.
  const recipients = emailableContacts(contacts)
  const [recipientId, setRecipientId] = useState<string>(
    () => primaryContact(recipients)?.id ?? recipients[0]?.id ?? '',
  )
  const recipient = recipients.find(c => c.id === recipientId) ?? null

  const capitalize = (s: string) =>
    s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

  const fills: Record<string, string> = {
    Name: recipient?.name || school.contact_name || '$Name',
    MyName: settings?.display_name ? capitalize(settings.display_name) : '',
    StudioName: settings?.studio_name ? capitalize(settings.studio_name) : '',
    Location: settings?.location ?? '',
    phonenumber: settings?.phone ?? '',
  }

  const resolved = rawContent ? {
    ...rawContent,
    subject: applyAutoFills(rawContent.subject, fills),
    body: applyAutoFills(rawContent.body, fills),
  } : null

  const [subject, setSubject] = useState(resolved?.subject ?? '')
  const [body, setBody] = useState(resolved?.body ?? '')
  const [copiedSubject, setCopiedSubject] = useState(false)
  const [copiedBody, setCopiedBody] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  if (!resolved) return null

  const unfilledVars = [...new Set([
    ...(subject.match(/\$[A-Za-z]+/g) ?? []),
    ...(body.match(/\$[A-Za-z]+/g) ?? []),
  ])]
  const hasUnfilled = unfilledVars.length > 0

  function copySubject() {
    navigator.clipboard.writeText(subject)
    setCopiedSubject(true)
    setTimeout(() => setCopiedSubject(false), 2000)
  }

  function copyBody() {
    navigator.clipboard.writeText(body)
    setCopiedBody(true)
    setTimeout(() => setCopiedBody(false), 2000)
  }

  async function handleSend() {
    if (!recipient) {
      setSendError('No contact with an email address on this school yet. Add one first.')
      return
    }
    setSending(true)
    setSendError(null)
    // Only the contact's id crosses the wire; the server looks the address up.
    const result = await sendCadenceEmail({
      enrollmentId: enrollment.id,
      schoolId: school.id,
      contactId: recipient.id,
      subject,
      body,
    })
    if (result.error) {
      setSendError(result.error)
      setSending(false)
      return
    }
    await markEmailSent(enrollment.id, resolved!.emailNumber)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:bg-black/50 sm:px-4">
      <div className="flex-1 flex flex-col overflow-hidden bg-[var(--surface)] p-6 sm:flex-none sm:rounded-2xl sm:border sm:border-[var(--ink)]/8 sm:max-h-[90vh] sm:max-w-xl w-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-medium text-[var(--ink)]">Email {resolved.emailNumber} — {school.school_name}</h3>
            {recipients.length > 1 ? (
              <label className="flex items-center gap-1.5 text-xs text-[var(--ink-2)] mt-1">
                To:
                <select
                  value={recipientId}
                  onChange={e => setRecipientId(e.target.value)}
                  className="px-2 py-1 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-xs text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
                >
                  {recipients.map(c => (
                    <option key={c.id} value={c.id} className="bg-[var(--surface)]">
                      {c.name}{c.is_primary ? ' (primary)' : ''} — {c.email}
                      {c.subject_area ? ` · ${subjectAreaLabel(c.subject_area)}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-xs text-[var(--ink-3)] mt-0.5">
                {recipient
                  ? `To: ${recipient.name} <${recipient.email}>`
                  : 'No contact with an email address yet'}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {resolved.emailNumber > 1 && (
          <div
            className="rounded-lg text-xs leading-relaxed mb-4"
            style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626', padding: '10px 14px' }}
          >
            ⚠️ Note: This email will be sent as a new thread, not as a reply to your previous email. To send as a true reply, copy the body and reply manually from your email client.
          </div>
        )}

        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-[var(--ink-3)] uppercase tracking-wide font-medium">Subject</p>
            <button
              onClick={copySubject}
              className="text-xs font-medium px-2 py-0.5 rounded-md transition-colors"
              style={{ color: '#04ADEF', background: 'rgba(4,173,239,0.1)' }}
            >
              {copiedSubject ? 'Copied!' : 'Copy subject'}
            </button>
          </div>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
          />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-[var(--ink-3)] uppercase tracking-wide font-medium">Body</p>
            <button
              onClick={copyBody}
              className="text-xs font-medium px-2 py-0.5 rounded-md transition-colors"
              style={{ color: '#04ADEF', background: 'rgba(4,173,239,0.1)' }}
            >
              {copiedBody ? 'Copied!' : 'Copy body'}
            </button>
          </div>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            style={{ resize: 'vertical', minHeight: '200px' }}
            className="w-full px-3 py-2.5 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] leading-relaxed focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
          />
          {hasUnfilled ? (
            <p className="text-xs mt-1" style={{ color: '#b45309' }}>
              ⚠️ Unfilled variables in body/subject: {unfilledVars.join(', ')}
            </p>
          ) : (
            <p className="text-xs text-[var(--ink-3)] mt-1">Edit this template before sending</p>
          )}
        </div>

        {hasUnfilled && (
          <div
            className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs mt-3"
            style={{ background: 'rgba(180,83,9,0.1)', color: '#b45309' }}
          >
            <span className="shrink-0 mt-px">⚠️</span>
            <span>
              This email still contains unfilled variables: {unfilledVars.join(', ')}. Edit the template above before sending.
            </span>
          </div>
        )}

        {sendError && (
          <p className="text-xs mt-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(220,38,38,0.1)', color: '#b91c1c' }}>
            {sendError}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t border-[var(--ink)]/8 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
            Close
          </button>
          {settings?.gmail_send_enabled && (
            <button
              onClick={handleSend}
              disabled={sending}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--ink)] text-sm font-medium hover:bg-[var(--accent-text)] hover:text-[var(--canvas)] disabled:opacity-60 transition-colors"
            >
              {sending ? 'Sending…' : 'Send via Gmail'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Contacts, activity log and the school detail panel ───────────────────────

const FIELD =
  'w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm ' +
  'text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]'

function ContactFormModal({
  schoolId, contact, onClose,
}: {
  schoolId: string
  contact?: SchoolContact
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = contact
        ? await updateSchoolContact(contact.id, fd)
        : await createSchoolContact(schoolId, fd)
      if (result.error) setError(result.error)
      else onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col sm:items-center sm:justify-center sm:bg-black/50 sm:px-4">
      <form
        onSubmit={handleSubmit}
        className="flex-1 overflow-y-auto bg-[var(--surface)] p-6 sm:flex-none sm:rounded-2xl sm:border sm:border-[var(--ink)]/8 sm:max-h-[90vh] sm:max-w-md w-full space-y-3"
      >
        <h3 className="text-base font-medium text-[var(--ink)]">
          {contact ? 'Edit contact' : 'Add contact'}
        </h3>

        <div>
          <label className="block text-xs text-[var(--ink-3)] mb-1">Name *</label>
          <input name="name" required defaultValue={contact?.name ?? ''} placeholder="Ms. Johnson" className={FIELD} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--ink-3)] mb-1">Role / title</label>
            <input name="title" defaultValue={contact?.title ?? ''} placeholder="Band Director" className={FIELD} />
          </div>
          <div>
            <label className="block text-xs text-[var(--ink-3)] mb-1">Subject area</label>
            <select name="subject_area" defaultValue={contact?.subject_area ?? ''} className={FIELD}>
              <option value="" className="bg-[var(--surface)]">— None —</option>
              {SCHOOL_SUBJECT_AREAS.map(({ value, label }) => (
                <option key={value} value={value} className="bg-[var(--surface)]">{label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs text-[var(--ink-3)] mb-1">Email</label>
          <input name="email" type="email" defaultValue={contact?.email ?? ''} placeholder="jjohnson@school.edu" className={FIELD} />
        </div>
        <div>
          <label className="block text-xs text-[var(--ink-3)] mb-1">Phone</label>
          <input name="phone" type="tel" defaultValue={contact?.phone ?? ''} placeholder="(555) 000-0000" className={FIELD} />
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
          <input type="checkbox" name="is_primary" defaultChecked={contact?.is_primary ?? false} className="rounded" />
          Primary contact — receives outreach and cadence emails
        </label>

        {error && <p className="text-xs text-[var(--red)] bg-[var(--red-l)] px-3 py-2 rounded-lg">{error}</p>}
        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ink)]/8">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-[var(--ink-3)] hover:text-[var(--ink)]">Cancel</button>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--accent-text)' }}
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}

function LogActivityModal({
  school, contacts, onClose,
}: {
  school: SchoolOutreach
  contacts: SchoolContact[]
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await logSchoolActivity(school.id, fd)
      if (result.error) setError(result.error)
      else onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col sm:items-center sm:justify-center sm:bg-black/50 sm:px-4">
      <form
        onSubmit={handleSubmit}
        className="flex-1 overflow-y-auto bg-[var(--surface)] p-6 sm:flex-none sm:rounded-2xl sm:border sm:border-[var(--ink)]/8 sm:max-h-[90vh] sm:max-w-md w-full space-y-3"
      >
        <h3 className="text-base font-medium text-[var(--ink)]">Log activity</h3>
        <p className="text-xs text-[var(--ink-3)] -mt-2">{school.school_name}</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--ink-3)] mb-1">Type</label>
            <select name="activity_type" defaultValue="call" className={FIELD}>
              {SCHOOL_LOGGABLE_TYPES.map(({ value, label }) => (
                <option key={value} value={value} className="bg-[var(--surface)]">{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--ink-3)] mb-1">Date</label>
            <input name="occurred_on" type="date" defaultValue={today} className={FIELD} />
          </div>
        </div>

        <div>
          <label className="block text-xs text-[var(--ink-3)] mb-1">Contact (optional)</label>
          <select name="contact_id" defaultValue="" className={FIELD}>
            <option value="" className="bg-[var(--surface)]">— Not a specific person —</option>
            {contacts.map(c => (
              <option key={c.id} value={c.id} className="bg-[var(--surface)]">
                {c.name}{c.subject_area ? ` · ${subjectAreaLabel(c.subject_area)}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-[var(--ink-3)] mb-1">Notes</label>
          <textarea name="notes" rows={4} placeholder="What was discussed, what happens next…" className={FIELD + ' resize-y'} />
        </div>

        {error && <p className="text-xs text-[var(--red)] bg-[var(--red-l)] px-3 py-2 rounded-lg">{error}</p>}
        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ink)]/8">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-[var(--ink-3)] hover:text-[var(--ink)]">Cancel</button>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--accent-text)' }}
          >
            {isPending ? 'Saving…' : 'Log it'}
          </button>
        </div>
      </form>
    </div>
  )
}

/** Contacts + outreach history for one school. */
function SchoolDetailModal({
  school, contacts, activity, viewOnly, onClose, onToast,
}: {
  school: SchoolOutreach
  contacts: SchoolContact[]
  activity: SchoolOutreachActivity[]
  viewOnly: boolean
  onClose: () => void
  onToast: (message: string, kind?: 'success' | 'error') => void
}) {
  const [, startTransition] = useTransition()
  const [addContact, setAddContact] = useState(false)
  const [editContact, setEditContact] = useState<SchoolContact | null>(null)
  const [logging, setLogging] = useState(false)

  const contactName = (id: string | null) =>
    id ? (contacts.find(c => c.id === id)?.name ?? 'a contact since removed') : null

  function run(action: () => Promise<{ error: string | null }>, ok: string) {
    startTransition(async () => {
      const result = await action()
      onToast(result.error ?? ok, result.error ? 'error' : 'success')
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:bg-black/50 sm:px-4">
      <div className="flex-1 overflow-y-auto bg-[var(--surface)] p-6 sm:flex-none sm:rounded-2xl sm:border sm:border-[var(--ink)]/8 sm:max-h-[90vh] sm:max-w-2xl w-full space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-medium text-[var(--ink)]">{school.school_name}</h3>
            {school.website && (
              <a
                href={school.website}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[var(--accent-text)] hover:underline break-words"
              >
                {websiteDisplay(school.website)} ↗
              </a>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="text-[var(--ink-3)] hover:text-[var(--ink)]">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Contacts */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs uppercase tracking-wide text-[var(--ink-2)]">Contacts</h4>
            {!viewOnly && (
              <button onClick={() => setAddContact(true)} className="text-xs text-[var(--accent-text)] hover:underline">
                + Add contact
              </button>
            )}
          </div>
          {contacts.length === 0 ? (
            <p className="text-xs text-[var(--ink-3)]">No contacts yet.</p>
          ) : (
            <div className="space-y-1.5">
              {contacts.map(c => (
                <div key={c.id} className="rounded-lg border border-[var(--ink)]/8 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-[var(--ink)]">
                        {c.name}
                        {c.is_primary && (
                          <span
                            className="ml-2 px-1.5 py-0.5 rounded-full text-[11px]"
                            style={{ background: 'var(--green-l)', color: 'var(--green)' }}
                          >
                            Primary
                          </span>
                        )}
                        {c.subject_area && (
                          <span
                            className="ml-1.5 px-1.5 py-0.5 rounded-full text-[11px]"
                            style={{ background: 'var(--accent-light)', color: 'var(--accent-text)' }}
                          >
                            {subjectAreaLabel(c.subject_area)}
                          </span>
                        )}
                      </p>
                      {c.title && <p className="text-xs text-[var(--ink-3)]">{c.title}</p>}
                      <p className="text-xs text-[var(--ink-2)] break-words">
                        {c.email ?? '—'}{c.phone ? ` · ${c.phone}` : ''}
                      </p>
                    </div>
                    {!viewOnly && (
                      <div className="flex items-center gap-2 shrink-0">
                        {!c.is_primary && (
                          <button
                            onClick={() => run(() => setPrimarySchoolContact(c.id), 'Primary contact updated')}
                            className="text-xs text-[var(--ink-3)] hover:text-[var(--ink)] hover:underline"
                          >
                            Make primary
                          </button>
                        )}
                        <button onClick={() => setEditContact(c)} className="text-xs text-[var(--accent-text)] hover:underline">Edit</button>
                        <button
                          onClick={() => {
                            if (confirm(`Remove ${c.name} from this school?`)) {
                              run(() => deleteSchoolContact(c.id), 'Contact removed')
                            }
                          }}
                          className="text-xs text-[var(--ink-3)] hover:text-[var(--red)]"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Outreach history */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs uppercase tracking-wide text-[var(--ink-2)]">Outreach history</h4>
            {!viewOnly && (
              <button onClick={() => setLogging(true)} className="text-xs text-[var(--accent-text)] hover:underline">
                + Log activity
              </button>
            )}
          </div>
          {activity.length === 0 ? (
            <p className="text-xs text-[var(--ink-3)]">
              Nothing yet. Emails sent from here, and calls or visits you log, will appear in this timeline.
            </p>
          ) : (
            <ol className="space-y-2">
              {activity.map(a => (
                <li key={a.id} className="rounded-lg border border-[var(--ink)]/8 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-[var(--ink-2)]">
                        <span className="font-medium text-[var(--ink)]">{activityLabel(a.activity_type)}</span>
                        {' · '}{formatDate(a.occurred_at.slice(0, 10))}
                        {contactName(a.contact_id) ? ` · ${contactName(a.contact_id)}` : ''}
                      </p>
                      {a.subject && <p className="text-sm text-[var(--ink)] mt-0.5 break-words">{a.subject}</p>}
                      {a.notes && <p className="text-xs text-[var(--ink-2)] mt-0.5 whitespace-pre-wrap">{a.notes}</p>}
                      {a.email_to && <p className="text-[11px] text-[var(--ink-3)] mt-0.5 break-words">to {a.email_to}</p>}
                    </div>
                    {!viewOnly && a.activity_type !== 'email' && (
                      <button
                        onClick={() => {
                          if (confirm('Delete this history entry?')) {
                            run(() => deleteSchoolActivity(a.id), 'Entry deleted')
                          }
                        }}
                        className="text-xs text-[var(--ink-3)] hover:text-[var(--red)] shrink-0"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {viewOnly && (
          <p className="text-xs text-[var(--ink-3)] border-t border-[var(--ink)]/8 pt-3">
            View only — you can read this studio&apos;s outreach but not change it.
          </p>
        )}
      </div>

      {addContact && <ContactFormModal schoolId={school.id} onClose={() => setAddContact(false)} />}
      {editContact && (
        <ContactFormModal schoolId={school.id} contact={editContact} onClose={() => setEditContact(null)} />
      )}
      {logging && (
        <LogActivityModal school={school} contacts={contacts} onClose={() => setLogging(false)} />
      )}
    </div>
  )
}

export default function SchoolOutreachClient({
  schools, enrollments, contacts, activity, settings, viewOnly,
}: Props) {
  const [filterStage, setFilterStage] = useState<SchoolOutreachStage | 'all'>('all')
  const [filterSubject, setFilterSubject] = useState<SchoolSubjectArea | 'all'>('all')
  const [detailSchool, setDetailSchool] = useState<SchoolOutreach | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editSchool, setEditSchool] = useState<SchoolOutreach | null>(null)
  const [enrollModal, setEnrollModal] = useState<SchoolOutreach | null>(null)
  const [templateViewer, setTemplateViewer] = useState<{ school: SchoolOutreach; enrollment: CadenceEnrollment } | null>(null)
  const [showPhoneScript, setShowPhoneScript] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [deleteTarget, setDeleteTarget] = useState<SchoolOutreach | null>(null)
  const [isDeleting, startDelete] = useTransition()
  const { toast, showToast } = useToast()

  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  // Check Gmail replies on mount if any tracked threads exist
  useEffect(() => {
    const hasTracked = enrollments.some(e => e.status === 'active' && e.gmail_thread_id)
    if (hasTracked) {
      checkGmailReplies().catch(() => null)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function getEnrollment(schoolId: string): CadenceEnrollment | null {
    return enrollments.find(e => e.school_id === schoolId) ?? null
  }

  // Grouped once per render rather than filtering the full arrays per card: a
  // studio can have hundreds of schools and thousands of history rows.
  const contactsBySchool = new Map<string, SchoolContact[]>()
  for (const c of contacts) {
    const list = contactsBySchool.get(c.school_id)
    if (list) list.push(c)
    else contactsBySchool.set(c.school_id, [c])
  }
  const activityBySchool = new Map<string, SchoolOutreachActivity[]>()
  for (const a of activity) {
    const list = activityBySchool.get(a.school_id)
    if (list) list.push(a)
    else activityBySchool.set(a.school_id, [a])
  }
  const contactsFor = (schoolId: string) => contactsBySchool.get(schoolId) ?? []
  const activityFor = (schoolId: string) => sortActivity(activityBySchool.get(schoolId) ?? [])

  // What a delete would cascade away — cadence_enrollments is ON DELETE CASCADE,
  // so name the email history explicitly before confirming.
  function deleteConsequences(school: SchoolOutreach): string[] {
    const related = enrollments.filter(e => e.school_id === school.id)
    if (related.length === 0) return []

    const sentCount = related.reduce((n, e) => {
      return n +
        (e.email_1_sent_at ? 1 : 0) +
        (e.email_2_sent_at ? 1 : 0) +
        (e.email_3_sent_at ? 1 : 0) +
        (e.email_4_sent_at ? 1 : 0)
    }, 0)

    const out = [
      `${related.length} email cadence${related.length === 1 ? '' : 's'}` +
      (sentCount > 0 ? ` — including the record of ${sentCount} email${sentCount === 1 ? '' : 's'} already sent` : ''),
    ]

    if (related.some(e => e.status === 'replied')) {
      out.push('A "replied" status — re-adding this school later would allow re-emailing this contact')
    }
    return out
  }

  function handleDeleteSchool() {
    if (!deleteTarget) return
    const name = deleteTarget.school_name
    startDelete(async () => {
      const result = await deleteSchoolOutreach(deleteTarget.id)
      if (result.error) {
        showToast(result.error, 'error')
      } else {
        showToast(`“${name}” deleted`, 'success')
        setDeleteTarget(null)
        // Any modal may be open on the row we just removed
        setEditSchool(null)
        setEnrollModal(null)
        setTemplateViewer(null)
      }
    })
  }

  function handleEnroll(school: SchoolOutreach, template: OpeningTemplateKey) {
    startTransition(async () => {
      await enrollInCadence(school.id, template)
      setEnrollModal(null)
    })
  }

  function handleMarkSent(enrollment: CadenceEnrollment) {
    const nextNum = getNextEmailNumber(enrollment)
    if (!nextNum) return
    if (!confirm(`Mark Email ${nextNum} as sent?`)) return
    startTransition(async () => {
      await markEmailSent(enrollment.id, nextNum)
    })
  }

  function handleRemove(enrollment: CadenceEnrollment) {
    if (!confirm('Remove this school from the cadence?')) return
    startTransition(async () => {
      await removeFromCadence(enrollment.id, 'manual')
    })
  }

  const activeStages: SchoolOutreachStage[] = ['lead', 'initial_contact', 'replied', 'classroom_visit_offered', 'visit_scheduled']
  const totalSchools = schools.length
  const activeOutreach = schools.filter((s) => activeStages.includes(s.stage)).length
  const visitsCompleted = schools.filter((s) => s.stage === 'visit_completed').length
  const bySubject = (school: SchoolOutreach) =>
    filterSubject === 'all' || contactsFor(school.id).some(c => c.subject_area === filterSubject)
  const filtered = schools
    .filter(s => filterStage === 'all' || s.stage === filterStage)
    .filter(bySubject)

  return (
    <div className="space-y-5">
      {/* Fall outreach timing banner */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-[var(--accent-light)] border border-[var(--accent)]/20 text-sm text-[var(--ink-2)]">
        <span className="text-base leading-none mt-0.5" aria-hidden>📅</span>
        <p>
          <strong className="text-[var(--ink)]">Fall Outreach Timing:</strong>{' '}
          Send initial email 3 weeks before school starts. Pause the week before + first 2 weeks of school. Resume follow-ups in week 3, 4, and 5.{' '}
          <strong className="text-[var(--ink)]">Best send time:</strong> Tue–Thu, 10am–1pm local time.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
            School Outreach
          </h2>
          <p className="text-sm text-[var(--ink-3)] mt-0.5">Classroom visit pipeline</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href="/email-templates"
            className="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors hover:opacity-80"
            style={{ borderColor: '#04ADEF', color: '#04ADEF' }}
          >
            Browse Templates
          </a>
          <button
            onClick={() => { setEditSchool(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--ink)] text-sm font-medium hover:bg-[var(--accent-text)] hover:text-[var(--canvas)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Add school
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Schools', value: String(totalSchools) },
          { label: 'Active Outreach', value: String(activeOutreach) },
          { label: 'Visits Completed', value: String(visitsCompleted) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 px-5 py-4">
            <p className="text-xs text-[var(--ink-3)] mb-2 uppercase tracking-wide font-medium">{label}</p>
            <p className="text-3xl text-[var(--ink)] leading-none" style={{ fontFamily: 'var(--font-heading)' }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Phone script collapsible */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
        <button
          onClick={() => setShowPhoneScript(!showPhoneScript)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-sm text-[var(--ink)] hover:bg-[var(--canvas)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
              <path d="M13 9.5c0 .83-.25 1.63-.73 2.32-.47.7-1.13 1.23-1.9 1.56-.77.32-1.62.4-2.44.22-.82-.18-1.57-.6-2.15-1.18L3.58 10.2C2.99 9.62 2.57 8.87 2.4 8.05c-.18-.82-.1-1.67.22-2.44.32-.77.86-1.43 1.56-1.9C4.87 3.23 5.67 3 6.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M9 1h5v5M14 1L9.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-medium">Phone Script</span>
            <span className="text-xs text-[var(--ink-3)]">— for finding teacher contact info</span>
          </div>
          <svg
            width="14" height="14" viewBox="0 0 14 14" fill="none"
            className={`text-[var(--ink-3)] transition-transform ${showPhoneScript ? 'rotate-180' : ''}`}
            aria-hidden
          >
            <path d="M2 5l5 5 5-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {showPhoneScript && (
          <div className="px-5 pb-4 border-t border-[var(--ink)]/8">
            <p className="text-xs text-[var(--ink-3)] mt-3 mb-3">
              In the case that teacher contact information is not available publicly, a call to the school front office can be a very helpful next step.
            </p>
            <div className="space-y-3">
              <div className="bg-[var(--canvas)] rounded-lg px-4 py-3 border border-[var(--ink)]/8">
                <p className="text-xs font-medium text-[var(--ink)] mb-1">Looking for email address:</p>
                <p className="text-sm text-[var(--ink-2)] italic">
                  "Hello, I'm trying to reach the [teacher/director] with a volunteer question. Can you share their email?"
                </p>
              </div>
              <div className="bg-[var(--canvas)] rounded-lg px-4 py-3 border border-[var(--ink)]/8">
                <p className="text-xs font-medium text-[var(--ink)] mb-1">Looking for phone number:</p>
                <p className="text-sm text-[var(--ink-2)] italic">
                  "Hello, I'm trying to reach the [teacher/director] with a volunteer question. Is it possible to be forwarded to them?"
                </p>
              </div>
              <div className="bg-[var(--canvas)] rounded-lg px-4 py-3 border border-[var(--ink)]/8">
                <p className="text-xs font-medium text-[var(--ink)] mb-1">If they ask your purpose:</p>
                <p className="text-sm text-[var(--ink-2)] italic">
                  "My name is [name], and I am also a local private music instructor. I was trying to get in contact about volunteering in their classroom."
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stage filter tabs */}
      <FilterTabs
        tabs={[
          { value: 'all' as const, label: 'All', count: schools.length },
          ...SCHOOL_STAGES.map(({ value, label }) => ({
            value,
            label,
            count: schools.filter((s) => s.stage === value).length,
          })),
        ]}
        active={filterStage}
        onChange={setFilterStage}
      />

      {/* Subject-area filter — a school matches when any of its contacts does. */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-[var(--ink-2)]">Subject area:</span>
        <select
          value={filterSubject}
          onChange={e => setFilterSubject(e.target.value as SchoolSubjectArea | 'all')}
          className="px-2.5 py-1.5 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-xs text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
        >
          <option value="all" className="bg-[var(--surface)]">All</option>
          {SCHOOL_SUBJECT_AREAS.map(({ value, label }) => {
            const n = schools.filter(s => contactsFor(s.id).some(c => c.subject_area === value)).length
            return (
              <option key={value} value={value} className="bg-[var(--surface)]">
                {label} ({n})
              </option>
            )
          })}
        </select>
        {filterSubject !== 'all' && (
          <button onClick={() => setFilterSubject('all')} className="text-xs text-[var(--accent-text)] hover:underline">
            Clear
          </button>
        )}
      </div>

      {detailSchool && (
        <SchoolDetailModal
          school={detailSchool}
          contacts={contactsFor(detailSchool.id)}
          activity={activityFor(detailSchool.id)}
          viewOnly={viewOnly}
          onClose={() => setDetailSchool(null)}
          onToast={showToast}
        />
      )}

      {/* Modals */}
      {(showForm || editSchool) && (
        <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:bg-black/50 sm:px-4">
          <div className="flex-1 overflow-y-auto bg-[var(--surface)] p-6 sm:flex-none sm:rounded-2xl sm:border sm:border-[var(--ink)]/8 sm:max-h-[90vh] sm:overflow-y-auto sm:max-w-lg w-full">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-medium text-[var(--ink)]">
                {editSchool ? 'Edit school' : 'Add school'}
              </h3>
              <button
                onClick={() => { setShowForm(false); setEditSchool(null) }}
                className="text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <SchoolForm
              school={editSchool ?? undefined}
              onClose={() => { setShowForm(false); setEditSchool(null) }}
            />
          </div>
        </div>
      )}

      {enrollModal && (
        <EnrollModal
          school={enrollModal}
          onClose={() => setEnrollModal(null)}
          onEnroll={(template) => handleEnroll(enrollModal, template)}
          isPending={isPending}
        />
      )}

      {templateViewer && (
        <TemplateViewerModal
          school={templateViewer.school}
          enrollment={templateViewer.enrollment}
          settings={settings}
          contacts={contactsFor(templateViewer.school.id)}
          onClose={() => setTemplateViewer(null)}
        />
      )}

      {/* School list */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-sm text-[var(--ink-3)]">No schools yet. Add your first school outreach record.</p>
          </div>
        ) : (
          <>
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-[var(--ink)]/6">
              {filtered.map((school) => {
                const enrollment = getEnrollment(school.id)
                const badge = getCadenceBadge(enrollment, todayStr)
                const nextNum = enrollment ? getNextEmailNumber(enrollment) : null
                const canEnroll = !enrollment || enrollment.status === 'removed' || enrollment.status === 'replied' || enrollment.status === 'completed'
                return (
                  <div key={school.id} className="px-4 py-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--ink)] truncate">{school.school_name}</p>
                        {(() => {
                          const cs = contactsFor(school.id)
                          const p = primaryContact(cs)
                          return (
                            <>
                              <p className="text-xs text-[var(--ink-3)] mt-0.5 truncate">
                                {p?.name ?? school.contact_name ?? '—'}
                                {(p?.email ?? school.email) ? ` · ${p?.email ?? school.email}` : ''}
                                {cs.length > 1 ? ` · +${cs.length - 1} more` : ''}
                              </p>
                              {p?.subject_area && (
                                <span
                                  className="inline-block mt-1 px-1.5 py-0.5 rounded-full text-[11px]"
                                  style={{ background: 'var(--accent-light)', color: 'var(--accent-text)' }}
                                >
                                  {subjectAreaLabel(p.subject_area)}
                                </span>
                              )}
                            </>
                          )
                        })()}
                        {school.website && (
                          <a
                            href={school.website}
                            target="_blank"
                            rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="block text-xs text-[var(--accent-text)] hover:underline truncate"
                          >
                            {websiteDisplay(school.website)} ↗
                          </a>
                        )}
                        {school.next_step_option && (
                          <p className="text-xs text-[var(--ink-2)] mt-0.5 truncate">
                            Next: {nextStepLabel(school.next_step_option)}
                            {school.next_step_option === 'other' && school.next_step ? ` — ${school.next_step}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => setEditSchool(school)}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: '#04ADEF' }}
                          title="Edit"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                            <path d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeleteTarget(school)}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: 'var(--red)' }}
                          title="Delete school"
                          aria-label={`Delete ${school.school_name}`}
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                            <path d="M3 4h8M5.5 4V2.5h3V4M4 4l.5 7h5l.5-7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <StageBadge stage={school.stage} />
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: badge.bg, color: badge.text }}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <button
                      onClick={() => setDetailSchool(school)}
                      className="text-xs text-[var(--accent-text)] hover:underline min-h-[40px]"
                    >
                      Contacts &amp; history ({contactsFor(school.id).length} · {activityFor(school.id).length})
                    </button>
                    {(canEnroll || (enrollment && enrollment.status === 'active' && nextNum)) && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {canEnroll && (
                          <button
                            onClick={() => setEnrollModal(school)}
                            disabled={isPending}
                            className="text-xs text-[var(--accent-text)] hover:underline disabled:opacity-50 min-h-[40px] px-2"
                          >
                            {enrollment ? 'Re-enroll' : 'Enroll'}
                          </button>
                        )}
                        {enrollment && enrollment.status === 'active' && nextNum && (
                          <>
                            <button
                              onClick={() => setTemplateViewer({ school, enrollment })}
                              className="text-xs text-[var(--ink-3)] hover:text-[var(--ink)] hover:underline min-h-[40px] px-2"
                            >
                              View #{nextNum}
                            </button>
                            <button
                              onClick={() => handleMarkSent(enrollment)}
                              disabled={isPending}
                              className="text-xs text-[var(--green)] hover:underline disabled:opacity-50 min-h-[40px] px-2"
                            >
                              Mark sent
                            </button>
                            <button
                              onClick={() => handleRemove(enrollment)}
                              disabled={isPending}
                              className="text-xs text-[var(--ink-3)] hover:text-[var(--red)] disabled:opacity-50 min-h-[40px] px-2"
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b border-[var(--ink)]/8">
                    {['School', 'Contact', 'Phone', 'Stage', 'Cadence', 'History', ''].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ink)]/6">
                  {filtered.map((school) => {
                    const enrollment = getEnrollment(school.id)
                    const badge = getCadenceBadge(enrollment, todayStr)
                    const nextNum = enrollment ? getNextEmailNumber(enrollment) : null
                    const canEnroll = !enrollment || enrollment.status === 'removed' || enrollment.status === 'replied' || enrollment.status === 'completed'

                    return (
                      <tr key={school.id} className="hover:bg-[var(--canvas)] transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-[var(--ink)] truncate max-w-[180px]">{school.school_name}</p>
                          {school.website && (
                            <a
                              href={school.website}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-[var(--accent-text)] hover:underline truncate block max-w-[180px]"
                            >
                              {websiteDisplay(school.website)} ↗
                            </a>
                          )}
                          {school.next_step_option && (
                            <p className="text-xs text-[var(--ink-3)] truncate max-w-[180px]">
                              Next: {nextStepLabel(school.next_step_option)}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {(() => {
                            const cs = contactsFor(school.id)
                            const pc = primaryContact(cs)
                            return (
                              <div className="space-y-0.5">
                                <p className="text-[var(--ink-2)] whitespace-nowrap">
                                  {pc?.name ?? school.contact_name ?? '—'}
                                  {cs.length > 1 && (
                                    <span className="text-xs text-[var(--ink-3)]"> +{cs.length - 1}</span>
                                  )}
                                </p>
                                <p className="text-xs text-[var(--ink-3)]">{pc?.email ?? school.email ?? ''}</p>
                                {pc?.subject_area && (
                                  <span
                                    className="inline-block px-1.5 py-0.5 rounded-full text-[11px]"
                                    style={{ background: 'var(--accent-light)', color: 'var(--accent-text)' }}
                                  >
                                    {subjectAreaLabel(pc.subject_area)}
                                  </span>
                                )}
                              </div>
                            )
                          })()}
                        </td>
                        <td className="px-4 py-3 text-[var(--ink-3)] text-xs whitespace-nowrap">
                          {primaryContact(contactsFor(school.id))?.phone ?? school.phone ?? '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <StageBadge stage={school.stage} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col gap-1.5">
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap w-fit"
                              style={{ background: badge.bg, color: badge.text }}
                            >
                              {badge.label}
                            </span>
                            <div className="flex items-center gap-1 flex-wrap">
                              {canEnroll && (
                                <button
                                  onClick={() => setEnrollModal(school)}
                                  disabled={isPending}
                                  className="text-xs text-[var(--accent-text)] hover:underline disabled:opacity-50"
                                >
                                  {enrollment ? 'Re-enroll' : 'Enroll'}
                                </button>
                              )}
                              {enrollment && enrollment.status === 'active' && nextNum && (
                                <>
                                  {!canEnroll && <span className="text-[var(--ink-3)] text-xs">·</span>}
                                  <button
                                    onClick={() => setTemplateViewer({ school, enrollment })}
                                    className="text-xs text-[var(--ink-3)] hover:text-[var(--ink)] hover:underline"
                                  >
                                    View #{nextNum}
                                  </button>
                                  <span className="text-[var(--ink-3)] text-xs">·</span>
                                  <button
                                    onClick={() => handleMarkSent(enrollment)}
                                    disabled={isPending}
                                    className="text-xs text-[var(--green)] hover:underline disabled:opacity-50"
                                  >
                                    Mark sent
                                  </button>
                                  <span className="text-[var(--ink-3)] text-xs">·</span>
                                  <button
                                    onClick={() => handleRemove(enrollment)}
                                    disabled={isPending}
                                    className="text-xs text-[var(--ink-3)] hover:text-[var(--red)] disabled:opacity-50"
                                  >
                                    Remove
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button
                            onClick={() => setDetailSchool(school)}
                            className="text-xs text-[var(--accent-text)] hover:underline"
                          >
                            {contactsFor(school.id).length} contact{contactsFor(school.id).length === 1 ? '' : 's'}
                            {' · '}{activityFor(school.id).length} entr{activityFor(school.id).length === 1 ? 'y' : 'ies'}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => setEditSchool(school)}
                              className="p-1.5 rounded-lg transition-colors"
                              style={{ color: '#04ADEF' }}
                              title="Edit"
                            >
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                                <path d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                              </svg>
                            </button>
                            <button
                              onClick={() => setDeleteTarget(school)}
                              className="p-1.5 rounded-lg transition-colors"
                              style={{ color: 'var(--red)' }}
                              title="Delete school"
                              aria-label={`Delete ${school.school_name}`}
                            >
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                                <path d="M3 4h8M5.5 4V2.5h3V4M4 4l.5 7h5l.5-7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete this school?"
          message={`“${deleteTarget.school_name}” will be permanently removed.`}
          consequences={deleteConsequences(deleteTarget)}
          confirmLabel="Delete school"
          isPending={isDeleting}
          onConfirm={handleDeleteSchool}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <Toast toast={toast} />
    </div>
  )
}
