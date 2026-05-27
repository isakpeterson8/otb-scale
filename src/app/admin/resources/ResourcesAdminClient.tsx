'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { createResource, updateResource, deleteResource } from '@/app/actions/resources'
import type { Resource } from '@/types/database'

const ICON_OPTIONS: { value: Resource['icon_type']; label: string }[] = [
  { value: 'doc',    label: 'Google Doc'    },
  { value: 'sheet',  label: 'Google Sheet'  },
  { value: 'slides', label: 'Google Slides' },
  { value: 'folder', label: 'Drive Folder'  },
  { value: 'form',   label: 'Google Form'   },
  { value: 'pdf',    label: 'PDF'           },
  { value: 'link',   label: 'Generic Link'  },
]

const ICON_COLOR: Record<Resource['icon_type'], string> = {
  doc:    '#4285F4',
  sheet:  '#0F9D58',
  slides: '#F4B400',
  folder: '#4285F4',
  form:   '#7B5EA7',
  pdf:    '#E53935',
  link:   'var(--ink-3)',
}

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]'

interface FormState {
  title: string
  description: string
  url: string
  icon_type: Resource['icon_type']
  category: string
}

const emptyForm = (): FormState => ({
  title: '',
  description: '',
  url: '',
  icon_type: 'link',
  category: '',
})

// ── Icon badge ────────────────────────────────────────────────────────────────
function IconBadge({ type }: { type: Resource['icon_type'] }) {
  const label = ICON_OPTIONS.find(o => o.value === type)?.label ?? type
  const color = ICON_COLOR[type]
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
    >
      {label}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ResourcesAdminClient({ items: initialItems }: { items: Resource[] }) {
  const [items, setItems]         = useState(initialItems)
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState<FormState>(emptyForm())
  const [formError, setFormError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm]   = useState<FormState>(emptyForm())

  const [saving, startSave]     = useTransition()
  const [deleting, startDelete] = useTransition()

  function openAdd() {
    setShowForm(true)
    setForm(emptyForm())
    setFormError(null)
    setEditingId(null)
  }

  function startEdit(item: Resource) {
    setEditingId(item.id)
    setEditForm({
      title:       item.title,
      description: item.description ?? '',
      url:         item.url,
      icon_type:   item.icon_type,
      category:    item.category ?? '',
    })
  }

  function handleSave() {
    if (!form.title.trim()) { setFormError('Title is required'); return }
    if (!form.url.trim())   { setFormError('URL is required'); return }
    setFormError(null)

    startSave(async () => {
      const result = await createResource(form)
      if (result.error) {
        setFormError(result.error)
      } else {
        setShowForm(false)
        setForm(emptyForm())
        window.location.reload()
      }
    })
  }

  function handleUpdate(id: string) {
    if (!editForm.title.trim()) return
    if (!editForm.url.trim())   return
    startSave(async () => {
      const result = await updateResource(id, editForm)
      if (!result.error) {
        setItems(prev =>
          prev.map(i =>
            i.id === id
              ? { ...i, ...editForm, description: editForm.description || null, category: editForm.category || null }
              : i,
          ),
        )
        setEditingId(null)
      }
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this resource? This cannot be undone.')) return
    startDelete(async () => {
      await deleteResource(id)
      setItems(prev => prev.filter(i => i.id !== id))
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/admin" className="text-sm hover:text-[var(--ink)] transition-colors" style={{ color: 'var(--ink-3)' }}>
              Admin
            </Link>
            <span className="text-sm" style={{ color: 'var(--ink-3)' }}>/</span>
            <span className="text-sm" style={{ color: 'var(--ink)' }}>Resources</span>
          </div>
          <h2 className="text-2xl" style={{ fontFamily: 'var(--font-heading)', color: 'var(--ink)' }}>
            Resources
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>
            {items.length} resource{items.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity"
          style={{ background: 'var(--accent-text)' }}
        >
          + Add Resource
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 p-5 space-y-4">
          <h3 className="text-sm font-medium" style={{ color: 'var(--ink)' }}>New Resource</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--ink-3)' }}>Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Studio Policies Template"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--ink-3)' }}>Category</label>
              <input
                type="text"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="e.g. Templates, Marketing"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--ink-3)' }}>URL *</label>
            <input
              type="url"
              value={form.url}
              onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              placeholder="https://docs.google.com/…"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--ink-3)' }}>Type</label>
              <select
                value={form.icon_type}
                onChange={e => setForm(f => ({ ...f, icon_type: e.target.value as Resource['icon_type'] }))}
                className={inputClass}
              >
                {ICON_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--ink-3)' }}>Description</label>
              <input
                type="text"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Short description (optional)"
                className={inputClass}
              />
            </div>
          </div>

          {formError && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--red)', background: 'rgba(122,40,40,0.1)' }}>
              {formError}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              style={{ background: 'var(--accent-text)' }}
            >
              {saving ? 'Saving…' : 'Save Resource'}
            </button>
            <button
              onClick={() => { setShowForm(false); setFormError(null) }}
              className="px-4 py-2 rounded-lg text-sm border border-[var(--ink)]/15 hover:border-[var(--ink)]/30 transition-colors"
              style={{ color: 'var(--ink-2)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Items list */}
      {items.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
            No resources yet. Click &ldquo;Add Resource&rdquo; to add your first link.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div
              key={item.id}
              className="rounded-xl border border-[var(--ink)]/8 overflow-hidden"
              style={{ background: 'var(--surface)' }}
            >
              {editingId === item.id ? (
                // ── Inline edit form ──
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Title"
                      className={inputClass}
                    />
                    <input
                      type="text"
                      value={editForm.category}
                      onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                      placeholder="Category"
                      className={inputClass}
                    />
                  </div>
                  <input
                    type="url"
                    value={editForm.url}
                    onChange={e => setEditForm(f => ({ ...f, url: e.target.value }))}
                    placeholder="URL"
                    className={inputClass}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select
                      value={editForm.icon_type}
                      onChange={e => setEditForm(f => ({ ...f, icon_type: e.target.value as Resource['icon_type'] }))}
                      className={inputClass}
                    >
                      {ICON_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={editForm.description}
                      onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Description"
                      className={inputClass}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdate(item.id)}
                      disabled={saving}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                      style={{ background: 'var(--accent-text)' }}
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 rounded-lg text-xs border border-[var(--ink)]/15"
                      style={{ color: 'var(--ink-2)' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                // ── Row view ──
                <div className="flex items-center gap-4 p-4">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
                        {item.title}
                      </p>
                      <IconBadge type={item.icon_type} />
                      {item.category && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded-full border border-[var(--ink)]/12"
                          style={{ color: 'var(--ink-3)' }}
                        >
                          {item.category}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-xs truncate" style={{ color: 'var(--ink-3)' }}>
                        {item.description}
                      </p>
                    )}
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs truncate block max-w-xs hover:underline"
                      style={{ color: 'var(--ink-3)' }}
                    >
                      {item.url.replace(/^https?:\/\//, '')}
                    </a>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => startEdit(item)}
                      className="px-2.5 py-1 rounded-lg text-xs border border-[var(--ink)]/15 hover:border-[var(--ink)]/30 transition-colors"
                      style={{ color: 'var(--ink-2)' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={deleting}
                      className="px-2.5 py-1 rounded-lg text-xs border border-[var(--red)]/20 hover:bg-[var(--red-l)] disabled:opacity-50 transition-colors"
                      style={{ color: 'var(--red)' }}
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
