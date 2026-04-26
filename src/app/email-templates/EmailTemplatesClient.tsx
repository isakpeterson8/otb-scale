'use client'

import { useState } from 'react'
import {
  EMAIL_TEMPLATE_LIBRARY,
  TEMPLATE_CATEGORIES,
  type TemplateDefinition,
  type TemplateCategory,
} from '@/lib/emailTemplates'
import { applyAutoFills } from '@/lib/utils'

const CATEGORY_BADGE: Record<TemplateCategory, { label: string; bg: string; color: string }> = {
  initial_outreach: { label: 'Initial Outreach', bg: 'rgba(4,173,239,0.15)',    color: '#0284a8' },
  response:         { label: 'Response',          bg: 'rgba(180,83,9,0.12)',     color: '#b45309' },
  post_visit:       { label: 'Post-Visit',        bg: 'rgba(22,163,74,0.12)',    color: '#15803d' },
  reconnecting:     { label: 'Reconnecting',      bg: 'rgba(109,40,217,0.1)',    color: '#6d28d9' },
  budget:           { label: 'Budget & Comp',     bg: 'rgba(0,0,0,0.08)',        color: '#374151' },
  last_resort:      { label: 'Last Resort',       bg: 'rgba(220,38,38,0.1)',     color: '#b91c1c' },
  summer:           { label: 'Summer',            bg: 'rgba(20,184,166,0.12)',   color: '#0f766e' },
  virtual:          { label: 'Virtual',           bg: 'rgba(99,102,241,0.12)',   color: '#4338ca' },
  scheduling:       { label: 'Scheduling',        bg: 'rgba(234,88,12,0.12)',    color: '#c2410c' },
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

function TemplateCard({ template, fills }: { template: TemplateDefinition; fills: Record<string, string> }) {
  const [expanded, setExpanded] = useState(false)
  const [copiedSubject, setCopiedSubject] = useState(false)
  const [copiedBody, setCopiedBody] = useState(false)

  const subject = applyAutoFills(template.subject, fills)
  const body = applyAutoFills(template.body, fills)
  const previewLines = body.split('\n').filter(Boolean).slice(0, 2).join(' ')

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

  return (
    <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-5 hover:bg-[var(--canvas)] transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="text-sm font-medium text-[var(--ink)]">{template.name}</h3>
              {(() => {
                const badge = CATEGORY_BADGE[template.category]
                return (
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium"
                    style={{ background: badge.bg, color: badge.color }}
                  >
                    {badge.label}
                  </span>
                )
              })()}
            </div>
            <p className="text-xs text-[var(--ink-3)] mb-1.5">{subject}</p>
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
          <div className="px-5 py-4 space-y-3">
            <div>
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
                {subject}
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
                <HighlightedBody text={body} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function EmailTemplatesClient({ fills }: { fills: Record<string, string> }) {
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'all'>('all')

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
                  {templates.map(t => <TemplateCard key={t.id} template={t} fills={fills} />)}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(t => <TemplateCard key={t.id} template={t} fills={fills} />)}
        </div>
      )}
    </div>
  )
}
