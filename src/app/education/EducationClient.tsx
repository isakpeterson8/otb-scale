'use client'

import { useState, useEffect, useRef } from 'react'
import { upsertWatchProgress } from '@/app/actions/library'
import type { EducationLibraryItem, Resource } from '@/types/database'
import ResourcesClient from '@/app/resources/ResourcesClient'

// ── Category definitions (in display order) ───────────────────────────────────
const CATEGORIES = [
  { slug: 'orientation',   label: 'Welcome & Orientation' },
  { slug: 'mindset',       label: 'Mindset & Success' },
  { slug: 'ideal-student', label: 'Ideal Student' },
  { slug: 'marketing',                       label: 'Marketing' },
  { slug: 'facebook-group-self-promotion',   label: 'Facebook Group Self-Promotion' },
  { slug: 'structure',     label: 'Studio Structure & Policy' },
  { slug: 'tuition',       label: 'Tuition & Rates' },
  { slug: 'instruction',   label: 'Instruction Models' },
  { slug: 'a-la-carte',    label: 'A La Carte' },
  { slug: 'consultations', label: 'Trials & Consultations' },
  { slug: 'enrollment',    label: 'Long-Term Enrollment' },
  { slug: 'efficiency',    label: 'Resources & Efficiency' },
  { slug: 'summer',        label: 'Summer Retention' },
  { slug: 'studio-space',  label: 'Finding a Studio' },
  { slug: 'affiliate',     label: 'Referrals & Affiliates' },
  { slug: 'llc',           label: 'LLC' },
  { slug: 'tax',           label: 'Tax' },
  { slug: 'finance',       label: 'Finance' },
  { slug: 'ic',            label: 'Independent Contractors' },
  { slug: 'content',       label: 'Content Creation' },
] as const

const SAVE_INTERVAL_MS = 10_000

