'use client'

import { useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import {
  MAX_IMPORT_ROWS,
  applyMapping,
  autoMapHeaders,
  buildErrorReport,
  buildTemplateCsv,
  countStatuses,
  makeBatches,
  mappingErrors,
  validateRows,
  type ImportConfig,
  type RowResult,
  type RowStatus,
  type ValidatedRow,
} from '@/lib/csv-import/core'
import {
  findExistingImportKeys,
  importLeadsBatch,
  importSchoolsBatch,
  type DuplicateMode,
} from '@/app/actions/import'

type Step = 'upload' | 'map' | 'preview' | 'importing' | 'done'

const STATUS_META: Record<RowStatus, { icon: string; label: string }> = {
  ready:     { icon: '✅', label: 'Ready' },
  warning:   { icon: '⚠️', label: 'Warning' },
  error:     { icon: '❌', label: 'Error' },
  duplicate: { icon: '🔁', label: 'Duplicate' },
}

const BUTTON_SECONDARY =
  'flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--ink)]/15 text-sm font-medium text-[var(--ink)] hover:bg-[var(--surface)] transition-colors'
const BUTTON_PRIMARY =
  'px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--ink)] text-sm font-medium hover:bg-[var(--accent-text)] hover:text-[var(--canvas)] disabled:opacity-50 transition-colors'

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * "Download CSV template" + "Import CSV" buttons and the 4-step import modal
 * (upload → map columns → preview & validate → import). Configured per page
 * with an ImportConfig; nothing here is page-specific.
 */
export default function CsvImport({
  config,
  onImported,
}: {
  config: ImportConfig
  /** Called after a finished import is closed, to refresh the list. */
  onImported: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => downloadText(config.templateFilename, buildTemplateCsv(config))} className={BUTTON_SECONDARY}>
        Download CSV template
      </button>
      <button type="button" onClick={() => setOpen(true)} className={BUTTON_SECONDARY}>
        Import CSV
      </button>
      {open && (
        <ImportModal
          config={config}
          onClose={imported => { setOpen(false); if (imported) onImported() }}
        />
      )}
    </>
  )
}

