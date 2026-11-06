'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  createPostTemplate,
  updatePostTemplate,
  duplicatePostTemplate,
  setPostTemplateArchived,
  type PostTemplateInput,
} from '@/app/actions/facebook-groups'
import type { PostTemplate } from '@/types/database'

// ─── Shared data helpers ──────────────────────────────────────────────────────

export interface TemplateLink { group_id: string; template_id: string }
export interface TemplateUse { group_id: string; template_id: string | null }

export interface TemplateStats { timesUsed: number; groupCount: number }

/** Times logged with each template, and how many groups use it (linked or logged). */
export function computeTemplateStats(links: TemplateLink[], uses: TemplateUse[]): Record<string, TemplateStats> {
  const groups: Record<string, Set<string>> = {}
  const times: Record<string, number> = {}
  for (const l of links) (groups[l.template_id] ??= new Set()).add(l.group_id)
  for (const u of uses) {
    if (!u.template_id) continue
    times[u.template_id] = (times[u.template_id] ?? 0) + 1
    ;(groups[u.template_id] ??= new Set()).add(u.group_id)
  }
  const out: Record<string, TemplateStats> = {}
  for (const id of new Set([...Object.keys(groups), ...Object.keys(times)])) {
    out[id] = { timesUsed: times[id] ?? 0, groupCount: groups[id]?.size ?? 0 }
  }
  return out
}

function matches(t: PostTemplate, q: string) {
  if (!q) return true
  const hay = [t.title, t.body, t.variant_label ?? '', ...(t.tags ?? [])].join(' ').toLowerCase()
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w))
}

function snippet(t: PostTemplate, n = 90) {
  const s = (t.body || t.image_url || '').replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n) + '…' : s
}

// ─── Styling (matches the existing Facebook Groups inputs and buttons) ────────

const INPUT = 'w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--surface)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]'
const SMALL_BTN = 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--ink-2)] whitespace-nowrap disabled:opacity-50 transition-colors hover:text-[var(--ink)]'
const SMALL_BTN_BG = { background: 'rgba(0,0,0,0.05)' }
// These fields can sit inside the Add/Edit group <form>: Enter in a one-line
// field must not submit the group form.
function stopEnter(e: React.KeyboardEvent, onEnter?: () => void) {
  if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
    e.preventDefault()
    onEnter?.()
  }
}

const PRIMARY_BTN = 'px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--ink)] text-xs font-medium hover:bg-[var(--accent-text)] hover:text-[var(--canvas)] disabled:opacity-50 transition-colors'

// ─── Copy to clipboard ────────────────────────────────────────────────────────

export function CopyButton({ template, compact = false }: { template: PostTemplate; compact?: boolean }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  // Copy the post text; an image-only template copies its image link.
  const text = template.body.trim() ? template.body : (template.image_url ?? '')
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('failed')
    }
    setTimeout(() => setState('idle'), 1600)
  }
  return (
    <button
      type="button"
      onClick={copy}
      disabled={!text}
      className={SMALL_BTN}
      style={state === 'copied' ? { background: 'rgba(22,163,74,0.12)', color: '#15803d' } : SMALL_BTN_BG}
      title="Copy the post text to paste into Facebook"
    >
      {state === 'copied' ? '✓ Copied' : state === 'failed' ? 'Copy failed' : compact ? 'Copy' : 'Copy to clipboard'}
    </button>
  )
}

// ─── Template form (add / edit) ───────────────────────────────────────────────

