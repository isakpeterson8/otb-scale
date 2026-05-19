'use client'

import Link from 'next/link'
import { useState, useTransition, useRef } from 'react'
import { createLibraryItem, deleteLibraryItem, updateLibraryItem } from '@/app/actions/library'
import type { EducationLibraryItem } from '@/types/database'

type UploadState = 'idle' | 'getting-url' | 'uploading' | 'done' | 'error'

interface UploadProgress {
  state: UploadState
  percent: number
  error?: string
}

interface FormState {
  type: 'video' | 'pdf'
  title: string
  description: string
  category: string
  cf_uid: string
  pdf_url: string
}

const emptyForm = (): FormState => ({
  type: 'video',
  title: '',
  description: '',
  category: '',
  cf_uid: '',
  pdf_url: '',
})

const inputClass = 'w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]'

function VideoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="1" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M15 8l4-2v8l-4-2V8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

function PdfIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M4 2h8l4 4v12a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12 2v4h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export default function LibraryAdminClient({ items: initialItems }: { items: EducationLibraryItem[] }) {
  const [items, setItems] = useState(initialItems)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [upload, setUpload] = useState<UploadProgress>({ state: 'idle', percent: 0 })
  const [saving, startSave] = useTransition()
  const [deleting, startDelete] = useTransition()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ title: string; description: string; category: string }>({ title: '', description: '', category: '' })
  const [formError, setFormError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFormChange(k: keyof FormState, v: string) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFormError(null)

    if (form.type === 'pdf') {
      await uploadPdf(file)
    } else {
      await uploadVideo(file)
    }
  }

  async function uploadVideo(file: File) {
    setUpload({ state: 'getting-url', percent: 0 })
    try {
      const res = await fetch('/api/cf/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, size: file.size }),
      })
      if (!res.ok) {
        const data = await res.json()
        setUpload({ state: 'error', percent: 0, error: data.error ?? 'Failed to get upload URL' })
        return
      }
      const { uid, uploadURL } = await res.json()

      setUpload({ state: 'uploading', percent: 0 })

      // Dynamically import tus-js-client to avoid SSR issues
      const { Upload } = await import('tus-js-client')

      await new Promise<void>((resolve, reject) => {
        const tusUpload = new Upload(file, {
          uploadUrl: uploadURL,
          chunkSize: 50 * 1024 * 1024, // 50MB chunks
          retryDelays: [0, 1000, 3000],
          metadata: { name: file.name, filetype: file.type },
          onProgress(bytesUploaded, bytesTotal) {
            setUpload({ state: 'uploading', percent: Math.round((bytesUploaded / bytesTotal) * 100) })
          },
          onSuccess() {
            setForm(f => ({ ...f, cf_uid: uid }))
            setUpload({ state: 'done', percent: 100 })
            resolve()
          },
          onError(err) {
            setUpload({ state: 'error', percent: 0, error: String(err) })
            reject(err)
          },
        })
        tusUpload.start()
      })
    } catch {
      setUpload(u => u.state !== 'error' ? { state: 'error', percent: 0, error: 'Upload failed' } : u)
    }
  }

  async function uploadPdf(file: File) {
    setUpload({ state: 'uploading', percent: 50 })
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/education/pdf-upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const data = await res.json()
        setUpload({ state: 'error', percent: 0, error: data.error ?? 'Upload failed' })
        return
      }
      const { url } = await res.json()
      setForm(f => ({ ...f, pdf_url: url }))
      setUpload({ state: 'done', percent: 100 })
    } catch (err) {
      setUpload({ state: 'error', percent: 0, error: String(err) })
    }
  }

  async function handleSave() {
    if (!form.title.trim()) { setFormError('Title is required'); return }
    if (form.type === 'video' && !form.cf_uid) { setFormError('Please upload a video first'); return }
    if (form.type === 'pdf' && !form.pdf_url) { setFormError('Please upload a PDF first'); return }
    setFormError(null)

    startSave(async () => {
      const result = await createLibraryItem({
        title: form.title,
        description: form.description,
        type: form.type,
        cf_uid: form.cf_uid || undefined,
        pdf_url: form.pdf_url || undefined,
        category: form.category || undefined,
      })
      if (result.error) {
        setFormError(result.error)
      } else {
        setShowForm(false)
        setForm(emptyForm())
        setUpload({ state: 'idle', percent: 0 })
        // Refresh items
        window.location.reload()
      }
    })
  }

  function startEdit(item: EducationLibraryItem) {
    setEditingId(item.id)
    setEditForm({ title: item.title, description: item.description ?? '', category: item.category ?? '' })
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this item? This cannot be undone.')) return
    startDelete(async () => {
      await deleteLibraryItem(id)
      setItems(prev => prev.filter(i => i.id !== id))
    })
  }

  function handleUpdate(id: string) {
    startSave(async () => {
      const result = await updateLibraryItem(id, editForm)
      if (!result.error) {
        setItems(prev => prev.map(i => i.id === id ? { ...i, ...editForm, description: editForm.description || null, category: editForm.category || null } : i))
        setEditingId(null)
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/admin" className="text-sm text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
              Admin
            </Link>
            <span className="text-[var(--ink-3)] text-sm">/</span>
            <span className="text-sm text-[var(--ink)]">Education Library</span>
          </div>
          <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
            Education Library
          </h2>
          <p className="text-sm text-[var(--ink-3)] mt-0.5">{items.length} item{items.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setFormError(null) }}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity"
          style={{ background: 'var(--accent-text)' }}
        >
          + Add Item
        </button>
      </div>

      {/* Add Item form */}
      {showForm && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 p-5 space-y-4">
          <h3 className="text-sm font-medium text-[var(--ink)]">New Library Item</h3>

          {/* Type selector */}
          <div className="flex gap-2">
            {(['video', 'pdf'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => { handleFormChange('type', t); setUpload({ state: 'idle', percent: 0 }); setForm(f => ({ ...f, cf_uid: '', pdf_url: '' })) }}
                className={[
                  'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors',
                  form.type === t
                    ? 'border-[var(--accent-text)] bg-[var(--accent-l)] text-[var(--accent-text)]'
                    : 'border-[var(--ink)]/15 text-[var(--ink-2)] hover:border-[var(--ink)]/30',
                ].join(' ')}
              >
                {t === 'video' ? <VideoIcon /> : <PdfIcon />}
                {t === 'video' ? 'Video' : 'PDF'}
              </button>
            ))}
          </div>

          {/* File upload */}
          <div>
            <label className="block text-xs text-[var(--ink-3)] mb-1">
              {form.type === 'video' ? 'Video file' : 'PDF file'}
            </label>
            <div className="flex items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept={form.type === 'video' ? 'video/*' : 'application/pdf'}
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={upload.state === 'uploading' || upload.state === 'getting-url'}
                className="px-3 py-2 rounded-lg border border-[var(--ink)]/20 bg-[var(--canvas)] text-sm text-[var(--ink-2)] hover:border-[var(--ink)]/40 disabled:opacity-50 transition-colors"
              >
                {upload.state === 'idle' ? 'Choose file…' : upload.state === 'done' ? 'Change file' : '…'}
              </button>
              {upload.state === 'getting-url' && <span className="text-xs text-[var(--ink-3)]">Preparing upload…</span>}
              {upload.state === 'uploading' && (
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 rounded-full bg-[var(--ink)]/10 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${upload.percent}%`, background: 'var(--accent-text)' }} />
                  </div>
                  <span className="text-xs text-[var(--ink-3)]">{upload.percent}%</span>
                </div>
              )}
              {upload.state === 'done' && (
                <span className="text-xs text-[var(--green)] flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/><path d="M3.5 6l2 2 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                  Uploaded
                </span>
              )}
              {upload.state === 'error' && (
                <span className="text-xs text-[var(--red)]">{upload.error ?? 'Upload failed'}</span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs text-[var(--ink-3)] mb-1">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => handleFormChange('title', e.target.value)}
              placeholder="e.g. How to Run a Facebook Ad Campaign"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--ink-3)] mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => handleFormChange('description', e.target.value)}
              placeholder="What will studio owners learn from this?"
              rows={2}
              className={inputClass + ' resize-none'}
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--ink-3)] mb-1">Category (optional tag)</label>
            <input
              type="text"
              value={form.category}
              onChange={e => handleFormChange('category', e.target.value)}
              placeholder="e.g. Marketing, Operations, Finance"
              className={inputClass}
            />
          </div>

          {formError && (
            <p className="text-xs text-[var(--red)] bg-[var(--red-l)] px-3 py-2 rounded-lg">{formError}</p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || upload.state === 'uploading' || upload.state === 'getting-url'}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              style={{ background: 'var(--accent-text)' }}
            >
              {saving ? 'Saving…' : 'Save Item'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setForm(emptyForm()); setUpload({ state: 'idle', percent: 0 }); setFormError(null) }}
              className="px-4 py-2 rounded-lg text-sm text-[var(--ink-2)] hover:text-[var(--ink)] border border-[var(--ink)]/15 hover:border-[var(--ink)]/30 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Items list */}
      {items.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--surface)] flex items-center justify-center mb-4 text-[var(--ink-3)]">
            <VideoIcon />
          </div>
          <p className="text-sm text-[var(--ink-3)]">No items yet. Click &ldquo;Add Item&rdquo; to upload your first resource.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden"
            >
              {editingId === item.id ? (
                <div className="p-4 space-y-3">
                  <input
                    type="text"
                    value={editForm.title}
                    onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                    className={inputClass}
                  />
                  <textarea
                    value={editForm.description}
                    onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                    rows={2}
                    className={inputClass + ' resize-none'}
                  />
                  <input
                    type="text"
                    value={editForm.category}
                    onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                    placeholder="Category"
                    className={inputClass}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => handleUpdate(item.id)} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-90 disabled:opacity-50" style={{ background: 'var(--accent-text)' }}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-lg text-xs border border-[var(--ink)]/15 text-[var(--ink-2)] hover:text-[var(--ink)]">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4 p-4">
                  {/* Thumbnail / icon */}
                  <div className="shrink-0 w-16 h-12 rounded-lg overflow-hidden flex items-center justify-center bg-[var(--surface-2)]">
                    {item.type === 'video' && item.cf_uid ? (
                      <img
                        src={`https://cloudflarestream.com/${item.cf_uid}/thumbnails/thumbnail.jpg`}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-[var(--ink-3)]">
                        {item.type === 'video' ? <VideoIcon /> : <PdfIcon />}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[var(--ink)] truncate">{item.title}</p>
                      {item.category && (
                        <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-full border border-[var(--ink)]/12 text-[var(--ink-3)]">
                          {item.category}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-xs text-[var(--ink-3)] mt-0.5 truncate">{item.description}</p>
                    )}
                    <p className="text-xs text-[var(--ink-3)] mt-0.5 capitalize">{item.type} · #{idx + 1}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => startEdit(item)}
                      className="px-2.5 py-1 rounded-lg text-xs border border-[var(--ink)]/15 text-[var(--ink-2)] hover:text-[var(--ink)] hover:border-[var(--ink)]/30 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={deleting}
                      className="px-2.5 py-1 rounded-lg text-xs border border-[var(--red)]/20 text-[var(--red)] hover:bg-[var(--red-l)] disabled:opacity-50 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
