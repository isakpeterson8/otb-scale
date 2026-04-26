'use client'

import { useState, useTransition } from 'react'
import {
  EMAIL_TEMPLATE_LIBRARY,
  TEMPLATE_CATEGORIES,
  type TemplateDefinition,
  type TemplateCategory,
} from '@/lib/emailTemplates'
import { applyAutoFills } from '@/lib/utils'
import { saveCustomTemplate } from '@/app/actions/email-templates'

const CATEGORY_BADGE: Record<TemplateCategory, { label: string; bg: string; color: string }> = {
  initial_outreach: { label: 'Initial Outreach', bg: 'rgba(4,173,239,0.15)',   color: '#0284a8' },
  response:         { label: 'Response',          bg: 'rgba(180,83,9,0.12)',    color: '#b45309' },
  post_visit:       { label: 'Post-Visit',        bg: 'rgba(22,163,74,0.12)',   color: '#15803d' },
  reconnecting:     { label: 'Reconnecting',      bg: 'rgba(109,40,217,0.1)',   color: '#6d28d9' },
  budget:           { label: 'Budget & Comp',     bg: 'rgba(71,85,105,0.12)',   color: '#475569' },
  last_resort:      { label: 'Last Resort',       bg: 'rgba(220,38,38,0.1)',    color: '#b91c1c' },
  summer:           { label: 'Summer',            bg: 'rgba(20,184,166,0.12)',  color: '#0f766e' },
  virtual:          { label: 'Virtual',           bg: 'rgba(99,102,241,0.12)',  color: '#4338ca' },
  scheduling:       { label: 'Scheduling',        bg: 'rgba(234,88,12,0.12)',   color: '#c2410c' },
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

function TemplateCard({
  template,
  fills,
  customTemplate,
  onSave,
}: {
  template: TemplateDefinition
  fills: Record<string, string>
  customTemplate: { subject: string; body: string } | null
  onSave: (key: string, subject: string, body: string) => Promise<{ error: string | null }>
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')
  const [copiedSubject, setCopiedSubject] = useState(false)
  const [copiedBody, setCopiedBody] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const effectiveSubject = customTemplate?.subject ?? template.subject
  const effectiveBody = customTemplate?.body ?? template.body
  const displaySubject = applyAutoFills(effectiveSubject, fills)
  const displayBody = applyAutoFills(effectiveBody, fills)
  const previewLines = applyAutoFills(template.body, fills).split('\n').filter(Boolean).slice(0, 2).join(' ')
  const isCustomized = customTemplate != null
  const badge = CATEGORY_BADGE[template.category]

  function startEditing() {
    setEditSubject(effectiveSubject)
    setEditBody(effectiveBody)
    setSaveError(null)
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setSaveError(null)
  }

  function handleSave() {
    setSaveError(null)
    startTransition(async () => {
      const res = await onSave(template.id, editSubject, editBody)
      if (res.error) {
        setSaveError(res.error)
      } else {
        setEditing(false)
      }
    })
  }

  function copySubject() {
    navigator.clipboard.writeText(displaySubject)
    setCopiedSubject(true)
    setTimeout(() => setCopiedSubject(false), 2000)
  }

  function copyBody() {
    navigator.clipboard.writeText(displayBody)
    setCopiedBody(true)
    setTimeout(() => setCopiedBody(false), 2000)
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]'

  return (
    <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
      {/* Collapsed header — clicking expands */}
      <button
        onClick={() => { if (!editing) setExpanded(!expanded) }}
        className="w-full text-left p-5 hover:bg-[var(--canvas)] transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="text-sm font-medium text-[var(--ink)]">{template.name}</h3>
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium"
                style={{ backgroundColor: badge.bg, color: badge.color }}
              >
                {badge.label}
              </span>
              {isCustomized && (
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium"
                  style={{ background: 'rgba(73,37,47,0.18)', color: 'var(--accent-text)' }}
                >
                  Customized
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--ink-3)] mb-1.5">{displaySubject}</p>
            <p className="text-xs text-[var(--ink-2)] line-clamp-2 leading-relaxed">{previewLines}</p>
          </div>
          <svg
            width="14" height="14" viewBox="0 0 14 14" fill="none"
            className={`text-[var(--ink-3)] shrink-0 mt-1 transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden
          >
            <path d="M2 5l5 5 5-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--ink)]/8">
          {editing ? (
            /* ── Edit mode ── */
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs text-[var(--ink-3)] uppercase tracking-wide font-medium mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={e => setEditSubject(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--ink-3)] uppercase tracking-wide font-medium mb-1">
                  Body
                </label>
                <textarea
                  value={editBody}
                  onChange={e => setEditBody(e.target.value)}
                  className={inputCls}
                  style={{ minHeight: 200, resize: 'vertical' }}
                />
              </div>

              {saveError && (
                <p className="text-xs text-[var(--red)]">{saveError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1 border-t border-[var(--ink)]/8">
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={isPending}
                  className="px-3 py-1.5 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isPending}
                  className="px-4 py-1.5 rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
                  style={{ background: '#04ADEF' }}
                >
                  {isPending ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          ) : (
            /* ── View mode ── */
            <div className="px-5 py-4 space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-[var(--ink-3)] uppercase tracking-wide font-medium">Subject</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={copySubject}
                      className="text-xs font-medium px-2 py-0.5 rounded-md transition-colors"
                      style={{ color: '#04ADEF', background: 'rgba(4,173,239,0.1)' }}
                    >
                      {copiedSubject ? 'Copied!' : 'Copy subject'}
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); startEditing() }}
                      className="text-xs font-medium px-2 py-0.5 rounded-md transition-colors"
                      style={{ color: 'var(--accent-text)', background: 'rgba(73,37,47,0.14)' }}
                    >
                      Edit
                    </button>
                  </div>
                </div>
                <p className="text-sm text-[var(--ink)] bg-[var(--canvas)] px-3 py-2 rounded-lg border border-[var(--ink)]/10">
                  {displaySubject}
                </p>
              </div>
              <div>
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
                  <HighlightedBody text={displayBody} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function EmailTemplatesClient({
  fills,
  initialCustomTemplates,
}: {
  fills: Record<string, string>
  initialCustomTemplates: Record<string, { subject: string; body: string }>
}) {
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'all'>('all')
  const [customTemplates, setCustomTemplates] = useState(initialCustomTemplates)

  async function handleSave(key: string, subject: string, body: string): Promise<{ error: string | null }> {
    const res = await saveCustomTemplate(key, subject, body)
    if (!res.error) {
      setCustomTemplates(prev => ({ ...prev, [key]: { subject, body } }))
    }
    return res
  }

  const filtered = activeCategory === 'all'
    ? EMAIL_TEMPLATE_LIBRARY
    : EMAIL_TEMPLATE_LIBRARY.filter(t => t.category === activeCategory)

  const countByCategory = (cat: TemplateCategory) =>
    EMAIL_TEMPLATE_LIBRARY.filter(t => t.category === cat).length

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
          Email Templates
        </h2>
        <p className="text-sm text-[var(--ink-3)] mt-0.5">{EMAIL_TEMPLATE_LIBRARY.length} templates across {TEMPLATE_CATEGORIES.length} categories</p>
      </div>

      {/* Category filter tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--ink)]/8 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveCategory('all')}
          className={[
            'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
            activeCategory === 'all'
              ? 'text-[var(--ink)] border-[var(--accent-text)]'
              : 'text-[var(--ink-3)] border-transparent hover:text-[var(--ink-2)]',
          ].join(' ')}
        >
          All ({EMAIL_TEMPLATE_LIBRARY.length})
        </button>
        {TEMPLATE_CATEGORIES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setActiveCategory(value)}
            className={[
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
              activeCategory === value
                ? 'text-[var(--ink)] border-[var(--accent-text)]'
                : 'text-[var(--ink-3)] border-transparent hover:text-[var(--ink-2)]',
            ].join(' ')}
          >
            {label} ({countByCategory(value)})
          </button>
        ))}
      </div>

      {/* Templates grid, grouped by category when showing all */}
      {activeCategory === 'all' ? (
        <div className="space-y-8">
          {TEMPLATE_CATEGORIES.map(({ value, label }) => {
            const templates = EMAIL_TEMPLATE_LIBRARY.filter(t => t.category === value)
            if (!templates.length) return null
            return (
              <div key={value}>
                <h3 className="text-xs text-[var(--ink-3)] uppercase tracking-wide font-medium mb-3">{label}</h3>
                <div className="space-y-2">
                  {templates.map(t => (
                    <TemplateCard
                      key={t.id}
                      template={t}
                      fills={fills}
                      customTemplate={customTemplates[t.id] ?? null}
                      onSave={handleSave}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(t => (
            <TemplateCard
              key={t.id}
              template={t}
              fills={fills}
              customTemplate={customTemplates[t.id] ?? null}
              onSave={handleSave}
            />
          ))}
        </div>
      )}
    </div>
  )
}
