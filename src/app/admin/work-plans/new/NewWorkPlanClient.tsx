'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createBlankWorkPlan, createWorkPlanFromTemplate } from '@/app/actions/work-plans'

const BLANK = '__blank__'
const INPUT =
  'w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]'

export default function NewWorkPlanClient({
  studios,
  templates,
  loadError,
}: {
  studios: { id: string; name: string }[]
  templates: { id: string; name: string; description: string | null }[]
  loadError: string | null
}) {
  const router = useRouter()
  const [studioId, setStudioId] = useState('')
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? BLANK)
  const [blankTitle, setBlankTitle] = useState('Work Plan')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isBlank = templateId === BLANK

  function handleCreate() {
    if (!studioId) {
      setError('Pick a studio first')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = isBlank
        ? await createBlankWorkPlan(studioId, blankTitle.trim() || 'Work Plan')
        : await createWorkPlanFromTemplate(templateId, studioId)
      if (result.error || !result.id) {
        setError(result.error ?? 'Could not create the plan')
        return
      }
      router.push(`/admin/work-plans/${result.id}`)
    })
  }

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <Link href="/admin/work-plans" className="text-xs text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
          ← Work Plans
        </Link>
        <h2 className="text-2xl text-[var(--ink)] mt-1" style={{ fontFamily: 'var(--font-heading)' }}>
          New work plan
        </h2>
      </div>

      {loadError && (
        <p className="text-xs text-[var(--red)] bg-[var(--red-l)] px-3 py-2 rounded-lg">Could not load options: {loadError}</p>
      )}

      <div>
        <label className="block text-xs text-[var(--ink-3)] mb-1">Studio *</label>
        <select value={studioId} onChange={e => setStudioId(e.target.value)} className={INPUT}>
          <option value="">— Select studio —</option>
          {studios.map(s => (
            <option key={s.id} value={s.id} className="bg-[var(--surface)]">{s.name}</option>
          ))}
        </select>
        {studios.length === 0 && (
          <p className="text-xs text-[var(--ink-3)] mt-1">
            No studios readable. Staff need the &quot;Staff can read studios&quot; policy from the work plan migration.
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs text-[var(--ink-3)] mb-1">Template</label>
        <select value={templateId} onChange={e => setTemplateId(e.target.value)} className={INPUT}>
          {templates.map(t => (
            <option key={t.id} value={t.id} className="bg-[var(--surface)]">{t.name}</option>
          ))}
          <option value={BLANK} className="bg-[var(--surface)]">Start blank</option>
        </select>
        {!isBlank && templates.find(t => t.id === templateId)?.description && (
          <p className="text-xs text-[var(--ink-3)] mt-1">
            {templates.find(t => t.id === templateId)?.description}
          </p>
        )}
      </div>

      {isBlank && (
        <div>
          <label className="block text-xs text-[var(--ink-3)] mb-1">Plan title</label>
          <input value={blankTitle} onChange={e => setBlankTitle(e.target.value)} className={INPUT} />
        </div>
      )}

      {error && <p className="text-xs text-[var(--red)] bg-[var(--red-l)] px-3 py-2 rounded-lg">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          onClick={handleCreate}
          disabled={isPending}
          className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--ink)] text-sm font-medium hover:bg-[var(--accent-text)] hover:text-[var(--canvas)] disabled:opacity-60 transition-colors"
        >
          {isPending ? 'Creating…' : isBlank ? 'Create blank plan' : 'Create from template'}
        </button>
        <Link href="/admin/work-plans" className="px-4 py-2 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
          Cancel
        </Link>
      </div>
    </div>
  )
}