// ── Icons ─────────────────────────────────────────────────────────────────────
function PlayIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden>
      <circle cx="18" cy="18" r="17" fill="rgba(0,0,0,0.55)" />
      <path d="M15 12.5l11 5.5-11 5.5V12.5z" fill="white" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M3 3l12 12M15 3L3 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="9" stroke="currentColor" strokeWidth="1.4" />
      <path d="M11 7v4l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 9l4-4 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M5.5 8.5l3-3M8 5.5l.7-.7a2.5 2.5 0 013.5 3.5l-1.4 1.4a2.5 2.5 0 01-3.5 0M6 8.5l-1.4 1.4a2.5 2.5 0 01-3.5-3.5L2.5 5a2.5 2.5 0 013.5 0l.7.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EducationClient({
  items,
  resources = [],
  initialVideoId,
  initialCategorySlug,
  errorParam,
}: {
  items: EducationLibraryItem[]
  resources?: Resource[]
  initialVideoId?: string
  initialCategorySlug?: string
  errorParam?: string
}) {
  const [tab, setTab]                           = useState<'videos' | 'resources'>('videos')
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategorySlug ?? '')
  const [playingVideo, setPlayingVideo]         = useState<EducationLibraryItem | null>(null)
  const [mobileNavOpen, setMobileNavOpen]       = useState(false)
  const [search, setSearch]                     = useState('')
  const [copied, setCopied]                     = useState(false)
  const [errorToast, setErrorToast]             = useState<string | null>(
    errorParam === 'not-found' ? 'Video not found' : null
  )

  // Watch progress tracking refs — stable, no stale-closure risk
  const playingRef  = useRef<EducationLibraryItem | null>(null)
  const currentTime = useRef(0)
  const duration    = useRef(0)
  const lastSaveAt  = useRef(0)

  // Dismiss error toast after 4s
  useEffect(() => {
    if (!errorToast) return
    const t = setTimeout(() => setErrorToast(null), 4000)
    return () => clearTimeout(t)
  }, [errorToast])

  // Open initial video on mount (deep link)
  useEffect(() => {
    if (!initialVideoId) return
    const item = items.find(i => i.id === initialVideoId)
    if (item) setPlayingVideo(item)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    playingRef.current = playingVideo
    if (playingVideo) {
      currentTime.current = 0
      duration.current    = 0
      lastSaveAt.current  = Date.now()
    }
  }, [playingVideo])

  useEffect(() => {
    async function persist(force = false) {
      const item = playingRef.current
      if (!item || !duration.current) return
      const now = Date.now()
      if (!force && now - lastSaveAt.current < SAVE_INTERVAL_MS) return
      lastSaveAt.current = now
      const pct = Math.min(100, Math.round((currentTime.current / duration.current) * 100))
      upsertWatchProgress(item.id, pct, Math.round(currentTime.current), Math.round(duration.current)).catch(() => {})
    }

    function onMessage(e: MessageEvent) {
      try {
        const msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        if (!msg?.event) return
        if (msg.event === 'timeupdate') {
          currentTime.current = msg.data?.currentTime ?? 0
          duration.current    = msg.data?.duration    ?? 0
          persist()
        } else if (msg.event === 'ended') {
          currentTime.current = duration.current
          persist(true)
        }
      } catch { /* ignore */ }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  function openVideo(item: EducationLibraryItem) {
    setPlayingVideo(item)
    if (item.slug && item.category) {
      window.history.replaceState(null, '', `/education/${item.category}/${item.slug}`)
    }
  }

  function closeModal() {
    const item = playingRef.current
    if (item && duration.current > 0) {
      const pct = Math.min(100, Math.round((currentTime.current / duration.current) * 100))
      upsertWatchProgress(item.id, pct, Math.round(currentTime.current), Math.round(duration.current)).catch(() => {})
    }
    setPlayingVideo(null)
    window.history.replaceState(null, '', '/education')
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Build map of category → items
  const byCat = new Map<string, EducationLibraryItem[]>()
  for (const item of items) {
    const cat = item.category ?? 'uncategorized'
    if (!byCat.has(cat)) byCat.set(cat, [])
    byCat.get(cat)!.push(item)
  }

  // Only show categories that have items
  const activeCats = CATEGORIES.filter(c => byCat.has(c.slug))

  // Default to first available category
  const effectiveCategory = selectedCategory && byCat.has(selectedCategory)
    ? selectedCategory
    : (activeCats[0]?.slug ?? '')

  const selectedLabel = CATEGORIES.find(c => c.slug === effectiveCategory)?.label ?? effectiveCategory

  const categoryItems = (byCat.get(effectiveCategory) ?? []).filter(item => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return item.title.toLowerCase().includes(q) || (item.description ?? '').toLowerCase().includes(q)
  })

  const toggleBar = (
    <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--surface)' }}>
      <button
        onClick={() => setTab('videos')}
        className={[
          'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
          tab === 'videos'
            ? 'bg-[var(--accent-l)] text-[var(--accent-text)]'
            : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]',
        ].join(' ')}
      >
        Videos
      </button>
      <button
        onClick={() => setTab('resources')}
        className={[
          'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
          tab === 'resources'
            ? 'bg-[var(--accent-l)] text-[var(--accent-text)]'
            : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]',
        ].join(' ')}
      >
        Resources
      </button>
    </div>
  )

  if (items.length === 0 && tab === 'videos') {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>Education Library</h2>
          <p className="text-sm text-[var(--ink-3)] mt-0.5">Videos and shared resources from OTB</p>
        </div>
        {toggleBar}
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-[var(--ink-3)]">No videos available yet — check back soon!</p>
        </div>
      </div>
    )
  }

  if (tab === 'resources') {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
            Education Library
          </h2>
          <p className="text-sm text-[var(--ink-3)] mt-0.5">Videos and shared resources from OTB</p>
        </div>
        {toggleBar}
        <ResourcesClient resources={resources} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
          Education Library
        </h2>
        <p className="text-sm text-[var(--ink-3)] mt-0.5">Videos and shared resources from OTB</p>
      </div>
      {toggleBar}

      <div className="flex gap-7">
        {/* ── Sidebar (desktop ≥ lg) ─────────────────────────────────────────── */}
        <nav className="hidden lg:block shrink-0 w-52" aria-label="Categories">
          <div className="space-y-0.5 sticky top-6">
            {activeCats.map(cat => {
              const readyCount = (byCat.get(cat.slug) ?? []).filter(i => !i.is_placeholder).length
              const isActive   = cat.slug === effectiveCategory
              return (
                <button
                  key={cat.slug}
                  onClick={() => { setSelectedCategory(cat.slug); setSearch('') }}
                  className={[
                    'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between gap-2',
                    isActive
                      ? 'bg-[var(--accent-l)] text-[var(--accent-text)] font-medium'
                      : 'text-[var(--ink-2)] hover:bg-[var(--surface)] hover:text-[var(--ink)]',
                  ].join(' ')}
                >
                  <span className="leading-snug">{cat.label}</span>
                  <span className="shrink-0 text-xs opacity-40">{readyCount}</span>
                </button>
              )
            })}
          </div>
        </nav>

        {/* ── Main content ───────────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1 space-y-4">

          {/* Mobile category dropdown */}
          <div className="lg:hidden relative">
            <button
              onClick={() => setMobileNavOpen(o => !o)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-[var(--ink)]/15 bg-[var(--surface)] text-sm font-medium text-[var(--ink)]"
            >
              <span>{selectedLabel}</span>
              {mobileNavOpen ? <ChevronUp /> : <ChevronDown />}
            </button>
            {mobileNavOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 z-20 rounded-xl border border-[var(--ink)]/10 bg-[var(--surface)] shadow-xl overflow-hidden">
                <div className="max-h-72 overflow-y-auto">
                  {activeCats.map(cat => (
                    <button
                      key={cat.slug}
                      onClick={() => { setSelectedCategory(cat.slug); setSearch(''); setMobileNavOpen(false) }}
                      className={[
                        'w-full text-left px-4 py-2.5 text-sm transition-colors border-b border-[var(--ink)]/6 last:border-0',
                        cat.slug === effectiveCategory
                          ? 'bg-[var(--accent-l)] text-[var(--accent-text)] font-medium'
                          : 'text-[var(--ink-2)] hover:bg-[var(--canvas)]',
                      ].join(' ')}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section title + search row */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-base font-medium text-[var(--ink)]">{selectedLabel}</h3>
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-[var(--ink)]/15 bg-[var(--surface)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)] w-44"
            />
          </div>

          {/* Grid */}
          {categoryItems.length === 0 ? (
            <p className="text-sm text-[var(--ink-3)] py-10">
              {search ? 'No videos match that search.' : 'No videos in this section yet.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {categoryItems.map(item => (
                <VideoCard key={item.id} item={item} onPlay={openVideo} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Video player modal ─────────────────────────────────────────────────── */}
      {playingVideo && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/85 p-4 overflow-y-auto"
          onClick={closeModal}
        >
          <div
            className="relative w-full max-w-3xl my-8"
            onClick={e => e.stopPropagation()}
          >
            {/* Top bar: close + copy link */}
            <div className="absolute -top-9 right-0 flex items-center gap-3">
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 text-white/60 hover:text-white transition-colors text-xs"
                aria-label="Copy link"
              >
                <LinkIcon />
                <span>{copied ? 'Link copied!' : 'Copy Link'}</span>
              </button>
              <button
                onClick={closeModal}
                className="text-white/70 hover:text-white transition-colors"
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>

            {/* Video player */}
            <div className="aspect-video rounded-xl overflow-hidden bg-black">
              <iframe
                src={`https://iframe.cloudflarestream.com/${playingVideo.cf_uid}?autoplay=true`}
                className="w-full h-full"
                style={{ border: 'none' }}
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>

            {/* Title */}
            <div className="mt-3 mb-4 px-1">
              <p className="text-white font-medium text-lg leading-snug">{playingVideo.title}</p>
              {playingVideo.description && (
                <p className="text-white/55 text-sm mt-1">{playingVideo.description}</p>
              )}
            </div>

            {/* Transcript */}
            {playingVideo.transcript_text && (
              <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/10 overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--ink)]/8 flex items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--ink-3)] uppercase tracking-widest">
                    Transcript
                  </span>
                </div>
                <div className="px-5 py-4 max-h-80 overflow-y-auto">
                  <p className="text-sm text-[var(--ink-2)] leading-relaxed whitespace-pre-wrap">
                    {playingVideo.transcript_text}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Error toast ───────────────────────────────────────────────────────── */}
      {errorToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg"
          style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid rgba(255,248,240,0.12)' }}
        >
          {errorToast}
        </div>
      )}
    </div>
  )
}

// ── Video card ────────────────────────────────────────────────────────────────
function VideoCard({
  item,
  onPlay,
}: {
  item: EducationLibraryItem
  onPlay: (item: EducationLibraryItem) => void
}) {
  const isPlaceholder = item.is_placeholder || (!item.cf_uid && item.type === 'video')

  return (
    <div
      onClick={() => !isPlaceholder && onPlay(item)}
      className={[
        'bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden transition-all',
        isPlaceholder
          ? 'opacity-45 cursor-default select-none'
          : 'hover:border-[var(--ink)]/22 hover:shadow-sm cursor-pointer group',
      ].join(' ')}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-[var(--surface-2)] flex items-center justify-center overflow-hidden">
        {item.cf_uid ? (
          <>
            <img
              src={`https://cloudflarestream.com/${item.cf_uid}/thumbnails/thumbnail.jpg`}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/15 transition-colors">
              <div className="opacity-75 group-hover:opacity-100 transition-opacity">
                <PlayIcon />
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-[var(--ink-3)]">
            <ClockIcon />
            <span className="text-xs font-medium tracking-wide">Coming Soon</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-3 py-3">
        <p className={[
          'text-sm font-medium leading-snug',
          isPlaceholder
            ? 'text-[var(--ink-3)]'
            : 'text-[var(--ink)] group-hover:text-[var(--accent-text)] transition-colors',
        ].join(' ')}>
          {item.title}
        </p>
        {item.description && !isPlaceholder && (
          <p className="text-xs text-[var(--ink-3)] mt-1 leading-relaxed line-clamp-2">
            {item.description}
          </p>
        )}
        {item.transcript_text && !isPlaceholder && (
          <p className="text-xs text-[var(--ink-3)] mt-2 flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent-text)] opacity-50 shrink-0" />
            Transcript included
          </p>
        )}
      </div>
    </div>
  )
}
