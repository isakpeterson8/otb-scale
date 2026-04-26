'use client'

import { useState, useTransition, useEffect } from 'react'
import { createSchoolOutreach, updateSchoolOutreach } from '@/app/actions/school-outreach'
import {
  enrollInCadence,
  markEmailSent,
  removeFromCadence,
  checkGmailReplies,
  sendCadenceEmail,
} from '@/app/actions/cadence'
import type { SchoolOutreach, SchoolOutreachStage, CadenceEnrollment, UserSettings } from '@/types/database'
import { SCHOOL_STAGES } from '@/types/database'
import {
  OPENING_TEMPLATES,
  FOLLOWUP_EMAILS,
  type OpeningTemplateKey,
} from '@/lib/emailTemplates'
import { applyAutoFills } from '@/lib/utils'

interface Props {
  schools: SchoolOutreach[]
  enrollments: CadenceEnrollment[]
  settings: UserSettings | null
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
  const num = e.current_email_number ?? 1
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
  const num = e.current_email_number ?? 1
  if (num >= 4) return null
  return num + 1
}

function getNextEmailContent(e: CadenceEnrollment) {
  const nextNum = getNextEmailNumber(e)
  if (!nextNum) return null
  const openingSubject = OPENING_TEMPLATES[e.opening_template]?.subject ?? 'Guest Instructor'
  if (nextNum === 2 || nextNum === 3 || nextNum === 4) {
    const tpl = FOLLOWUP_EMAILS[nextNum as 2 | 3 | 4]
    const subject = `Re: ${openingSubject}`
    return { emailNumber: nextNum, subject, body: tpl.body }
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
    <form onSubmit={handleSubmit} className="space-y-3 max-h-[72vh] overflow-y-auto pr-1">
      {textField('School Name', 'school_name', 'text', 'Lincoln Elementary', true)}
      <div className="grid grid-cols-2 gap-3">
        {textField('Contact Name', 'contact_name', 'text', 'Ms. Johnson')}
        {textField('Phone', 'phone', 'tel', '(555) 000-0000')}
      </div>
      {textField('Email', 'email', 'email', 'principal@school.edu')}
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
        {textField('Probability (%)', 'probability', 'number', '50')}
        {textField('Progress (%)', 'progress', 'number', '25')}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-2xl bg-[var(--surface)] rounded-2xl border border-[var(--ink)]/8 p-6 max-h-[90vh] flex flex-col">
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

        <div className="grid grid-cols-2 gap-3 overflow-y-auto flex-1">
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
}: {
  school: SchoolOutreach
  enrollment: CadenceEnrollment
  settings: UserSettings | null
  onClose: () => void
}) {
  const rawContent = getNextEmailContent(enrollment)
  const [copiedSubject, setCopiedSubject] = useState(false)
  const [copiedBody, setCopiedBody] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  if (!rawContent) return null

  const capitalize = (s: string) =>
    s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

  const fills: Record<string, string> = {
    Name: school.contact_name || '$Name',
    MyName: settings?.display_name ? capitalize(settings.display_name) : '',
    StudioName: settings?.studio_name ? capitalize(settings.studio_name) : '',
    Location: settings?.location ?? '',
    phonenumber: settings?.phone ?? '',
  }
  const content = {
    ...rawContent,
    subject: applyAutoFills(rawContent.subject, fills),
    body: applyAutoFills(rawContent.body, fills),
  }

  function copySubject() {
    navigator.clipboard.writeText(content.subject)
    setCopiedSubject(true)
    setTimeout(() => setCopiedSubject(false), 2000)
  }

  function copyBody() {
    navigator.clipboard.writeText(content.body)
    setCopiedBody(true)
    setTimeout(() => setCopiedBody(false), 2000)
  }

  async function handleSend() {
    if (!school.email) {
      setSendError('No email address on this school record. Add one before sending.')
      return
    }
    setSending(true)
    setSendError(null)
    const result = await sendCadenceEmail({
      enrollmentId: enrollment.id,
      toEmail: school.email,
      toName: school.contact_name,
      subject: content.subject,
      body: content.body,
    })
    if (result.error) {
      setSendError(result.error)
      setSending(false)
      return
    }
    await markEmailSent(enrollment.id, content.emailNumber)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-xl bg-[var(--surface)] rounded-2xl border border-[var(--ink)]/8 p-6 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-medium text-[var(--ink)]">Email {content.emailNumber} — {school.school_name}</h3>
            <p className="text-xs text-[var(--ink-3)] mt-0.5">
              {school.contact_name ? `To: ${school.contact_name}` : 'Fill in $variables before sending'}
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
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
          <p className="text-sm text-[var(--ink)] bg-[var(--canvas)] px-3 py-2 rounded-lg border border-[var(--ink)]/10">
            {content.subject}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
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
          <div className="bg-[var(--canvas)] rounded-lg border border-[var(--ink)]/10 px-4 py-3">
            <HighlightedBody text={content.body} />
          </div>
        </div>

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

export default function SchoolOutreachClient({ schools, enrollments, settings }: Props) {
  const [filterStage, setFilterStage] = useState<SchoolOutreachStage | 'all'>('all')
  const [showForm, setShowForm] = useState(false)
  const [editSchool, setEditSchool] = useState<SchoolOutreach | null>(null)
  const [enrollModal, setEnrollModal] = useState<SchoolOutreach | null>(null)
  const [templateViewer, setTemplateViewer] = useState<{ school: SchoolOutreach; enrollment: CadenceEnrollment } | null>(null)
  const [showPhoneScript, setShowPhoneScript] = useState(false)
  const [isPending, startTransition] = useTransition()

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
  const probValues = schools.map((s) => s.probability).filter((p): p is number => p != null)
  const avgProbability = probValues.length > 0
    ? Math.round(probValues.reduce((a, b) => a + b, 0) / probValues.length)
    : null

  const filtered = filterStage === 'all' ? schools : schools.filter((s) => s.stage === filterStage)

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

      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
            School Outreach
          </h2>
          <p className="text-sm text-[var(--ink-3)] mt-0.5">Classroom visit pipeline</p>
        </div>
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

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Schools', value: String(totalSchools) },
          { label: 'Active Outreach', value: String(activeOutreach) },
          { label: 'Visits Completed', value: String(visitsCompleted) },
          { label: 'Avg Probability', value: avgProbability != null ? `${avgProbability}%` : '—' },
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
      <div className="flex items-center gap-1 border-b border-[var(--ink)]/8 overflow-x-auto">
        <button
          onClick={() => setFilterStage('all')}
          className={[
            'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
            filterStage === 'all' ? 'text-[var(--ink)] border-[var(--accent-text)]' : 'text-[var(--ink-3)] border-transparent hover:text-[var(--ink-2)]',
          ].join(' ')}
        >
          All ({schools.length})
        </button>
        {SCHOOL_STAGES.map(({ value, label }) => {
          const count = schools.filter((s) => s.stage === value).length
          return (
            <button
              key={value}
              onClick={() => setFilterStage(value)}
              className={[
                'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
                filterStage === value ? 'text-[var(--ink)] border-[var(--accent-text)]' : 'text-[var(--ink-3)] border-transparent hover:text-[var(--ink-2)]',
              ].join(' ')}
            >
              {label} ({count})
            </button>
          )
        })}
      </div>

      {/* Modals */}
      {(showForm || editSchool) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg bg-[var(--surface)] rounded-2xl border border-[var(--ink)]/8 p-6">
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
          onClose={() => setTemplateViewer(null)}
        />
      )}

      {/* Table */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-sm text-[var(--ink-3)]">No schools yet. Add your first school outreach record.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-[var(--ink)]/8">
                  {['School', 'Contact', 'Phone', 'Stage', 'Cadence', ''].map((h) => (
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
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          <p className="text-[var(--ink-2)] whitespace-nowrap">{school.contact_name ?? '—'}</p>
                          <p className="text-xs text-[var(--ink-3)]">{school.email ?? ''}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--ink-3)] text-xs whitespace-nowrap">
                        {school.phone ?? '—'}
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
                      <td className="px-4 py-3">
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
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
