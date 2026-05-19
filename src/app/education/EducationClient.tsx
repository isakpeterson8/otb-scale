'use client'

import { useState, useEffect, useRef } from 'react'
import { upsertWatchProgress } from '@/app/actions/library'
import type { EducationLibraryItem } from '@/types/database'

function VideoIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2" y="5" width="16" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M18 10l5-3v10l-5-3V10z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function PdfIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 3h10l5 5v14a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M15 3v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="15" fill="rgba(0,0,0,0.5)" />
      <path d="M13 11l10 5-10 5V11z" fill="white" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

const SAVE_INTERVAL_MS = 10_000

export default function EducationClient({ items }: { items: EducationLibraryItem[] }) {
  const [playingVideo, setPlayingVideo] = useState<EducationLibraryItem | null>(null)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'video' | 'pdf'>('all')

  // Refs for tracking — stable across renders, no stale-closure risk
  const playingRef   = useRef<EducationLibraryItem | null>(null)
  const currentTime  = useRef(0)
  const duration     = useRef(0)
  const lastSaveAt   = useRef(0)

  // Keep ref in sync with state; reset counters when a new video starts
  useEffect(() => {
    playingRef.current = playingVideo
    if (playingVideo) {
      currentTime.current = 0
      duration.current = 0
      lastSaveAt.current = Date.now()
    }
  }, [playingVideo])

  // Stable message listener — mounted once, reads from refs
  useEffect(() => {
    async function persist(force = false) {
      const item = playingRef.current
      if (!item || !duration.current) return
      const now = Date.now()
      if (!force && now - lastSaveAt.current < SAVE_INTERVAL_MS) return
      lastSaveAt.current = now
      const pct = Math.min(100, Math.round((currentTime.current / duration.current) * 100))
      // fire-and-forget; errors are non-critical
      upsertWatchProgress(item.id, pct, Math.round(currentTime.current), Math.round(duration.current))
        .catch(() => {})
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
      } catch {
        // ignore malformed messages from other iframes
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, []) // mount once — all state accessed via refs

  function closeModal() {
    // Flush progress immediately on close
    const item = playingRef.current
    if (item && duration.current > 0) {
      const pct = Math.min(100, Math.round((currentTime.current / duration.current) * 100))
      upsertWatchProgress(item.id, pct, Math.round(currentTime.current), Math.round(duration.current))
        .catch(() => {})
    }
    setPlayingVideo(null)
  }

  const filtered = items.filter(item => {
    if (filterType !== 'all' && item.type !== filterType) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        item.title.toLowerCase().includes(q) ||
        (item.description ?? '').toLowerCase().includes(q) ||
        (item.category ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  function handleItemClick(item: EducationLibraryItem) {
    if (item.type === 'video') {
      setPlayingVideo(item)
    } else if (item.pdf_url) {
      window.open(item.pdf_url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
          Education Library
        </h2>
        <p className="text-sm text-[var(--ink-3)] mt-0.5">
          Resources to help you grow your studio
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-[var(--ink)]/15 bg-[var(--surface)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)] w-48"
        />
        <div className="flex gap-1">
          {(['all', 'video', 'pdf'] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={[
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize',
                filterType === t
                  ? 'bg-[var(--accent-l)] text-[var(--accent-text)]'
                  : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]',
              ].join(' ')}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-center">
          <p className="text-sm text-[var(--ink-3)]">
            {items.length === 0 ? 'No resources available yet. Check back soon!' : 'No resources match your search.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => (
            <button
              key={item.id}
              onClick={() => handleItemClick(item)}
              className="text-left bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden hover:border-[var(--ink)]/20 hover:shadow-sm transition-all group"
            >
              {/* Thumbnail */}
              <div className="relative aspect-video bg-[var(--surface-2)] flex items-center justify-center overflow-hidden">
                {item.type === 'video' && item.cf_uid ? (
                  <>
                    <img
                      src={`https://cloudflarestream.com/${item.cf_uid}/thumbnails/thumbnail.jpg`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-colors">
                      <div className="opacity-80 group-hover:opacity-100 transition-opacity">
                        <PlayIcon />
                      </div>
                    </div>
                  </>
                ) : (
                  <span className="text-[var(--ink-3)]">
                    {item.type === 'video' ? <VideoIcon /> : <PdfIcon />}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-medium text-[var(--ink)] leading-snug group-hover:text-[var(--accent-text)] transition-colors">
                    {item.title}
                  </p>
                  <span
                    className="shrink-0 text-xs px-1.5 py-0.5 rounded-full uppercase tracking-wide font-medium"
                    style={{
                      background: item.type === 'video' ? 'rgba(4,173,239,0.1)' : 'rgba(180,83,9,0.1)',
                      color: item.type === 'video' ? '#0284a8' : '#b45309',
                    }}
                  >
                    {item.type}
                  </span>
                </div>
                {item.description && (
                  <p className="text-xs text-[var(--ink-3)] leading-relaxed line-clamp-2">{item.description}</p>
                )}
                {item.category && (
                  <p className="text-xs text-[var(--ink-3)] mt-2">{item.category}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Video player modal */}
      {playingVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={closeModal}
        >
          <div
            className="relative w-full max-w-4xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={closeModal}
              className="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors"
              aria-label="Close"
            >
              <CloseIcon />
            </button>
            <div className="aspect-video rounded-xl overflow-hidden bg-black">
              <iframe
                src={`https://iframe.cloudflarestream.com/${playingVideo.cf_uid}?autoplay=true`}
                className="w-full h-full"
                style={{ border: 'none' }}
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
            <div className="mt-3">
              <p className="text-white font-medium">{playingVideo.title}</p>
              {playingVideo.description && (
                <p className="text-white/60 text-sm mt-1">{playingVideo.description}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