export function TemplateForm({
  template,
  usedInGroups,
  onSaved,
  onCancel,
}: {
  template?: PostTemplate
  /** Shown when editing: the template is shared, so edits apply everywhere. */
  usedInGroups?: number
  onSaved: (id: string) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(template?.title ?? '')
  const [body, setBody] = useState(template?.body ?? '')
  const [variantLabel, setVariantLabel] = useState(template?.variant_label ?? '')
  const [tags, setTags] = useState((template?.tags ?? []).join(', '))
  const [imageUrl, setImageUrl] = useState(template?.image_url ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function save() {
    setError(null)
    const input: PostTemplateInput = { title, body, variantLabel, tags, imageUrl }
    startTransition(async () => {
      const result = template ? await updatePostTemplate(template.id, input) : await createPostTemplate(input)
      if (result.error) setError(result.error)
      else onSaved(result.id ?? template?.id ?? '')
    })
  }

  return (
    <div className="space-y-2 p-3 rounded-lg border border-[var(--ink)]/8 bg-[var(--canvas)]" onKeyDown={e => stopEnter(e, save)}>
      {template && (usedInGroups ?? 0) > 1 && (
        <p className="text-xs px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(180,83,9,0.1)', color: '#b45309' }}>
          Used in {usedInGroups} groups. Changes apply everywhere this template is used.
        </p>
      )}
      <input aria-label="Title" placeholder="Title (e.g. Fall enrollment promo)" value={title} onChange={e => setTitle(e.target.value)} className={INPUT} />
      <textarea aria-label="Post copy" placeholder="Post copy…" value={body} onChange={e => setBody(e.target.value)} rows={4} className={`${INPUT} resize-y`} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input aria-label="Variant label" placeholder="Variant label (optional, e.g. Short)" value={variantLabel} onChange={e => setVariantLabel(e.target.value)} className={INPUT} />
        <input aria-label="Tags" placeholder="Tags, comma separated (optional)" value={tags} onChange={e => setTags(e.target.value)} className={INPUT} />
      </div>
      <input aria-label="Image URL" type="url" placeholder="Image URL (optional)" value={imageUrl} onChange={e => setImageUrl(e.target.value)} className={INPUT} />
      {error && <p className="text-xs text-[var(--red)]">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={isPending} className={PRIMARY_BTN}>
          {isPending ? 'Saving…' : template ? 'Save template' : 'Create template'}
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Template card body (shared by library and group card) ────────────────────

function TemplateSummary({ template, full = false }: { template: PostTemplate; full?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-sm font-medium text-[var(--ink)]">{template.title}</p>
        {template.variant_label && (
          <span className="px-1.5 py-0.5 rounded text-[11px] font-medium" style={{ background: 'rgba(4,173,239,0.12)', color: '#0284a8' }}>
            {template.variant_label}
          </span>
        )}
        {template.archived && (
          <span className="px-1.5 py-0.5 rounded text-[11px] font-medium" style={{ background: 'rgba(0,0,0,0.07)', color: 'var(--ink-3)' }}>Archived</span>
        )}
        {(template.tags ?? []).map(t => (
          <span key={t} className="px-1.5 py-0.5 rounded text-[11px] text-[var(--ink-3)] border border-[var(--ink)]/10">#{t}</span>
        ))}
      </div>
      {template.body && (
        <p className={`text-xs text-[var(--ink-3)] mt-1 whitespace-pre-line break-words ${full ? 'line-clamp-4' : 'line-clamp-2'}`}>{template.body}</p>
      )}
      {template.image_url && (
        <a href={template.image_url} target="_blank" rel="noopener noreferrer" className="inline-block mt-1 text-xs text-[var(--accent-text)] hover:underline truncate max-w-full">
          🖼 Image
        </a>
      )}
    </div>
  )
}

// ─── Library panel (top of the page) ──────────────────────────────────────────

export function TemplateLibrary({
  templates,
  stats,
}: {
  templates: PostTemplate[]
  stats: Record<string, TemplateStats>
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const activeCount = templates.filter(t => !t.archived).length
  const archivedCount = templates.length - activeCount
  const visible = templates
    .filter(t => (showArchived ? t.archived : !t.archived) && matches(t, query))
    .sort((a, b) => a.title.localeCompare(b.title))

  function run(fn: () => Promise<{ error: string | null }>) {
    setError(null)
    startTransition(async () => {
      const r = await fn()
      if (r.error) setError(r.error)
    })
  }

  return (
    <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-[var(--canvas)] transition-colors"
      >
        <div>
          <h3 className="text-sm font-medium text-[var(--ink)]">Post templates ({activeCount})</h3>
          <p className="text-xs text-[var(--ink-3)] mt-0.5">Shared post copy for all your groups. Pick one when you log a post.</p>
        </div>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className={['text-[var(--ink-3)] transition-transform shrink-0', open ? 'rotate-180' : ''].join(' ')}>
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-[var(--ink)]/8 px-5 py-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="search"
              placeholder="Search templates…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className={`${INPUT} sm:flex-1`}
              aria-label="Search templates"
            />
            <div className="flex gap-2">
              {archivedCount > 0 && (
                <button type="button" onClick={() => setShowArchived(s => !s)} className={SMALL_BTN} style={SMALL_BTN_BG}>
                  {showArchived ? 'Show active' : `Archived (${archivedCount})`}
                </button>
              )}
              <button type="button" onClick={() => { setAdding(true); setEditingId(null) }} className={PRIMARY_BTN}>
                + New template
              </button>
            </div>
          </div>

          {adding && <TemplateForm onSaved={() => setAdding(false)} onCancel={() => setAdding(false)} />}
          {error && <p className="text-xs text-[var(--red)]">{error}</p>}

          {visible.length === 0 && !adding && (
            <p className="text-xs text-[var(--ink-3)] italic py-2">
              {query ? 'No templates match your search.' : showArchived ? 'No archived templates.' : 'No templates yet. Add your first post copy with “+ New template”.'}
            </p>
          )}

          <div className="space-y-2">
            {visible.map(t => {
              const s = stats[t.id] ?? { timesUsed: 0, groupCount: 0 }
              if (editingId === t.id) {
                return <TemplateForm key={t.id} template={t} usedInGroups={s.groupCount} onSaved={() => setEditingId(null)} onCancel={() => setEditingId(null)} />
              }
              return (
                <div key={t.id} className="p-3 rounded-lg border border-[var(--ink)]/8 bg-[var(--canvas)] flex flex-col md:flex-row md:items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <TemplateSummary template={t} full />
                    <p className="text-[11px] text-[var(--ink-3)] mt-1.5">
                      {s.timesUsed === 0 && s.groupCount === 0
                        ? 'Not used yet'
                        : `Used ${s.timesUsed} time${s.timesUsed === 1 ? '' : 's'} · in ${s.groupCount} group${s.groupCount === 1 ? '' : 's'}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 shrink-0">
                    <CopyButton template={t} />
                    <button type="button" onClick={() => { setEditingId(t.id); setAdding(false) }} className={SMALL_BTN} style={SMALL_BTN_BG}>Edit</button>
                    <button type="button" disabled={isPending} onClick={() => run(() => duplicatePostTemplate(t.id))} className={SMALL_BTN} style={SMALL_BTN_BG}>Duplicate</button>
                    <button type="button" disabled={isPending} onClick={() => run(() => setPostTemplateArchived(t.id, !t.archived))} className={SMALL_BTN} style={SMALL_BTN_BG}>
                      {t.archived ? 'Restore' : 'Archive'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Picker (log-post prompt and "add to group") ──────────────────────────────

export function TemplatePicker({
  templates,
  preferredIds,
  selectedId,
  onSelect,
  allowNone = true,
  excludeIds,
}: {
  templates: PostTemplate[]
  /** Templates used in this group: listed first. */
  preferredIds: Set<string>
  selectedId: string
  onSelect: (id: string) => void
  allowNone?: boolean
  excludeIds?: Set<string>
}) {
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)

  const { mine, others } = useMemo(() => {
    const pool = templates
      .filter(t => !t.archived && !excludeIds?.has(t.id) && matches(t, query))
      .sort((a, b) => a.title.localeCompare(b.title))
    return { mine: pool.filter(t => preferredIds.has(t.id)), others: pool.filter(t => !preferredIds.has(t.id)) }
  }, [templates, preferredIds, excludeIds, query])

  const item = (t: PostTemplate) => {
    const active = selectedId === t.id
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => onSelect(t.id)}
        aria-pressed={active}
        className="w-full text-left px-3 py-2 rounded-lg border transition-colors"
        style={{
          borderColor: active ? 'var(--accent-text)' : 'rgba(0,0,0,0.08)',
          background: active ? 'var(--accent-light)' : 'var(--surface)',
        }}
      >
        <span className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-[var(--ink)] truncate">{t.title}</span>
          {t.variant_label && <span className="text-[11px] text-[#0284a8] shrink-0">· {t.variant_label}</span>}
          {t.image_url && <span className="text-[11px] shrink-0" aria-label="has image">🖼</span>}
        </span>
        <span className="block text-xs text-[var(--ink-3)] truncate">{snippet(t)}</span>
      </button>
    )
  }

  const heading = (text: string) => <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-3)] pt-1">{text}</p>

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input type="search" placeholder="Search all templates…" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => stopEnter(e)} className={`${INPUT} flex-1`} aria-label="Search templates" />
        <button type="button" onClick={() => setCreating(c => !c)} className={SMALL_BTN} style={SMALL_BTN_BG}>+ New template</button>
      </div>

      {creating && (
        <TemplateForm
          onSaved={(id) => { setCreating(false); setQuery(''); if (id) onSelect(id) }}
          onCancel={() => setCreating(false)}
        />
      )}

      <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
        {allowNone && !query && (
          <button
            type="button"
            onClick={() => onSelect('')}
            aria-pressed={selectedId === ''}
            className="w-full text-left px-3 py-2 rounded-lg border text-sm text-[var(--ink-3)] transition-colors"
            style={{
              borderColor: selectedId === '' ? 'var(--accent-text)' : 'rgba(0,0,0,0.08)',
              background: selectedId === '' ? 'var(--accent-light)' : 'var(--surface)',
            }}
          >
            No template
          </button>
        )}
        {mine.length > 0 && heading('Used in this group')}
        {mine.map(item)}
        {others.length > 0 && heading(mine.length > 0 ? 'All other templates' : 'All templates')}
        {others.map(item)}
        {mine.length === 0 && others.length === 0 && (
          <p className="text-xs text-[var(--ink-3)] italic py-1">{query ? 'No templates match.' : 'No templates yet. Create one with “+ New template”.'}</p>
        )}
      </div>
    </div>
  )
}

// ─── Templates on a group card (Add / Edit group) ─────────────────────────────

export function GroupTemplatesSection({
  templates,
  linkedIds,
  stats,
  onAdd,
  onRemove,
  isPending,
}: {
  templates: PostTemplate[]
  linkedIds: string[]
  stats: Record<string, TemplateStats>
  onAdd: (templateId: string) => void
  onRemove: (templateId: string) => void
  isPending?: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [pick, setPick] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const byId = new Map(templates.map(t => [t.id, t]))
  const linked = linkedIds.map(id => byId.get(id)).filter((t): t is PostTemplate => !!t)
  const linkedSet = new Set(linkedIds)

  return (
    <div className="border-t border-[var(--ink)]/8 pt-4 mt-2">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-medium text-[var(--ink-2)] uppercase tracking-wide">Post templates</h4>
        <button type="button" onClick={() => { setAdding(a => !a); setPick('') }} className="text-xs text-[var(--accent-text)] hover:underline">
          + Add from library
        </button>
      </div>

      {adding && (
        <div className="mb-3 p-3 rounded-lg border border-[var(--ink)]/8 bg-[var(--canvas)] space-y-2">
          <TemplatePicker
            templates={templates}
            preferredIds={new Set()}
            excludeIds={linkedSet}
            selectedId={pick}
            onSelect={setPick}
            allowNone={false}
          />
          <div className="flex gap-2">
            <button type="button" disabled={!pick || isPending} onClick={() => { onAdd(pick); setPick(''); setAdding(false) }} className={PRIMARY_BTN}>
              Add to group
            </button>
            <button type="button" onClick={() => setAdding(false)} className="px-3 py-1.5 text-xs text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {linked.length === 0 && !adding && (
        <p className="text-xs text-[var(--ink-3)] italic">No templates for this group yet. Add one from the library, or pick one when you log a post.</p>
      )}

      <div className="space-y-2">
        {linked.map(t => {
          const groupCount = stats[t.id]?.groupCount ?? 0
          if (editingId === t.id) {
            return <TemplateForm key={t.id} template={t} usedInGroups={groupCount} onSaved={() => setEditingId(null)} onCancel={() => setEditingId(null)} />
          }
          return (
            <div key={t.id} className="p-2.5 rounded-lg border border-[var(--ink)]/8 bg-[var(--canvas)] space-y-2">
              <TemplateSummary template={t} />
              <div className="flex flex-wrap items-center gap-1.5">
                <CopyButton template={t} compact />
                <button type="button" onClick={() => setEditingId(t.id)} className={SMALL_BTN} style={SMALL_BTN_BG}>Edit</button>
                <button type="button" disabled={isPending} onClick={() => onRemove(t.id)} className={SMALL_BTN} style={SMALL_BTN_BG} title="Remove from this group (stays in the library)">
                  Remove
                </button>
                {groupCount > 1 && <span className="text-[11px] text-[var(--ink-3)]">Shared · used in {groupCount} groups</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
