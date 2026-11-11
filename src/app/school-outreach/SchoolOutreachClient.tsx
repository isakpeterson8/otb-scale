'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import CsvImport from '@/components/csv-import/CsvImport'
import { SCHOOLS_IMPORT } from '@/lib/csv-import/configs'
import { createSchoolOutreach, updateSchoolOutreach, deleteSchoolOutreach, bulkSetSchoolStage } from '@/app/actions/school-outreach'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Toast, { useToast } from '@/components/ui/Toast'
import {
  enrollInCadence,
  bulkEnrollInCadence,
  markEmailSent,
  markEmailsSent,
  undoLastEmailSent,
  undoEmailsSent,
  removeFromCadence,
  checkGmailReplies,
  sendCadenceEmail,
  type BulkSentItem,
} from '@/app/actions/cadence'
import { SCHOOL_STAGE_RANK } from '@/lib/cadence-progress'
import type { SchoolOutreach, SchoolOutreachStage, SchoolWithContacts, CadenceEnrollment, UserSettings } from '@/types/database'
import { CONTACT_NAME_PLACEHOLDER, SCHOOL_STAGES } from '@/types/database'
import { ContactsSection, PrimaryContactSummary, RecipientPicker, contactName, primaryContact } from './SchoolContacts'
import ListViewToolbar from '@/components/ui/ListViewToolbar'
import GroupedList from '@/components/ui/GroupedList'
import SourceCombobox from '@/components/ui/SourceCombobox'
import { useListView } from '@/hooks/useListView'
import { existingSourceSpellings, sourceChipOptions, sourceGroupKey, statusChipOptions, type FacetOption, type ListFacets } from '@/lib/list-view'
import { SCHOOLS_VIEW } from '@/lib/list-view-configs'
import {
  OPENING_TEMPLATES,
  FOLLOWUP_EMAILS,
  type OpeningTemplateKey,
} from '@/lib/emailTemplates'
import { applyAutoFills } from '@/lib/utils'

interface Props {
  /** Already sorted/filtered by the server per the URL view. */
  schools: SchoolWithContacts[]
  /** Studio-wide counts per stage/source, for chips and the stats row. */
  facets: ListFacets
  enrollments: CadenceEnrollment[]
  settings: UserSettings | null
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

/** "Email N due <date>": red when overdue, amber when due today, neutral when upcoming. */
function dueBadge(label: string, dueAt: string, todayStr: string) {
  const day = dueAt.slice(0, 10)
  if (day < todayStr) return { label, bg: 'var(--red-l)', text: 'var(--red)' }
  if (day === todayStr) return { label, bg: 'rgba(180,83,9,0.1)', text: 'var(--amber)' }
  return { label, bg: 'rgba(4,173,239,0.1)', text: 'var(--accent-text)' }
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
      return dueBadge(`Email 2 due ${fmtShort(e.email_2_due_at)}`, e.email_2_due_at, todayStr)
    }
    return { label: 'Email 1 sent', bg: 'rgba(4,173,239,0.1)', text: 'var(--accent-text)' }
  }
  if (num === 2) {
    const d = e.email_3_due_at
    if (d) return dueBadge(`Email 3 due ${fmtShort(d)}`, d, todayStr)
    return { label: 'Email 2 sent', bg: 'rgba(180,83,9,0.1)', text: 'var(--amber)' }
  }
  if (num === 3) {
    const d = e.email_4_due_at
    if (d) return dueBadge(`Email 4 due ${fmtShort(d)}`, d, todayStr)
    return { label: 'Email 3 sent', bg: 'rgba(180,83,9,0.1)', text: 'var(--amber)' }
  }
  return { label: 'Completed', bg: 'rgba(22,163,74,0.1)', text: 'var(--green)' }
}

function getNextEmailNumber(e: CadenceEnrollment): number | null {
  if (e.status !== 'active') return null
  const num = e.current_email_number ?? 0
  if (num >= 4) return null
  return num + 1
}

/** Sent date of email `n` (1–4), or null. */
function sentAt(e: CadenceEnrollment, n: number): string | null {
  if (n < 1 || n > 4) return null
  return (e[`email_${n}_sent_at` as keyof CadenceEnrollment] as string | null) ?? null
}

