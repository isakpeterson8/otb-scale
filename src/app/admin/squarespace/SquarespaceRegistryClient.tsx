'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateSite,
  importSitesCsv,
  parseCircleDashboard,
  applyCircleSync,
} from '@/app/actions/squarespace-concierge'
import type { CircleDiff } from '@/app/actions/squarespace-concierge'
import type { SquaresspaceSite, SquaresspaceSyncLog, SiteStatus } from '@/types/database'
import { formatDate } from '@/lib/utils'

const STATUS_BADGE: Record<SiteStatus, { label: string; bg: string; color: string }> = {
  active_paid:    { label: 'Active (Paid)',    bg: 'rgba(22,163,74,0.12)',   color: '#15803d' },
  active_trial:   { label: 'Active (Trial)',   bg: 'rgba(4,173,239,0.12)',   color: '#0284a8' },
  trial_expired:  { label: 'Trial Expired',    bg: 'rgba(180,83,9,0.12)',    color: '#b45309' },
  expired_paid:   { label: 'Expired',          bg: 'rgba(120,38,38,0.12)',   color: '#991b1b' },
}

const DATE_TYPE_LABEL: Record<string, string> = {
  renewal:     'Renews',
  trial_expiry:'Trial expires',
  expiry:      'Expired',
  none:        '',
}

const inputClass = 'w-full px-2 py-1.5 rounded border border-[var(--ink)]/12 bg-[var(--canvas)] text-xs text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]'

interface Props {
  sites: SquaresspaceSite[]
  syncLog: SquaresspaceSyncLog[]
}

