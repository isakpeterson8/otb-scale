'use client'

import { useState } from 'react'
import type { Resource } from '@/types/database'

// ── Icon type definitions ─────────────────────────────────────────────────────

const ICON_META: Record<
  Resource['icon_type'],
  { label: string; color: string; bg: string }
> = {
  doc:    { label: 'Doc',     color: '#4285F4', bg: 'rgba(66,133,244,0.12)' },
  sheet:  { label: 'Sheet',   color: '#0F9D58', bg: 'rgba(15,157,88,0.12)'  },
  slides: { label: 'Slides',  color: '#F4B400', bg: 'rgba(244,180,0,0.14)'  },
  folder: { label: 'Folder',  color: '#4285F4', bg: 'rgba(66,133,244,0.12)' },
  form:   { label: 'Form',    color: '#7B5EA7', bg: 'rgba(123,94,167,0.12)' },
  pdf:    { label: 'PDF',     color: '#E53935', bg: 'rgba(229,57,53,0.12)'  },
  link:   { label: 'Link',    color: 'var(--ink-2)', bg: 'var(--surface-2)' },
}

function ResourceIcon({ type, size = 20 }: { type: Resource['icon_type']; size?: number }) {
  const s = size
  switch (type) {
    case 'doc':
      return (
        <svg width={s} height={s} viewBox="0 0 20 20" fill="none" aria-hidden>
          <path d="M4 2h8l4 4v12a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M12 2v4h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M6 9h8M6 12h8M6 15h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
    case 'sheet':
      return (
        <svg width={s} height={s} viewBox="0 0 20 20" fill="none" aria-hidden>
          <rect x="2" y="2" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M2 7h16M2 12h16M7 7v11M13 7v11" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      )
    case 'slides':
      return (
        <svg width={s} height={s} viewBox="0 0 20 20" fill="none" aria-hidden>
          <rect x="1" y="3" width="18" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 16v2M12 16v2M6 18h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <path d="M8.5 8.5l4 2-4 2V8.5z" fill="currentColor" opacity=".7" />
        </svg>
      )
    case 'folder':
      return (
        <svg width={s} height={s} viewBox="0 0 20 20" fill="none" aria-hidden>
          <path d="M2 5a2 2 0 012-2h3.586a1 1 0 01.707.293L9.707 4.7A1 1 0 0010.414 5H16a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      )
    case 'form':
      return (
        <svg width={s} height={s} viewBox="0 0 20 20" fill="none" aria-hidden>
          <rect x="3" y="2" width="14" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M6 7h2M6 10.5h2M6 14h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <rect x="10" y="6" width="4" height="2" rx=".5" fill="currentColor" opacity=".4" />
          <rect x="10" y="9.5" width="4" height="2" rx=".5" fill="currentColor" opacity=".4" />
          <rect x="10" y="13" width="4" height="2" rx=".5" fill="currentColor" opacity=".4" />
        </svg>
      )
    case 'pdf':
      return (
        <svg width={s} height={s} viewBox="0 0 20 20" fill="none" aria-hidden>
          <path d="M4 2h8l4 4v12a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M12 2v4h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <text x="4.5" y="15.5" style={{ fontSize: '5px', fontWeight: 700, fill: 'currentColor' }}>PDF</text>
        </svg>
      )
    default: // link
      return (
        <svg width={s} height={s} viewBox="0 0 20 20" fill="none" aria-hidden>
          <path d="M8.5 11.5a4.243 4.243 0 006 0l2-2a4.243 4.243 0 00-6-6l-1 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M11.5 8.5a4.243 4.243 0 00-6 0l-2 2a4.243 4.243 0 006 6l1-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
  }
}

// ── Resource card ─────────────────────────────────────────────────────────────

function ResourceCard({ resource }: { resource: Resource }) {
  const meta = ICON_META[resource.icon_type] ?? ICON_META.link

  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3.5 p-4 rounded-xl border border-[var(--ink)]/8 bg-[var(--surface)] hover:border-[var(--ink)]/20 hover:shadow-sm transition-all"
    >
      {/* Icon */}
      <div
        className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center mt-0.5"
        style={{ background: meta.bg, color: meta.color }}
      >
        <ResourceIcon type={resource.icon_type} size={20} />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--ink)] group-hover:text-[var(--accent-text)] transition-colors leading-snug">
          {resource.title}
        </p>
        {resource.description && (
          <p className="text-xs text-[var(--ink-3)] mt-0.5 leading-relaxed line-clamp-2">
            {resource.description}
          </p>
        )}
        <p className="text-xs text-[var(--ink-3)]/60 mt-1 truncate max-w-[260px]">
          {resource.url.replace(/^https?:\/\//, '')}
        </p>
      </div>

      {/* Arrow */}
      <div className="shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity text-[var(--accent-text)]">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </a>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ResourcesClient({ resources }: { resources: Resource[] }) {
  const [search, setSearch] = useState('')

  // Collect unique categories in position order
  const categoriesOrdered: string[] = []
  const seen = new Set<string>()
  for (const r of resources) {
    const cat = r.category ?? ''
    if (!seen.has(cat)) { seen.add(cat); categoriesOrdered.push(cat) }
  }

  const filtered = resources.filter(r => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      r.title.toLowerCase().includes(q) ||
      (r.description ?? '').toLowerCase().includes(q) ||
      (r.category ?? '').toLowerCase().includes(q)
    )
  })

  // Group filtered by category
  const grouped = new Map<string, Resource[]>()
  for (const r of filtered) {
    const cat = r.category ?? ''
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push(r)
  }

  if (resources.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>Resources</h2>
          <p className="text-sm text-[var(--ink-3)] mt-0.5">Shared links and documents from OTB</p>
        </div>
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-[var(--ink-3)]">No resources available yet — check back soon!</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>Resources</h2>
          <p className="text-sm text-[var(--ink-3)] mt-0.5">Shared links and documents from OTB</p>
        </div>
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-[var(--ink)]/15 bg-[var(--surface)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)] w-44"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--ink-3)] py-10">No resources match that search.</p>
      ) : (
        <div className="space-y-8">
          {categoriesOrdered
            .filter(cat => grouped.has(cat))
            .map(cat => (
              <section key={cat || '__uncategorized__'}>
                {cat && (
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--ink-3)] mb-3">
                    {cat}
                  </h3>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {grouped.get(cat)!.map(r => (
                    <ResourceCard key={r.id} resource={r} />
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}
    </div>
  )
}
