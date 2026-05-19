'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { runCadenceAnalysis } from './actions'
import { formatDate } from '@/lib/utils'

interface Props {
  initialAnalysis: string | null
  initialRowCount: number | null
  initialCreatedAt: string | null
}

function MarkdownBlock({ text }: { text: string }) {
  // Render bold (**text**) and headers (## Header) simply
  const lines = text.split('\n')
  return (
    <div className="space-y-2 text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
      {lines.map((line, i) => {
        if (line.startsWith('## ') || line.startsWith('**') && line.endsWith('**')) {
          const clean = line.replace(/^##\s+/, '').replace(/^\*\*|\*\*$/g, '')
          return (
            <p key={i} className="font-semibold pt-2" style={{ color: 'var(--ink)' }}>
              {clean}
            </p>
          )
        }
        if (line.startsWith('- ')) {
          return (
            <div key={i} className="flex gap-2 ml-2">
              <span style={{ color: 'var(--ink-3)' }}>•</span>
              <span>{renderInline(line.slice(2))}</span>
            </div>
          )
        }
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i}>{renderInline(line)}</p>
      })}
    </div>
  )
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} style={{ color: 'var(--ink)', fontWeight: 600 }}>{part}</strong>
      : part
  )
}

export default function CadenceAdminClient({ initialAnalysis, initialRowCount, initialCreatedAt }: Props) {
  const [analysis, setAnalysis] = useState(initialAnalysis)
  const [rowCount, setRowCount] = useState(initialRowCount)
  const [createdAt, setCreatedAt] = useState(initialCreatedAt)
  const [rows, setRows] = useState<string[][]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [showRaw, setShowRaw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleReanalyze() {
    setError(null)
    startTransition(async () => {
      const result = await runCadenceAnalysis()
      if (result.error) {
        setError(result.error)
      } else {
        setAnalysis(result.analysis)
        setRowCount(result.rowCount)
        setCreatedAt(result.savedAt)
        setHeaders(result.headers)
        setRows(result.rows)
        setShowRaw(true)
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/admin" className="text-sm text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
              Admin
            </Link>
            <span className="text-[var(--ink-3)] text-sm">/</span>
            <span className="text-sm text-[var(--ink)]">Cadence Analysis</span>
          </div>
          <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
            Cadence Analysis
          </h2>
          {createdAt && (
            <p className="text-xs text-[var(--ink-3)] mt-0.5">
              Last analyzed {formatDate(createdAt)} · {rowCount} response{rowCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <button
          onClick={handleReanalyze}
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
          style={{ background: 'var(--accent-text)' }}
        >
          {isPending ? (
            <>
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="10 10" />
              </svg>
              Analyzing…
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M12 7A5 5 0 112 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M12 2v5h-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Re-analyze
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl border border-[var(--red)]/20 bg-[var(--red-l)]">
          <p className="text-sm font-medium" style={{ color: 'var(--red)' }}>Analysis failed</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--red)' }}>{error}</p>
        </div>
      )}

      {isPending && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 p-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="20 20" style={{ color: 'var(--accent-text)' }} />
            </svg>
            <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
              Fetching responses and running AI analysis…
            </p>
            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
              This may take 10–30 seconds
            </p>
          </div>
        </div>
      )}

      {/* AI Summary */}
      {analysis && !isPending && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-l)' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1l1.5 3.5L12 5l-2.5 2.5 1 3.5L7 9.5 4.5 11l1-3.5L3 5l3.5-.5L7 1z" fill="currentColor" style={{ color: 'var(--accent-text)' }} />
              </svg>
            </div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>AI Analysis</h3>
          </div>
          <MarkdownBlock text={analysis} />
        </div>
      )}

      {!analysis && !isPending && !error && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
            No analysis yet. Click &ldquo;Re-analyze&rdquo; to fetch the latest responses and generate an AI summary.
          </p>
        </div>
      )}

      {/* Raw data table */}
      {rows.length > 0 && !isPending && (
        <div>
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="flex items-center gap-2 text-sm mb-3 transition-colors"
            style={{ color: showRaw ? 'var(--ink)' : 'var(--ink-3)' }}
          >
            <svg
              width="12" height="12" viewBox="0 0 12 12" fill="none"
              style={{ transform: showRaw ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
            >
              <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {showRaw ? 'Hide' : 'Show'} raw data ({rows.length} rows)
          </button>

          {showRaw && (
            <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--ink)]/8">
                      {headers.map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left font-medium whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--ink)]/6">
                    {rows.map((row, i) => (
                      <tr key={i} className="hover:bg-[var(--canvas)] transition-colors">
                        {headers.map((_, j) => (
                          <td key={j} className="px-3 py-2 max-w-[200px] truncate" style={{ color: 'var(--ink-2)' }}>
                            {row[j] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