export default function SquarespaceRegistryClient({ sites: initialSites, syncLog: initialLog }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [sites, setSites] = useState(initialSites)
  const [log, setLog] = useState(initialLog)

  // Filter state
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SiteStatus | 'all'>('all')
  const [renewalDays, setRenewalDays] = useState<'' | '45'>('')

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editFields, setEditFields] = useState<Partial<SquaresspaceSite>>({})
  const [editError, setEditError] = useState<string | null>(null)

  // Circle sync modal
  const [showSync, setShowSync] = useState(false)
  const [rawText, setRawText] = useState('')
  const [syncDiff, setSyncDiff] = useState<CircleDiff | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncParsing, setSyncParsing] = useState(false)
  const [syncApplying, setSyncApplying] = useState(false)

  // CSV re-import
  const csvRef = useRef<HTMLInputElement>(null)
  const [csvError, setCsvError] = useState<string | null>(null)
  const [csvMsg, setCsvMsg] = useState<string | null>(null)

  const today = new Date()

  // Filtering
  const filtered = sites.filter(s => {
    if (search && !s.site_name.toLowerCase().includes(search.toLowerCase()) &&
        !(s.primary_url ?? '').toLowerCase().includes(search.toLowerCase()) &&
        !(s.member_name ?? '').toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter !== 'all' && s.status !== statusFilter) return false
    if (renewalDays === '45') {
      if (!s.key_date) return false
      const days = (new Date(s.key_date).getTime() - today.getTime()) / 86400000
      if (days < 0 || days > 45) return false
    }
    return true
  })

  function startEdit(site: SquaresspaceSite) {
    setEditingId(site.id)
    setEditFields({
      plan_tier: site.plan_tier ?? '',
      scheduling_stack: site.scheduling_stack ?? '',
      template_version: site.template_version ?? '',
      member_name: site.member_name ?? '',
      notes: site.notes ?? '',
    })
    setEditError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditFields({})
    setEditError(null)
  }

  function saveEdit(id: string) {
    startTransition(async () => {
      const result = await updateSite(id, {
        plan_tier: (editFields.plan_tier as string) || null,
        scheduling_stack: (editFields.scheduling_stack as string) || null,
        template_version: (editFields.template_version as string) || null,
        member_name: (editFields.member_name as string) || null,
        notes: (editFields.notes as string) || null,
      })
      if (result.error) {
        setEditError(result.error)
      } else {
        setSites(prev => prev.map(s =>
          s.id === id ? { ...s, ...editFields, updated_at: new Date().toISOString() } : s
        ))
        cancelEdit()
      }
    })
  }

  async function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvError(null)
    setCsvMsg(null)
    const text = await file.text()
    const lines = text.trim().split('\n')
    const headers = parseCsvLine(lines[0])
    const rows = lines.slice(1).map(line => {
      const vals = parseCsvLine(line)
      const row: { [k: string]: string } = {}
      headers.forEach((h, i) => { row[h.trim()] = (vals[i] ?? '').trim() })
      return row
    }).filter((r): r is { site_name: string } & typeof r => Boolean(r.site_name))

    startTransition(async () => {
      const result = await importSitesCsv(rows as Parameters<typeof importSitesCsv>[0])
      if (result.errors.length > 0) {
        setCsvError(result.errors.join('; '))
      } else {
        setCsvMsg(`Import complete — ${result.inserted} inserted, ${result.updated} updated, ${result.skipped} skipped`)
        router.refresh()
      }
      if (csvRef.current) csvRef.current.value = ''
    })
  }

  async function handleParseSync() {
    if (!rawText.trim()) return
    setSyncParsing(true)
    setSyncError(null)
    setSyncDiff(null)
    const result = await parseCircleDashboard(rawText)
    setSyncParsing(false)
    if (result.error) {
      setSyncError(result.error)
    } else if (result.diff) {
      setSyncDiff(result.diff)
    }
  }

  async function handleApplySync() {
    if (!syncDiff) return
    setSyncApplying(true)
    const allRows = [
      ...syncDiff.newSites,
      ...syncDiff.statusChanges.map(c => c.incoming),
      ...syncDiff.dateChanges.map(c => c.incoming),
      ...syncDiff.tagChanges.map(c => c.incoming),
    ]
    const result = await applyCircleSync(allRows)
    setSyncApplying(false)
    if (result.error) {
      setSyncError(result.error)
    } else {
      setShowSync(false)
      setRawText('')
      setSyncDiff(null)
      router.refresh()
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
            Squarespace Sites Registry
          </h2>
          <p className="text-sm text-[var(--ink-3)] mt-0.5">{sites.length} sites total</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowSync(true)}
            className="px-3 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
            style={{ background: 'rgba(4,173,239,0.12)', color: '#0284a8' }}
          >
            Circle Sync
          </button>
          <label className="px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-opacity hover:opacity-80"
            style={{ background: 'rgba(73,37,47,0.15)', color: 'var(--accent-text)' }}>
            CSV Import
            <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCsvFile} />
          </label>
        </div>
      </div>

      {csvError && <p className="text-xs" style={{ color: 'var(--red)' }}>{csvError}</p>}
      {csvMsg && <p className="text-xs" style={{ color: 'var(--green)' }}>{csvMsg}</p>}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          className="px-3 py-2 rounded-lg border border-[var(--ink)]/12 bg-[var(--surface)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)] w-56"
          placeholder="Search sites…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="px-3 py-2 rounded-lg border border-[var(--ink)]/12 bg-[var(--surface)] text-sm text-[var(--ink)] focus:outline-none"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as SiteStatus | 'all')}
        >
          <option value="all">All statuses</option>
          <option value="active_paid">Active (Paid)</option>
          <option value="active_trial">Active (Trial)</option>
          <option value="trial_expired">Trial Expired</option>
          <option value="expired_paid">Expired</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-[var(--ink-3)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={renewalDays === '45'}
            onChange={e => setRenewalDays(e.target.checked ? '45' : '')}
            className="rounded"
          />
          Renewing in 45 days
        </label>
        <span className="text-xs text-[var(--ink-3)] ml-auto">{filtered.length} shown</span>
      </div>

      {/* Table */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--ink)]/8">
              <Th>Site</Th>
              <Th>Status</Th>
              <Th>Date</Th>
              <Th>Tags</Th>
              <Th>Plan tier</Th>
              <Th>Scheduling</Th>
              <Th>Template</Th>
              <Th>Member</Th>
              <Th>Notes</Th>
              <Th right>Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ink)]/6">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-sm text-[var(--ink-3)]">
                  No sites match your filters.
                </td>
              </tr>
            )}
            {filtered.map(site => {
              const isEditing = editingId === site.id
              const badge = STATUS_BADGE[site.status]
              const dateLabel = DATE_TYPE_LABEL[site.date_type] || ''
              const daysUntil = site.key_date
                ? Math.round((new Date(site.key_date).getTime() - today.getTime()) / 86400000)
                : null

              return (
                <tr key={site.id} className="hover:bg-[var(--canvas)]/40 transition-colors">
                  {/* Site name + URL */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="font-medium text-[var(--ink)]">{site.site_name}</p>
                    {site.primary_url && (
                      <a
                        href={`https://${site.primary_url.replace(/^https?:\/\//, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[var(--ink-3)] hover:text-[var(--accent-text)] transition-colors"
                      >
                        {site.primary_url}
                        {site.is_custom_domain && <span className="ml-1 text-[10px] opacity-60">✓custom</span>}
                      </a>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-md text-xs font-medium"
                      style={{ background: badge.bg, color: badge.color }}>
                      {badge.label}
                    </span>
                  </td>

                  {/* Key date */}
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-[var(--ink-3)]">
                    {site.key_date ? (
                      <span>
                        {dateLabel && <span className="block text-[10px] uppercase tracking-wide opacity-60">{dateLabel}</span>}
                        {formatDate(site.key_date)}
                        {daysUntil !== null && daysUntil >= 0 && daysUntil <= 45 && (
                          <span className="ml-1 text-[10px]" style={{ color: daysUntil <= 7 ? 'var(--red)' : '#b45309' }}>
                            ({daysUntil}d)
                          </span>
                        )}
                      </span>
                    ) : '—'}
                  </td>

                  {/* Tags */}
                  <td className="px-4 py-3 text-xs text-[var(--ink-3)] max-w-[120px] truncate">
                    {site.circle_tags || '—'}
                  </td>

                  {/* Manual editable columns */}
                  {isEditing ? (
                    <>
                      <td className="px-2 py-2"><input className={inputClass} value={editFields.plan_tier as string ?? ''} onChange={e => setEditFields(f => ({ ...f, plan_tier: e.target.value }))} placeholder="Plan tier" /></td>
                      <td className="px-2 py-2"><input className={inputClass} value={editFields.scheduling_stack as string ?? ''} onChange={e => setEditFields(f => ({ ...f, scheduling_stack: e.target.value }))} placeholder="e.g. Fons" /></td>
                      <td className="px-2 py-2"><input className={inputClass} value={editFields.template_version as string ?? ''} onChange={e => setEditFields(f => ({ ...f, template_version: e.target.value }))} placeholder="Template" /></td>
                      <td className="px-2 py-2"><input className={inputClass} value={editFields.member_name as string ?? ''} onChange={e => setEditFields(f => ({ ...f, member_name: e.target.value }))} placeholder="Member name" /></td>
                      <td className="px-2 py-2"><input className={inputClass} value={editFields.notes as string ?? ''} onChange={e => setEditFields(f => ({ ...f, notes: e.target.value }))} placeholder="Notes" /></td>
                      <td className="px-4 py-2 whitespace-nowrap text-right">
                        <div className="flex items-center gap-2 justify-end">
                          {editError && <span className="text-xs" style={{ color: 'var(--red)' }}>{editError}</span>}
                          <button onClick={() => saveEdit(site.id)} disabled={isPending} className="text-xs font-medium transition-opacity hover:opacity-70" style={{ color: 'var(--green)' }}>Save</button>
                          <button onClick={cancelEdit} className="text-xs text-[var(--ink-3)] hover:text-[var(--ink)]">Cancel</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-xs text-[var(--ink-3)]">{site.plan_tier || '—'}</td>
                      <td className="px-4 py-3 text-xs text-[var(--ink-3)]">{site.scheduling_stack || '—'}</td>
                      <td className="px-4 py-3 text-xs text-[var(--ink-3)]">{site.template_version || '—'}</td>
                      <td className="px-4 py-3 text-xs text-[var(--ink-3)]">{site.member_name || '—'}</td>
                      <td className="px-4 py-3 text-xs text-[var(--ink-3)] max-w-[140px] truncate">{site.notes || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <button onClick={() => startEdit(site)} className="text-xs text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">Edit</button>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Sync log */}
      {log.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-[var(--ink-3)] uppercase tracking-wide">Sync history</h3>
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 divide-y divide-[var(--ink)]/6">
            {log.map(entry => (
              <div key={entry.id} className="px-4 py-3 flex items-center justify-between text-xs text-[var(--ink-3)]">
                <span>{formatDate(entry.synced_at)}</span>
                <span>{entry.new_sites} new · {entry.updated_sites} updated</span>
                {entry.notes && <span className="text-[var(--ink-3)] truncate max-w-[200px]">{entry.notes}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Circle sync modal */}
      {showSync && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="bg-[var(--surface)] rounded-2xl border border-[var(--ink)]/12 w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="px-6 py-4 border-b border-[var(--ink)]/8 flex items-center justify-between">
              <h3 className="text-base font-semibold text-[var(--ink)]">Circle Dashboard Sync</h3>
              <button onClick={() => { setShowSync(false); setRawText(''); setSyncDiff(null); setSyncError(null) }}
                className="text-[var(--ink-3)] hover:text-[var(--ink)]">✕</button>
            </div>
            <div className="p-6 flex-1 space-y-4">
              {!syncDiff ? (
                <>
                  <p className="text-sm text-[var(--ink-3)]">Paste the raw text from your Squarespace Circle dashboard below. Claude will parse it and show you a diff before applying.</p>
                  <textarea
                    className="w-full px-3 py-2.5 rounded-lg border border-[var(--ink)]/12 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)] resize-none font-mono"
                    rows={12}
                    value={rawText}
                    onChange={e => setRawText(e.target.value)}
                    placeholder="Paste Circle dashboard text here…"
                  />
                  {syncError && <p className="text-xs" style={{ color: 'var(--red)' }}>{syncError}</p>}
                  <button
                    onClick={handleParseSync}
                    disabled={syncParsing || !rawText.trim()}
                    className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-80"
                    style={{ background: 'rgba(4,173,239,0.15)', color: '#0284a8' }}
                  >
                    {syncParsing ? 'Parsing…' : 'Parse with Claude'}
                  </button>
                </>
              ) : (
                <>
                  <div className="space-y-3">
                    <DiffSection title="New sites" items={syncDiff.newSites} renderItem={s => (
                      <span className="text-xs text-[var(--ink)]">{s.site_name} — {s.status}{s.key_date ? ` · ${s.key_date}` : ''}</span>
                    )} />
                    <DiffSection title="Status changes" items={syncDiff.statusChanges} renderItem={c => (
                      <span className="text-xs text-[var(--ink)]">{c.existing.site_name}: <span style={{ color: 'var(--red)' }}>{c.existing.status}</span> → <span style={{ color: 'var(--green)' }}>{c.incoming.status}</span></span>
                    )} />
                    <DiffSection title="Date changes" items={syncDiff.dateChanges} renderItem={c => (
                      <span className="text-xs text-[var(--ink)]">{c.existing.site_name}: <span style={{ color: 'var(--red)' }}>{c.existing.key_date || 'none'}</span> → <span style={{ color: 'var(--green)' }}>{c.incoming.key_date || 'none'}</span></span>
                    )} />
                    <DiffSection title="Tag changes" items={syncDiff.tagChanges} renderItem={c => (
                      <span className="text-xs text-[var(--ink)]">{c.existing.site_name}: {c.incoming.circle_tags}</span>
                    )} />
                    <p className="text-xs text-[var(--ink-3)]">{syncDiff.unchanged} sites unchanged</p>
                  </div>
                  {syncError && <p className="text-xs" style={{ color: 'var(--red)' }}>{syncError}</p>}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleApplySync}
                      disabled={syncApplying}
                      className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-80"
                      style={{ background: 'rgba(22,163,74,0.15)', color: '#15803d' }}
                    >
                      {syncApplying ? 'Applying…' : 'Apply sync'}
                    </button>
                    <button onClick={() => setSyncDiff(null)} className="text-sm text-[var(--ink-3)] hover:text-[var(--ink)]">
                      ← Re-parse
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-3 text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function DiffSection<T>({ title, items, renderItem }: { title: string; items: T[]; renderItem: (item: T) => React.ReactNode }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-xs font-semibold text-[var(--ink-3)] mb-1">{title} ({items.length})</p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="text-xs text-[var(--green)] shrink-0">+</span>
            {renderItem(item)}
          </li>
        ))}
      </ul>
    </div>
  )
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}