/** Whether an ISO timestamp falls on today's date in the member's time zone. */
function isToday(iso: string | null): boolean {
  return !!iso && new Date(iso).toDateString() === new Date().toDateString()
}

/** The email "Undo last sent" would step back, or null when there is nothing to undo. */
function getUndoableEmailNumber(e: CadenceEnrollment): number | null {
  const n = e.current_email_number ?? 0
  if (n < 1) return null
  if (e.status === 'active' || (e.status === 'completed' && n === 4)) return n
  return null
}

const UNDO_MS = 10_000
const CHECKBOX_CLASS = 'h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent-text)]'
const stageLabel = (stage: SchoolOutreachStage) => SCHOOL_STAGES.find(s => s.value === stage)?.label ?? stage
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

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

function SchoolForm({
  school,
  sourceOptions,
  onClose,
}: {
  school?: SchoolOutreach
  /** The studio's existing sources, each once in its preferred spelling. */
  sourceOptions: FacetOption[]
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

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
        {textField('City', 'city', 'text', 'Springfield')}
        {textField('State', 'state', 'text', 'IL')}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {textField('School Type', 'school_type', 'text', 'Elementary')}
        <SourceCombobox
          name="source"
          label="Source"
          options={sourceOptions}
          defaultValue={school?.source}
          allowCreate
          placeholder="District directory"
        />
      </div>
      {/* New schools can start with one contact; existing schools manage
          contacts in the Contacts section below the form. */}
      {!school && (
        <fieldset className="space-y-3 pt-1">
          <legend className="text-xs text-[var(--ink-3)] uppercase tracking-wide font-medium mb-2">Primary contact (optional)</legend>
          <div className="grid grid-cols-2 gap-3">
            {textField('Contact Name', 'contact_name', 'text', 'Ms. Johnson')}
            {textField('Title', 'contact_title', 'text', 'Band Director')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {textField('Email', 'contact_email', 'email', 'director@school.edu')}
            {textField('Phone', 'contact_phone', 'tel', '(555) 000-0000')}
          </div>
        </fieldset>
      )}
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
        <input
          name="next_step"
          type="text"
          defaultValue={school?.next_step ?? ''}
          placeholder="Follow up with principal"
          className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
        />
      </div>
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

type PendingConfirm = {
  title: string
  message: string
  consequences?: string[]
  confirmLabel: string
  onConfirm: () => void
  secondary?: { label: string; onClick: () => void }
}

const NO_IDS: ReadonlySet<string> = new Set()

const OPENING_TEMPLATE_KEYS: OpeningTemplateKey[] = ['initial_contact', 'familiar_teacher', 'shared_student', 'virtual']
const OPENING_TEMPLATE_LABELS: Record<OpeningTemplateKey, string> = {
  initial_contact: 'Initial Contact',
  familiar_teacher: 'Familiar Teacher',
  shared_student: 'Shared Student',
  virtual: 'Virtual',
}

function EnrollModal({
  subtitle,
  onClose,
  onEnroll,
  isPending,
}: {
  subtitle: string
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
            <p className="text-xs text-[var(--ink-3)] mt-0.5">{subtitle}</p>
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
  onClose,
  onSent,
}: {
  school: SchoolWithContacts
  enrollment: CadenceEnrollment
  settings: UserSettings | null
  onClose: () => void
  /** Called after a successful Gmail send (the server has already marked it sent). */
  onSent: (r: { emailNumber: number; stageAdvanced: boolean; markError: string | null }) => void
}) {
  const rawContent = getNextEmailContent(enrollment)
  const primary = primaryContact(school)

  const capitalize = (s: string) =>
    s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

  const fills: Record<string, string> = {
    Name: primary && primary.name !== CONTACT_NAME_PLACEHOLDER ? primary.name : '$Name',
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
  // Default recipient: the primary contact, or the first contact with an email.
  const [recipientIds, setRecipientIds] = useState<string[]>(() => {
    const first = primary?.email ? primary : school.school_contacts.find(c => c.email)
    return first ? [first.id] : []
  })

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
    if (recipientIds.length === 0) {
      setSendError('Choose at least one recipient with an email address.')
      return
    }
    setSending(true)
    setSendError(null)
    const result = await sendCadenceEmail({
      enrollmentId: enrollment.id,
      contactIds: recipientIds,
      emailNumber: resolved!.emailNumber,
      subject,
      body,
    })
    if (result.error) {
      setSendError(result.error)
      setSending(false)
      return
    }
    // sendCadenceEmail records the send itself (same path as "Mark #N sent").
    onSent({
      emailNumber: resolved!.emailNumber,
      stageAdvanced: !!result.stageAdvanced,
      markError: result.markError ?? null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:bg-black/50 sm:px-4">
      <div className="flex-1 flex flex-col overflow-hidden bg-[var(--surface)] p-6 sm:flex-none sm:rounded-2xl sm:border sm:border-[var(--ink)]/8 sm:max-h-[90vh] sm:max-w-xl w-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-medium text-[var(--ink)]">Email {resolved.emailNumber} — {school.school_name}</h3>
            <p className="text-xs text-[var(--ink-3)] mt-0.5">
              {primary ? `Greeting uses ${contactName(primary)}` : 'Fill in $variables before sending'}
            </p>
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
          <RecipientPicker contacts={school.school_contacts} selected={recipientIds} onChange={setRecipientIds} />
        </div>

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

export default function SchoolOutreachClient({ schools, facets, enrollments, settings }: Props) {
  const { view, isDefault, reset } = useListView(SCHOOLS_VIEW)
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  // Stored by id and looked up in `schools`, so the edit view re-renders with
  // fresh contacts after each add/edit/delete revalidates the page.
  const [editSchoolId, setEditSchoolId] = useState<string | null>(null)
  const editSchool = editSchoolId ? schools.find(s => s.id === editSchoolId) ?? null : null
  const [enrollModal, setEnrollModal] = useState<SchoolOutreach | null>(null)
  const [bulkEnrollOpen, setBulkEnrollOpen] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)
  const [templateViewer, setTemplateViewer] = useState<{ school: SchoolWithContacts; enrollment: CadenceEnrollment } | null>(null)
  const [showPhoneScript, setShowPhoneScript] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [deleteTarget, setDeleteTarget] = useState<SchoolWithContacts | null>(null)
  const [isDeleting, startDelete] = useTransition()
  const { toast, showToast, dismissToast } = useToast()

  // Selection belongs to one list view: changing the filter, sort or search
  // clears it, and rows that drop out of the view (e.g. after a stage change
  // under a stage filter) stop counting as selected.
  const viewKey = JSON.stringify(view)
  const [selection, setSelection] = useState<{ viewKey: string; ids: Set<string> }>(() => ({ viewKey, ids: new Set() }))
  const selectedIdSet = selection.viewKey === viewKey ? selection.ids : NO_IDS
  const selectedSchools = schools.filter(s => selectedIdSet.has(s.id))
  const allSelected = schools.length > 0 && selectedSchools.length === schools.length
  const someSelected = selectedSchools.length > 0

  function setSelectedIds(ids: Set<string>) {
    setSelection({ viewKey, ids })
  }
  function toggleSelected(id: string) {
    const next = new Set(selectedSchools.map(s => s.id))
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }
  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(schools.map(s => s.id)))
  }

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

  // What a delete would cascade away — cadence_enrollments is ON DELETE CASCADE,
  // so name the email history explicitly before confirming.
  function deleteConsequences(school: SchoolWithContacts): string[] {
    const contactCount = school.school_contacts.length
    const contactLine = contactCount > 0 ? [`${contactCount} contact${contactCount === 1 ? '' : 's'}`] : []
    const related = enrollments.filter(e => e.school_id === school.id)
    if (related.length === 0) return contactLine

    const sentCount = related.reduce((n, e) => {
      return n +
        (e.email_1_sent_at ? 1 : 0) +
        (e.email_2_sent_at ? 1 : 0) +
        (e.email_3_sent_at ? 1 : 0) +
        (e.email_4_sent_at ? 1 : 0)
    }, 0)

    const out = [
      ...contactLine,
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
        setEditSchoolId(null)
        setEnrollModal(null)
        setTemplateViewer(null)
      }
    })
  }

  function handleEnroll(school: SchoolOutreach, template: OpeningTemplateKey) {
    startTransition(async () => {
      const result = await enrollInCadence(school.id, template)
      if (result.error) showToast(result.error, 'error')
      setEnrollModal(null)
    })
  }

  function handleMarkSent(school: SchoolOutreach, enrollment: CadenceEnrollment) {
    const nextNum = getNextEmailNumber(enrollment)
    if (!nextNum) return
    // Two emails to the same school on one day is almost always a misclick.
    if (nextNum > 1 && isToday(sentAt(enrollment, nextNum - 1))) {
      setPendingConfirm({
        title: `Email ${nextNum - 1} was sent today`,
        message: `Email ${nextNum - 1} to ${school.school_name} was sent today. Mark email ${nextNum} sent too?`,
        confirmLabel: `Mark #${nextNum} sent`,
        onConfirm: () => { setPendingConfirm(null); markSent(school, enrollment, nextNum) },
      })
      return
    }
    markSent(school, enrollment, nextNum)
  }

  function markSent(school: SchoolOutreach, enrollment: CadenceEnrollment, emailNumber: number) {
    startTransition(async () => {
      const result = await markEmailSent(enrollment.id, emailNumber)
      if (result.error) {
        showToast(result.error, 'error')
        return
      }
      showToast(
        `Email ${emailNumber} marked sent · ${school.school_name}${result.stageAdvanced ? ' · moved to Initial Contact' : ''}`,
        'success',
        { durationMs: UNDO_MS, action: { label: 'Undo', onClick: () => undoSent(school, enrollment.id, emailNumber) } },
      )
    })
  }

  function undoSent(school: SchoolOutreach, enrollmentId: string, emailNumber: number) {
    startTransition(async () => {
      const result = await undoLastEmailSent(enrollmentId, emailNumber)
      if (result.error) showToast(result.error, 'error')
      else showToast(`Email ${emailNumber} unmarked · ${school.school_name}${result.stageReverted ? ' · back to Lead' : ''}`)
    })
  }

  function handleUndoLast(school: SchoolOutreach, enrollment: CadenceEnrollment) {
    const n = getUndoableEmailNumber(enrollment)
    if (!n) return
    setPendingConfirm({
      title: `Undo email ${n} sent?`,
      message: `Email ${n} to ${school.school_name} will be marked not sent, and the cadence goes back to email ${n} with its due date recalculated.`,
      confirmLabel: `Undo #${n} sent`,
      onConfirm: () => { setPendingConfirm(null); undoSent(school, enrollment.id, n) },
    })
  }

  function handleTemplateSent(school: SchoolOutreach, r: { emailNumber: number; stageAdvanced: boolean; markError: string | null }) {
    setTemplateViewer(null)
    if (r.markError) showToast(`Email ${r.emailNumber} sent, but it couldn’t be marked sent: ${r.markError}`, 'error')
    else showToast(`Email ${r.emailNumber} sent · ${school.school_name}${r.stageAdvanced ? ' · moved to Initial Contact' : ''}`)
  }

  // ─── Bulk actions ──────────────────────────────────────────────────────────

  function handleBulkStage(stage: SchoolOutreachStage) {
    const targets = selectedSchools
    const label = stageLabel(stage)
    const alreadyThere = targets.filter(s => (SCHOOL_STAGE_RANK[s.stage] ?? 0) >= SCHOOL_STAGE_RANK[stage]).length
    if (alreadyThere === targets.length) {
      showToast(`All selected schools are already at or past ${label}.`, 'error')
      return
    }
    setPendingConfirm({
      title: `Move ${plural(targets.length - alreadyThere, 'school')} to ${label}?`,
      message: alreadyThere > 0
        ? `${plural(alreadyThere, 'school')} already at or past ${label} will stay where they are. Stages only move forward here; use Edit to move a school back.`
        : 'Stages only move forward here; use Edit to move a school back.',
      confirmLabel: `Move to ${label}`,
      onConfirm: () => {
        setPendingConfirm(null)
        startTransition(async () => {
          const result = await bulkSetSchoolStage(targets.map(s => s.id), stage)
          if (result.error) showToast(result.error, 'error')
          else showToast(`Moved ${plural(result.moved, 'school')} to ${label}${result.skipped ? ` · ${result.skipped} skipped` : ''}`)
        })
      },
    })
  }

  function handleBulkMarkSent() {
    const items = selectedSchools.flatMap(school => {
      const enrollment = getEnrollment(school.id)
      const emailNumber = enrollment ? getNextEmailNumber(enrollment) : null
      return enrollment && emailNumber ? [{ school, enrollment, emailNumber }] : []
    })
    const notActive = selectedSchools.length - items.length
    if (items.length === 0) {
      showToast('None of the selected schools is in an active cadence.', 'error')
      return
    }
    const sameDay = items.filter(i => i.emailNumber > 1 && isToday(sentAt(i.enrollment, i.emailNumber - 1)))
    const notSameDay = items.filter(i => !sameDay.includes(i))

    const byEmail = new Map<number, number>()
    for (const i of items) byEmail.set(i.emailNumber, (byEmail.get(i.emailNumber) ?? 0) + 1)
    const consequences = [...byEmail.entries()]
      .sort(([a], [b]) => a - b)
      .map(([n, count]) => `Email ${n} → ${plural(count, 'school')}`)
    if (notActive > 0) consequences.push(`${plural(notActive, 'school')} not in an active cadence will be skipped`)

    const run = (list: typeof items) => {
      setPendingConfirm(null)
      startTransition(async () => {
        const result = await markEmailsSent(list.map(i => ({ enrollmentId: i.enrollment.id, emailNumber: i.emailNumber })))
        if (result.error) {
          showToast(result.error, 'error')
          return
        }
        const marked: BulkSentItem[] = result.marked
        const parts = [`Next email marked sent for ${plural(marked.length, 'school')}`]
        if (result.stageAdvanced) parts.push(`${result.stageAdvanced} moved to Initial Contact`)
        if (result.failed.length) parts.push(`${result.failed.length} failed: ${result.failed[0].error}`)
        showToast(parts.join(' · '), result.failed.length && !marked.length ? 'error' : 'success', marked.length ? {
          durationMs: UNDO_MS,
          action: {
            label: 'Undo',
            onClick: () => startTransition(async () => {
              const undo = await undoEmailsSent(marked)
              if (undo.error) showToast(undo.error, 'error')
              else showToast(`Undid ${plural(undo.undone, 'email')}${undo.failed ? ` · ${undo.failed} couldn’t be undone` : ''}`, undo.failed ? 'error' : 'success')
            }),
          },
        } : {})
      })
    }

    setPendingConfirm({
      title: `Mark the next email sent for ${plural(items.length, 'school')}?`,
      message: sameDay.length > 0
        ? `${plural(sameDay.length, 'school')} already had an email marked sent today. Mark those too?`
        : 'Each school moves to its next email, and its next due date is recalculated.',
      consequences,
      confirmLabel: sameDay.length > 0 ? `Mark all ${items.length}` : `Mark ${items.length} sent`,
      secondary: sameDay.length > 0 && notSameDay.length > 0
        ? { label: `Skip those ${sameDay.length}`, onClick: () => run(notSameDay) }
        : undefined,
      onConfirm: () => run(items),
    })
  }

  const bulkEnrollable = selectedSchools.filter(s => {
    const e = getEnrollment(s.id)
    return !e || e.status !== 'active'
  })

  function handleBulkEnrollOpen() {
    if (bulkEnrollable.length === 0) {
      showToast('All selected schools are already in an active cadence.', 'error')
      return
    }
    setBulkEnrollOpen(true)
  }

  function handleBulkEnroll(template: OpeningTemplateKey) {
    const ids = bulkEnrollable.map(s => s.id)
    startTransition(async () => {
      const result = await bulkEnrollInCadence(ids, template)
      setBulkEnrollOpen(false)
      if (result.error) showToast(result.error, 'error')
      else showToast(`Enrolled ${plural(result.enrolled, 'school')}${result.skipped ? ` · ${result.skipped} skipped` : ''}`)
    })
  }

  function handleRemove(enrollment: CadenceEnrollment) {
    if (!confirm('Remove this school from the cadence?')) return
    startTransition(async () => {
      await removeFromCadence(enrollment.id, 'manual')
    })
  }

  const activeStages: SchoolOutreachStage[] = ['lead', 'initial_contact', 'replied', 'classroom_visit_offered', 'visit_scheduled']
  // Stats describe the whole pipeline, not the current filtered view.
  const totalSchools = facets.total
  const activeOutreach = activeStages.reduce((n, stage) => n + (facets.status[stage] ?? 0), 0)
  const visitsCompleted = facets.status['visit_completed'] ?? 0

  const groupOf =
    view.group === 'status' ? (s: SchoolOutreach) => s.stage
    : view.group === 'source' ? (s: SchoolOutreach) => sourceGroupKey(s.source)
    : null
  const groupOptions = view.group === 'source' ? sourceChipOptions(SCHOOLS_VIEW, facets) : statusChipOptions(SCHOOLS_VIEW)
  const groupLabel = (key: string) => groupOptions.find(o => o.value === key)?.label ?? key

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
          {/* After an import, jump to Date added, newest so the new rows are on top. */}
          <CsvImport config={SCHOOLS_IMPORT} onImported={() => { reset(); router.refresh() }} />
          <button
            onClick={() => { setEditSchoolId(null); setShowForm(true) }}
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
                  &ldquo;Hello, I&apos;m trying to reach the [teacher/director] with a volunteer question. Can you share their email?&rdquo;
                </p>
              </div>
              <div className="bg-[var(--canvas)] rounded-lg px-4 py-3 border border-[var(--ink)]/8">
                <p className="text-xs font-medium text-[var(--ink)] mb-1">Looking for phone number:</p>
                <p className="text-sm text-[var(--ink-2)] italic">
                  &ldquo;Hello, I&apos;m trying to reach the [teacher/director] with a volunteer question. Is it possible to be forwarded to them?&rdquo;
                </p>
              </div>
              <div className="bg-[var(--canvas)] rounded-lg px-4 py-3 border border-[var(--ink)]/8">
                <p className="text-xs font-medium text-[var(--ink)] mb-1">If they ask your purpose:</p>
                <p className="text-sm text-[var(--ink-2)] italic">
                  &ldquo;My name is [name], and I am also a local private music instructor. I was trying to get in contact about volunteering in their classroom.&rdquo;
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <ListViewToolbar config={SCHOOLS_VIEW} facets={facets} resultCount={schools.length} />

      {/* Modals */}
      {(showForm || editSchool) && (
        <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:bg-black/50 sm:px-4">
          <div className="flex-1 overflow-y-auto bg-[var(--surface)] p-6 sm:flex-none sm:rounded-2xl sm:border sm:border-[var(--ink)]/8 sm:max-h-[90vh] sm:overflow-y-auto sm:max-w-lg w-full">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-medium text-[var(--ink)]">
                {editSchool ? 'Edit school' : 'Add school'}
              </h3>
              <button
                onClick={() => { setShowForm(false); setEditSchoolId(null) }}
                className="text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <SchoolForm
              key={editSchool?.id ?? 'new'}
              school={editSchool ?? undefined}
              sourceOptions={existingSourceSpellings(facets)}
              onClose={() => { setShowForm(false); setEditSchoolId(null) }}
            />
            {editSchool && <ContactsSection school={editSchool} />}
          </div>
        </div>
      )}

      {enrollModal && (
        <EnrollModal
          subtitle={`${enrollModal.school_name} — choose your opening email`}
          onClose={() => setEnrollModal(null)}
          onEnroll={(template) => handleEnroll(enrollModal, template)}
          isPending={isPending}
        />
      )}

      {bulkEnrollOpen && (
        <EnrollModal
          subtitle={
            `${plural(bulkEnrollable.length, 'school')} — choose your opening email` +
            (selectedSchools.length > bulkEnrollable.length
              ? ` (${selectedSchools.length - bulkEnrollable.length} already in an active cadence will be skipped)`
              : '')
          }
          onClose={() => setBulkEnrollOpen(false)}
          onEnroll={handleBulkEnroll}
          isPending={isPending}
        />
      )}

      {templateViewer && (
        <TemplateViewerModal
          school={templateViewer.school}
          enrollment={templateViewer.enrollment}
          settings={settings}
          onClose={() => setTemplateViewer(null)}
          onSent={(r) => handleTemplateSent(templateViewer.school, r)}
        />
      )}

      {/* Selection + bulk actions */}
      {schools.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-2.5 text-sm"
          style={{
            borderColor: someSelected ? 'var(--accent-text)' : 'rgba(255,248,240,0.08)',
            background: someSelected ? 'var(--accent-light)' : 'var(--surface)',
          }}
        >
          <label className="flex min-h-[32px] cursor-pointer items-center gap-2 text-[var(--ink-2)]">
            <input
              type="checkbox"
              className={CHECKBOX_CLASS}
              checked={allSelected}
              ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
              onChange={toggleAll}
              aria-label={allSelected ? 'Clear selection' : `Select all ${schools.length} schools in this view`}
            />
            {someSelected
              ? <span className="font-medium text-[var(--ink)]">{selectedSchools.length} selected</span>
              : <span>Select all {schools.length} in this view</span>}
          </label>
          {someSelected && (
            <>
              {!allSelected && (
                <button onClick={toggleAll} className="text-xs text-[var(--accent-text)] hover:underline">
                  Select all {schools.length}
                </button>
              )}
              <span className="hidden sm:inline text-[var(--ink-3)]">|</span>
              <select
                value=""
                disabled={isPending}
                onChange={e => { if (e.target.value) handleBulkStage(e.target.value as SchoolOutreachStage) }}
                aria-label="Change stage of selected schools"
                className="rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] px-2 py-1.5 text-xs text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)] disabled:opacity-50"
              >
                <option value="">Change stage…</option>
                {SCHOOL_STAGES.map(({ value, label }) => (
                  <option key={value} value={value} className="bg-[var(--surface)]">{label}</option>
                ))}
              </select>
              <button
                onClick={handleBulkMarkSent}
                disabled={isPending}
                className="rounded-lg border border-[var(--ink)]/15 px-2.5 py-1.5 text-xs text-[var(--ink)] hover:bg-[var(--canvas)] disabled:opacity-50"
              >
                Mark next email sent
              </button>
              <button
                onClick={handleBulkEnrollOpen}
                disabled={isPending}
                className="rounded-lg border border-[var(--ink)]/15 px-2.5 py-1.5 text-xs text-[var(--ink)] hover:bg-[var(--canvas)] disabled:opacity-50"
              >
                Enroll in cadence
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="ml-auto text-xs text-[var(--ink-3)] hover:text-[var(--ink)]"
              >
                Clear
              </button>
            </>
          )}
        </div>
      )}

      {/* School list */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
        {schools.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-sm text-[var(--ink-3)]">
              {!isDefault ? 'No schools match this view.' : 'No schools yet. Add your first school outreach record.'}
            </p>
          </div>
        ) : (
          <GroupedList
            items={schools}
            groupOf={groupOf}
            labelFor={groupLabel}
            renderCards={items => (
            <div className="divide-y divide-[var(--ink)]/6">
              {items.map((school) => {
                const enrollment = getEnrollment(school.id)
                const badge = getCadenceBadge(enrollment, todayStr)
                const nextNum = enrollment ? getNextEmailNumber(enrollment) : null
                const canEnroll = !enrollment || enrollment.status === 'removed' || enrollment.status === 'replied' || enrollment.status === 'completed'
                const undoNum = enrollment ? getUndoableEmailNumber(enrollment) : null
                return (
                  <div key={school.id} className="px-4 py-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <input
                        type="checkbox"
                        className={`${CHECKBOX_CLASS} mt-1`}
                        checked={selectedIdSet.has(school.id)}
                        onChange={() => toggleSelected(school.id)}
                        aria-label={`Select ${school.school_name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-[var(--ink)] truncate">{school.school_name}</p>
                        {(school.city || school.state) && (
                          <p className="text-xs text-[var(--ink-3)]">{[school.city, school.state].filter(Boolean).join(', ')}</p>
                        )}
                        <PrimaryContactSummary school={school} layout="card" />
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => setEditSchoolId(school.id)}
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
                    {(canEnroll || undoNum || (enrollment && enrollment.status === 'active' && nextNum)) && (
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
                              onClick={() => handleMarkSent(school, enrollment)}
                              disabled={isPending}
                              className="text-xs text-[var(--green)] hover:underline disabled:opacity-50 min-h-[40px] px-2"
                            >
                              Mark #{nextNum} sent
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
                        {enrollment && undoNum && (
                          <button
                            onClick={() => handleUndoLast(school, enrollment)}
                            disabled={isPending}
                            className="text-xs text-[var(--ink-3)] hover:text-[var(--ink)] hover:underline disabled:opacity-50 min-h-[40px] px-2"
                          >
                            Undo last sent
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            )}
            table={{
              className: 'w-full text-sm min-w-[760px]',
              wrapperClassName: 'overflow-x-auto',
              columns: 7,
              head: (
                  <tr className="border-b border-[var(--ink)]/8">
                    <th className="w-10 pl-4 pr-0 py-3 text-left">
                      <input
                        type="checkbox"
                        className={CHECKBOX_CLASS}
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
                        onChange={toggleAll}
                        aria-label={allSelected ? 'Clear selection' : `Select all ${schools.length} schools in this view`}
                      />
                    </th>
                    {['School', 'Contact', 'Phone', 'Stage', 'Cadence', ''].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
              ),
              renderRows: items => (
                <>
                  {items.map((school) => {
                    const enrollment = getEnrollment(school.id)
                    const badge = getCadenceBadge(enrollment, todayStr)
                    const nextNum = enrollment ? getNextEmailNumber(enrollment) : null
                    const canEnroll = !enrollment || enrollment.status === 'removed' || enrollment.status === 'replied' || enrollment.status === 'completed'
                    const undoNum = enrollment ? getUndoableEmailNumber(enrollment) : null
                    const isSelected = selectedIdSet.has(school.id)

                    return (
                      <tr
                        key={school.id}
                        className="hover:bg-[var(--canvas)] transition-colors"
                        style={isSelected ? { background: 'var(--accent-light)' } : undefined}
                      >
                        <td className="w-10 pl-4 pr-0 py-3 align-top">
                          <input
                            type="checkbox"
                            className={`${CHECKBOX_CLASS} mt-0.5`}
                            checked={isSelected}
                            onChange={() => toggleSelected(school.id)}
                            aria-label={`Select ${school.school_name}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-[var(--ink)] truncate max-w-[180px]">{school.school_name}</p>
                          {(school.city || school.state) && (
                            <p className="text-xs text-[var(--ink-3)]">{[school.city, school.state].filter(Boolean).join(', ')}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <PrimaryContactSummary school={school} layout="cell" />
                        </td>
                        <td className="px-4 py-3 text-[var(--ink-3)] text-xs whitespace-nowrap">
                          {primaryContact(school)?.phone ?? '—'}
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
                                    onClick={() => handleMarkSent(school, enrollment)}
                                    disabled={isPending}
                                    className="text-xs text-[var(--green)] hover:underline disabled:opacity-50"
                                  >
                                    Mark #{nextNum} sent
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
                              {enrollment && undoNum && (
                                <>
                                  {(canEnroll || enrollment.status === 'active') && <span className="text-[var(--ink-3)] text-xs">·</span>}
                                  <button
                                    onClick={() => handleUndoLast(school, enrollment)}
                                    disabled={isPending}
                                    className="text-xs text-[var(--ink-3)] hover:text-[var(--ink)] hover:underline disabled:opacity-50"
                                  >
                                    Undo last sent
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => setEditSchoolId(school.id)}
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
                </>
              ),
            }}
          />
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

      {pendingConfirm && (
        <ConfirmDialog
          tone="default"
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          consequences={pendingConfirm.consequences}
          confirmLabel={pendingConfirm.confirmLabel}
          secondary={pendingConfirm.secondary}
          isPending={isPending}
          onConfirm={pendingConfirm.onConfirm}
          onCancel={() => setPendingConfirm(null)}
        />
      )}

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}