function ImportModal({ config, onClose }: { config: ImportConfig; onClose: (imported: boolean) => void }) {
  const [step, setStep] = useState<Step>('upload')
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<Record<string, string | null>>({})
  const [rows, setRows] = useState<ValidatedRow[]>([])
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [mode, setMode] = useState<DuplicateMode>('skip')
  const [filter, setFilter] = useState<RowStatus | 'all'>('all')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [results, setResults] = useState<RowResult[]>([])
  const [dragOver, setDragOver] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const entityPlural = config.entity === 'leads' ? 'leads' : 'schools'

  // ── Step 1: upload ──────────────────────────────────────────────────────
  function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please choose a .csv file. (In Excel or Google Sheets: File → Download / Save as → CSV.)')
      return
    }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: h => h.replace(/^﻿/, '').trim(),
      complete: result => {
        const fields = (result.meta.fields ?? []).filter(Boolean)
        const data = result.data.filter(r => Object.values(r).some(v => String(v ?? '').trim()))
        if (fields.length === 0 || data.length === 0) {
          setError('That file has no data rows under a header row.')
          return
        }
        if (data.length > MAX_IMPORT_ROWS) {
          setError(`That file has ${data.length.toLocaleString()} rows; the limit is ${MAX_IMPORT_ROWS.toLocaleString()} per import. Split it into smaller files.`)
          return
        }
        setFileName(file.name)
        setHeaders(fields)
        setRawRows(data)
        setMapping(autoMapHeaders(fields, config))
        setStep('map')
      },
      error: err => setError(`Could not read the file: ${err.message}`),
    })
  }

  // ── Step 2: map columns ─────────────────────────────────────────────────
  const mapErrors = useMemo(() => mappingErrors(mapping, config), [mapping, config])

  async function goToPreview() {
    setBusy(true)
    setError(null)
    const mapped = applyMapping(rawRows, mapping)
    // Validate once without duplicates to collect the keys, then look them up.
    const keys = [...new Set(validateRows(mapped, config, new Set()).map(r => r.dedupeKey).filter((k): k is string => !!k))]
    const { keys: existing, error: lookupError } = await findExistingImportKeys(config.entity, keys)
    setBusy(false)
    if (lookupError) { setError(lookupError); return }
    setRows(validateRows(mapped, config, new Set(existing)))
    setExcluded(new Set())
    setFilter('all')
    setStep('preview')
  }

  // ── Step 3: preview ─────────────────────────────────────────────────────
  const counts = useMemo(() => countStatuses(rows), [rows])
  const included = rows.filter(r => !excluded.has(r.row))
  // Error rows never go to the server. Duplicates of existing records only
  // when updating; repeats within the file never.
  const toSend = included.filter(r =>
    r.status !== 'error' && (r.status !== 'duplicate' || (mode === 'update' && r.duplicateOf === 'account')))
  const visibleRows = filter === 'all' ? rows : rows.filter(r => r.status === filter)
  const previewFields = config.fields.filter(f => Object.values(mapping).includes(f.key)).slice(0, 4)

  // ── Step 4: import ──────────────────────────────────────────────────────
  async function runImport() {
    setStep('importing')
    setError(null)
    const batches = makeBatches(toSend, config.entity)
    setProgress({ done: 0, total: toSend.length })
    const all: RowResult[] = []
    const send = config.entity === 'leads' ? importLeadsBatch : importSchoolsBatch

    for (const batch of batches) {
      const payload = batch.map(({ row, values }) => ({ row, values }))
      try {
        const res = await send(payload, mode)
        if (res.error) all.push(...batch.map(r => ({ row: r.row, outcome: 'failed' as const, message: res.error ?? 'Import failed' })))
        else all.push(...res.results)
      } catch {
        all.push(...batch.map(r => ({ row: r.row, outcome: 'failed' as const, message: 'Network error during import.' })))
      }
      setProgress(p => ({ ...p, done: p.done + batch.length }))
    }

    // Rows that never went to the server still belong in the summary.
    const sent = new Set(toSend.map(r => r.row))
    for (const r of rows) {
      if (sent.has(r.row)) continue
      if (excluded.has(r.row)) all.push({ row: r.row, outcome: 'skipped', message: 'Excluded from import.' })
      else if (r.status === 'error') all.push({ row: r.row, outcome: 'failed', message: r.messages.join(' ') })
      else all.push({ row: r.row, outcome: 'skipped', message: r.messages[0] })
    }
    setResults(all.sort((a, b) => a.row - b.row))
    setStep('done')
  }

  const summary = useMemo(() => {
    const s = { created: 0, updated: 0, skipped: 0, failed: 0 }
    for (const r of results) s[r.outcome]++
    return s
  }, [results])
  const failures = results.filter(r => r.outcome === 'failed').map(r => ({ row: r.row, message: r.message ?? 'Failed' }))

  const canClose = step !== 'importing'

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:bg-black/50 sm:px-4">
      <div
        role="dialog"
        aria-label={`Import ${entityPlural} from CSV`}
        className="flex-1 flex flex-col overflow-hidden bg-[var(--surface)] p-5 sm:p-6 sm:flex-none sm:rounded-2xl sm:border sm:border-[var(--ink)]/8 sm:max-h-[90vh] sm:max-w-4xl w-full"
      >
        <div className="flex items-start justify-between mb-4 gap-3">
          <div>
            <h3 className="text-base font-medium text-[var(--ink)]">Import {entityPlural} from CSV</h3>
            <ol className="flex gap-3 text-xs text-[var(--ink-3)] mt-1">
              {(['upload', 'map', 'preview', 'importing'] as const).map((s, i) => (
                <li key={s} className={step === s || (s === 'importing' && step === 'done') ? 'text-[var(--ink)] font-medium' : ''}>
                  {i + 1}. {s === 'upload' ? 'Upload' : s === 'map' ? 'Map columns' : s === 'preview' ? 'Preview' : 'Import'}
                </li>
              ))}
            </ol>
          </div>
          {canClose && (
            <button onClick={() => onClose(step === 'done')} aria-label="Close" className="p-1 text-[var(--ink-3)] hover:text-[var(--ink)]">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {step === 'upload' && (
            <div className="space-y-3">
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
                onClick={() => fileInput.current?.click()}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click() }}
                role="button"
                tabIndex={0}
                className={[
                  'flex flex-col items-center justify-center gap-2 py-14 rounded-xl border-2 border-dashed cursor-pointer transition-colors text-center px-4',
                  dragOver ? 'border-[var(--accent-text)] bg-[var(--accent-light)]' : 'border-[var(--ink)]/15 hover:border-[var(--ink)]/30',
                ].join(' ')}
              >
                <p className="text-sm text-[var(--ink)] font-medium">Drop a .csv file here, or click to choose one</p>
                <p className="text-xs text-[var(--ink-3)]">Up to {MAX_IMPORT_ROWS.toLocaleString()} rows. Start from the template to get the columns right.</p>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={e => { handleFile(e.target.files?.[0]); e.target.value = '' }}
              />
              {config.entity === 'schools' && (
                <p className="text-xs text-[var(--ink-3)]">
                  One row per contact. Rows with the same school name, city and state become one school with several contacts.
                </p>
              )}
            </div>
          )}

          {step === 'map' && (
            <div className="space-y-3">
              <p className="text-sm text-[var(--ink-2)]">
                <span className="font-medium text-[var(--ink)]">{fileName}</span> · {rawRows.length.toLocaleString()} rows.
                Match each column to a field. Columns set to “Ignore” are not imported.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--ink-3)] uppercase tracking-wide">
                    <th className="py-2 pr-3 font-medium">CSV column</th>
                    <th className="py-2 pr-3 font-medium hidden sm:table-cell">Example</th>
                    <th className="py-2 font-medium">Imports as</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ink)]/6">
                  {headers.map(h => (
                    <tr key={h}>
                      <td className="py-2 pr-3 text-[var(--ink)]">{h}</td>
                      <td className="py-2 pr-3 text-xs text-[var(--ink-3)] truncate max-w-[200px] hidden sm:table-cell">
                        {rawRows.find(r => String(r[h] ?? '').trim())?.[h] ?? ''}
                      </td>
                      <td className="py-2">
                        <select
                          aria-label={`Field for ${h}`}
                          value={mapping[h] ?? ''}
                          onChange={e => setMapping(m => ({ ...m, [h]: e.target.value || null }))}
                          className="w-full px-2 py-1.5 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)]"
                        >
                          <option value="">Ignore</option>
                          {config.fields.map(f => (
                            <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {mapErrors.length > 0 && (
                <ul className="text-xs text-[var(--red)] bg-[var(--red-l)] px-3 py-2 rounded-lg space-y-0.5">
                  {mapErrors.map(e => <li key={e}>{e}</li>)}
                </ul>
              )}
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter rows by status">
                <button
                  type="button"
                  aria-pressed={filter === 'all'}
                  onClick={() => setFilter('all')}
                  className={`px-2.5 py-1 rounded-full text-xs border ${filter === 'all' ? 'border-[var(--accent-text)] bg-[var(--accent-light)]' : 'border-[var(--ink)]/15'}`}
                >
                  All {rows.length}
                </button>
                {(Object.keys(STATUS_META) as RowStatus[]).map(s => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={filter === s}
                    onClick={() => setFilter(s)}
                    className={`px-2.5 py-1 rounded-full text-xs border ${filter === s ? 'border-[var(--accent-text)] bg-[var(--accent-light)]' : 'border-[var(--ink)]/15'}`}
                  >
                    {STATUS_META[s].icon} {STATUS_META[s].label} {counts[s]}
                  </button>
                ))}
              </div>

              {counts.duplicate > 0 && (
                <fieldset className="flex flex-wrap items-center gap-4 text-sm text-[var(--ink-2)] px-3 py-2 rounded-lg bg-[var(--canvas)]">
                  <legend className="sr-only">Duplicates</legend>
                  <span className="text-xs uppercase tracking-wide text-[var(--ink-3)] font-medium">Duplicates</span>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="dup-mode" checked={mode === 'skip'} onChange={() => setMode('skip')} /> Skip them
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="dup-mode" checked={mode === 'update'} onChange={() => setMode('update')} />
                    {config.entity === 'leads' ? 'Update the existing leads' : 'Add new contacts to the existing schools'}
                  </label>
                </fieldset>
              )}

              <div className="overflow-x-auto border border-[var(--ink)]/8 rounded-lg">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-[var(--canvas)]">
                    <tr className="text-left text-xs text-[var(--ink-3)] uppercase tracking-wide">
                      <th className="px-3 py-2 font-medium w-10"><span className="sr-only">Include</span></th>
                      <th className="px-3 py-2 font-medium w-12">Row</th>
                      <th className="px-3 py-2 font-medium w-28">Status</th>
                      {previewFields.map(f => <th key={f.key} className="px-3 py-2 font-medium">{f.label}</th>)}
                      <th className="px-3 py-2 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--ink)]/6">
                    {visibleRows.map(r => {
                      const isExcluded = excluded.has(r.row)
                      return (
                        <tr key={r.row} className={isExcluded ? 'opacity-40' : ''}>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              aria-label={`Include row ${r.row}`}
                              disabled={r.status === 'error'}
                              checked={r.status !== 'error' && !isExcluded}
                              onChange={() => setExcluded(prev => {
                                const next = new Set(prev)
                                if (next.has(r.row)) next.delete(r.row)
                                else next.add(r.row)
                                return next
                              })}
                            />
                          </td>
                          <td className="px-3 py-2 text-xs text-[var(--ink-3)]">{r.row}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">{STATUS_META[r.status].icon} {STATUS_META[r.status].label}</td>
                          {previewFields.map(f => (
                            <td key={f.key} className="px-3 py-2 text-[var(--ink-2)] truncate max-w-[160px]">{r.values[f.key] || '—'}</td>
                          ))}
                          <td className="px-3 py-2 text-xs text-[var(--ink-3)]">{r.messages.join(' ')}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="py-10 space-y-3">
              <p className="text-sm text-[var(--ink)]">Importing {progress.done.toLocaleString()} of {progress.total.toLocaleString()} rows…</p>
              <div className="h-2 rounded-full bg-[var(--canvas)] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
                <div
                  className="h-full bg-[var(--accent)] transition-all"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-xs text-[var(--ink-3)]">Keep this window open until it finishes.</p>
            </div>
          )}

          {step === 'done' && (
            <div className="py-6 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([
                  ['Created', summary.created],
                  ['Updated', summary.updated],
                  ['Skipped', summary.skipped],
                  ['Failed', summary.failed],
                ] as const).map(([label, n]) => (
                  <div key={label} className="rounded-xl border border-[var(--ink)]/8 px-4 py-3">
                    <p className="text-xs text-[var(--ink-3)] uppercase tracking-wide font-medium">{label}</p>
                    <p className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>{n}</p>
                  </div>
                ))}
              </div>
              {failures.length > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => downloadText(fileName.replace(/\.csv$/i, '') + '-errors.csv', buildErrorReport(headers, rawRows, failures))}
                    className={BUTTON_SECONDARY}
                  >
                    Download error report
                  </button>
                  <p className="text-xs text-[var(--ink-3)]">Fix the rows in the report and upload it again; the error column is ignored.</p>
                </div>
              )}
            </div>
          )}

          {error && <p className="mt-3 text-xs text-[var(--red)] bg-[var(--red-l)] px-3 py-2 rounded-lg">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-[var(--ink)]/8">
          <div className="text-xs text-[var(--ink-3)]">
            {step === 'preview' && `${toSend.length.toLocaleString()} of ${rows.length.toLocaleString()} rows will be sent`}
          </div>
          <div className="flex gap-2">
            {step === 'map' && (
              <>
                <button type="button" onClick={() => setStep('upload')} className="px-4 py-2 text-sm text-[var(--ink-3)] hover:text-[var(--ink)]">Back</button>
                <button type="button" onClick={goToPreview} disabled={mapErrors.length > 0 || busy} className={BUTTON_PRIMARY}>
                  {busy ? 'Checking…' : 'Preview'}
                </button>
              </>
            )}
            {step === 'preview' && (
              <>
                <button type="button" onClick={() => setStep('map')} className="px-4 py-2 text-sm text-[var(--ink-3)] hover:text-[var(--ink)]">Back</button>
                <button type="button" onClick={runImport} disabled={toSend.length === 0} className={BUTTON_PRIMARY}>
                  Import {toSend.length.toLocaleString()} {toSend.length === 1 ? 'row' : 'rows'}
                </button>
              </>
            )}
            {step === 'done' && (
              <button type="button" onClick={() => onClose(true)} className={BUTTON_PRIMARY}>Done</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
