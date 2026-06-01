'use client'

import { useState, useTransition } from 'react'
import {
  createFacebookGroup,
  updateFacebookGroup,
  markPostCompletion,
  createPostAsset,
  deletePostAsset,
} from '@/app/actions/facebook-groups'
import type {
  FacebookGroup,
  GroupPostCompletion,
  GroupPostAsset,
  PostType,
  QualificationStatus,
} from '@/types/database'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  groups: FacebookGroup[]
  todayCompletions: GroupPostCompletion[]
  allCompletions: {
    group_id: string
    last_used_asset_id: string | null
    likes: number
    comments: number
    dms: number
    created_at: string
  }[]
  assets: GroupPostAsset[]
}

type FilterTab = 'all' | PostType

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const DAY_LABEL: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
}

const POST_TYPE_BADGE: Record<PostType, { label: string; bg: string; color: string }> = {
  self_promo:  { label: 'Self Promo',  bg: 'rgba(4,173,239,0.12)',  color: '#0284a8' },
  third_party: { label: 'Third Party', bg: 'rgba(109,40,217,0.1)',  color: '#6d28d9' },
  both:        { label: 'Both',        bg: 'rgba(0,0,0,0.07)',      color: '#374151' },
}

const QUAL_BADGE: Record<QualificationStatus, { label: string; shortLabel: string; bg: string; color: string; tooltip?: string }> = {
  active:                     { label: 'Active',        shortLabel: 'Active',      bg: 'rgba(22,163,74,0.12)',   color: '#15803d' },
  disqualified_low_engagement:{ label: 'Disqualified',  shortLabel: 'Disqualified',bg: 'rgba(220,38,38,0.1)',    color: '#b91c1c' },
  future_third_party:         { label: 'Future 3P',     shortLabel: 'Future 3P',   bg: 'rgba(180,83,9,0.12)',    color: '#b45309', tooltip: 'No self-promo rules — potential third-party posting fit' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getISOWeek(date: Date): number {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
  const w1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d.getTime() - w1.getTime()) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7)
}

function isDueToday(group: FacebookGroup): boolean {
  if (!group.post_frequency || !group.is_active) return false
  const now = new Date()
  const dayName = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()]
  const days = group.post_days ?? []

  switch (group.post_frequency) {
    case 'daily': return true
    case 'weekly': return days.includes(dayName)
    case 'biweekly': {
      if (!days.includes(dayName)) return false
      const week = getISOWeek(now)
      const pattern = group.post_week_pattern ?? 'both'
      if (pattern === 'a_week') return week % 2 === 1
      if (pattern === 'b_week') return week % 2 === 0
      return true
    }
    case 'monthly':
      return days.includes(dayName) && now.getDate() <= 7
    case 'bimonthly':
      return days.includes(dayName) && now.getDate() <= 7 && (now.getMonth() + 1) % 2 === 1
    default: return false
  }
}

function scheduleLabel(group: FacebookGroup): string {
  if (!group.post_frequency) return ''
  const freq = { daily: 'Daily', weekly: 'Weekly', biweekly: 'Biweekly', monthly: 'Monthly', bimonthly: 'Bimonthly' }[group.post_frequency]
  const days = (group.post_days ?? []).map(d => DAY_LABEL[d] ?? d).join(', ')
  if (!days) return freq
  return `${freq} · ${days}`
}

function lastPostedStyle(date: string | null): { bg: string; color: string } {
  if (!date) return { bg: 'rgba(220,38,38,0.1)', color: '#b91c1c' }
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000)
  if (days <= 7)  return { bg: 'rgba(22,163,74,0.12)',  color: '#15803d' }
  if (days <= 14) return { bg: 'rgba(180,83,9,0.12)',   color: '#b45309' }
  return { bg: 'rgba(220,38,38,0.1)', color: '#b91c1c' }
}

function formatDate(d: string | null) {
  if (!d) return 'Never'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function computeEngagement(allCompletions: Props['allCompletions']) {
  const map: Record<string, { likes: number; comments: number; dms: number }> = {}
  for (const c of allCompletions) {
    if (!map[c.group_id]) map[c.group_id] = { likes: 0, comments: 0, dms: 0 }
    map[c.group_id].likes += c.likes ?? 0
    map[c.group_id].comments += c.comments ?? 0
    map[c.group_id].dms += c.dms ?? 0
  }
  return map
}

function getLastUsedAssetId(groupId: string, allCompletions: Props['allCompletions']): string {
  const found = allCompletions.find(c => c.group_id === groupId && c.last_used_asset_id)
  return found?.last_used_asset_id ?? ''
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CheckCircleIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="10" fill="rgba(22,163,74,0.15)" />
      <path d="M5.5 10.5l3 3 6-6" stroke="#15803d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="9" stroke="rgba(255,248,240,0.25)" strokeWidth="1.5" />
    </svg>
  )
}

// ─── Todo Section ─────────────────────────────────────────────────────────────

function TodoSection({
  dueGroups,
  completions,
  assets,
  allCompletions,
}: {
  dueGroups: FacebookGroup[]
  completions: GroupPostCompletion[]
  assets: GroupPostAsset[]
  allCompletions: Props['allCompletions']
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [formState, setFormState] = useState({ assetId: '', likes: '', comments: '', dms: '' })
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const completedIds = new Set(completions.map(c => c.group_id))
  const doneCount = dueGroups.filter(g => completedIds.has(g.id)).length

  function handleToggle(group: FacebookGroup) {
    if (completedIds.has(group.id)) return
    if (expandedId === group.id) { setExpandedId(null); return }
    const lastAsset = getLastUsedAssetId(group.id, allCompletions)
    setFormState({ assetId: lastAsset, likes: '', comments: '', dms: '' })
    setExpandedId(group.id)
    setError(null)
  }

  function handleSubmit(groupId: string) {
    setError(null)
    startTransition(async () => {
      const result = await markPostCompletion(groupId, {
        assetId: formState.assetId || null,
        likes: parseInt(formState.likes) || 0,
        comments: parseInt(formState.comments) || 0,
        dms: parseInt(formState.dms) || 0,
      })
      if (result.error) setError(result.error)
      else setExpandedId(null)
    })
  }

  if (dueGroups.length === 0) return null

  return (
    <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--ink)]/8">
        <div>
          <h3 className="text-sm font-medium text-[var(--ink)]">Today&apos;s Posts</h3>
          <p className="text-xs text-[var(--ink-3)] mt-0.5">{doneCount} of {dueGroups.length} done</p>
        </div>
        {doneCount === dueGroups.length && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: 'rgba(22,163,74,0.12)', color: '#15803d' }}>
            All done ✓
          </span>
        )}
      </div>

      <div className="divide-y divide-[var(--ink)]/6">
        {dueGroups.map((group) => {
          const isDone = completedIds.has(group.id)
          const isExpanded = expandedId === group.id
          const groupAssets = assets.filter(a => a.group_id === group.id)
          const completionForToday = completions.find(c => c.group_id === group.id)

          return (
            <div key={group.id}>
              <button
                onClick={() => handleToggle(group)}
                disabled={isDone || isPending}
                className={[
                  'w-full flex items-center gap-3 px-5 py-3 text-left transition-colors',
                  isDone ? 'opacity-60 cursor-default' : 'hover:bg-[var(--canvas)]',
                ].join(' ')}
              >
                <CheckCircleIcon filled={isDone} />
                <div className="flex-1 min-w-0">
                  <span className={['text-sm font-medium truncate block', isDone ? 'line-through text-[var(--ink-3)]' : 'text-[var(--ink)]'].join(' ')}>
                    {group.group_name}
                  </span>
                  <span className="text-xs text-[var(--ink-3)]">{scheduleLabel(group)}</span>
                </div>
                {isDone && completionForToday && (
                  <span className="text-xs text-[var(--ink-3)] shrink-0">
                    {completionForToday.likes + completionForToday.comments + completionForToday.dms > 0
                      ? `♥${completionForToday.likes} 💬${completionForToday.comments} ✉${completionForToday.dms}`
                      : 'Posted'}
                  </span>
                )}
                {!isDone && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className={['text-[var(--ink-3)] transition-transform', isExpanded ? 'rotate-180' : ''].join(' ')}>
                    <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>

              {isExpanded && !isDone && (
                <div className="px-5 pb-4 pt-2 bg-[var(--canvas)] border-t border-[var(--ink)]/6 space-y-3">
                  {groupAssets.length > 0 && (
                    <div>
                      <label className="block text-xs text-[var(--ink-3)] mb-1">Post variant used</label>
                      <select
                        value={formState.assetId}
                        onChange={e => setFormState(s => ({ ...s, assetId: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--surface)] text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
                      >
                        <option value="">No specific variant</option>
                        {groupAssets.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.label ? `${a.label} — ` : ''}{a.type === 'image' ? '🖼 ' : ''}{a.content.length > 60 ? a.content.slice(0, 60) + '…' : a.content}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs text-[var(--ink-3)] mb-1">Engagement (optional)</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([['likes', '♥ Likes'], ['comments', '💬 Comments'], ['dms', '✉ DMs']] as const).map(([field, placeholder]) => (
                        <input
                          key={field}
                          type="number"
                          min="0"
                          placeholder={placeholder}
                          value={formState[field]}
                          onChange={e => setFormState(s => ({ ...s, [field]: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--surface)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
                        />
                      ))}
                    </div>
                  </div>

                  {error && (
                    <p className="text-xs text-[var(--red)]">{error}</p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSubmit(group.id)}
                      disabled={isPending}
                      className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60 transition-colors"
                      style={{ background: 'rgba(22,163,74,0.15)', color: '#15803d' }}
                    >
                      {isPending ? 'Saving…' : 'Mark Done'}
                    </button>
                    <button
                      onClick={() => setExpandedId(null)}
                      className="px-4 py-2 rounded-lg text-sm text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Post Assets Section ──────────────────────────────────────────────────────

function PostAssetsSection({
  groupId,
  groupAssets,
}: {
  groupId: string
  groupAssets: GroupPostAsset[]
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [addType, setAddType] = useState<'copy' | 'image'>('copy')
  const [addContent, setAddContent] = useState('')
  const [addLabel, setAddLabel] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleAdd() {
    if (!addContent.trim()) return
    setError(null)
    startTransition(async () => {
      const result = await createPostAsset(groupId, addType, addContent.trim(), addLabel.trim())
      if (result.error) setError(result.error)
      else { setShowAdd(false); setAddContent(''); setAddLabel('') }
    })
  }

  function handleDelete(assetId: string) {
    startTransition(async () => {
      await deletePostAsset(assetId)
    })
  }

  return (
    <div className="border-t border-[var(--ink)]/8 pt-4 mt-2">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-medium text-[var(--ink-2)] uppercase tracking-wide">Post Assets</h4>
        <button
          type="button"
          onClick={() => setShowAdd(v => !v)}
          className="text-xs text-[var(--accent-text)] hover:underline"
        >
          + Add variant
        </button>
      </div>

      {groupAssets.length === 0 && !showAdd && (
        <p className="text-xs text-[var(--ink-3)] italic">No assets yet. Add copy or image variants to track what you post.</p>
      )}

      {groupAssets.length > 0 && (
        <div className="space-y-2 mb-3">
          {groupAssets.map(asset => (
            <div key={asset.id} className="flex items-start gap-2 p-2.5 rounded-lg border border-[var(--ink)]/8 bg-[var(--canvas)]">
              <span className="shrink-0 mt-0.5 text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: asset.type === 'copy' ? 'rgba(4,173,239,0.12)' : 'rgba(109,40,217,0.1)', color: asset.type === 'copy' ? '#0284a8' : '#6d28d9' }}>
                {asset.type === 'copy' ? 'Copy' : 'Image'}
              </span>
              <div className="flex-1 min-w-0">
                {asset.label && <p className="text-xs font-medium text-[var(--ink-2)] mb-0.5">{asset.label}</p>}
                <p className="text-xs text-[var(--ink-3)] break-words">{asset.content}</p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(asset.id)}
                disabled={isPending}
                className="shrink-0 p-1 text-[var(--ink-3)] hover:text-[var(--red)] transition-colors disabled:opacity-40"
                title="Delete"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="space-y-2 p-3 rounded-lg border border-[var(--ink)]/8 bg-[var(--canvas)]">
          <div className="flex gap-2">
            <select
              value={addType}
              onChange={e => setAddType(e.target.value as 'copy' | 'image')}
              className="px-2.5 py-1.5 rounded-lg border border-[var(--ink)]/15 bg-[var(--surface)] text-xs text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
            >
              <option value="copy">Copy</option>
              <option value="image">Image</option>
            </select>
            <input
              type="text"
              placeholder="Label (optional)"
              value={addLabel}
              onChange={e => setAddLabel(e.target.value)}
              className="flex-1 px-2.5 py-1.5 rounded-lg border border-[var(--ink)]/15 bg-[var(--surface)] text-xs text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
            />
          </div>
          <textarea
            placeholder={addType === 'copy' ? 'Post copy text…' : 'Image URL…'}
            value={addContent}
            onChange={e => setAddContent(e.target.value)}
            rows={addType === 'copy' ? 3 : 1}
            className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--surface)] text-xs text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)] resize-none"
          />
          {error && <p className="text-xs text-[var(--red)]">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={isPending || !addContent.trim()}
              className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--ink)] text-xs font-medium hover:bg-[var(--accent-text)] hover:text-[var(--canvas)] disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Saving…' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => { setShowAdd(false); setAddContent(''); setAddLabel('') }}
              className="px-3 py-1.5 text-xs text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Group Form ───────────────────────────────────────────────────────────────

function GroupForm({
  group,
  groupAssets,
  onClose,
}: {
  group?: FacebookGroup
  groupAssets: GroupPostAsset[]
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [freq, setFreq] = useState<string>(group?.post_frequency ?? '')
  const [selectedDays, setSelectedDays] = useState<string[]>(group?.post_days ?? [])

  function toggleDay(day: string) {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = group
        ? await updateFacebookGroup(group.id, fd)
        : await createFacebookGroup(fd)
      if (result.error) setError(result.error)
      else onClose()
    })
  }

  const field = (label: string, name: string, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-xs text-[var(--ink-3)] mb-1">{label}</label>
      <input
        name={name}
        type={type}
        defaultValue={group ? (group[name as keyof FacebookGroup] as string | number | null) ?? '' : ''}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
      />
    </div>
  )

  const showDays = freq && freq !== 'daily'

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pr-1">
      {field('Group Name *', 'group_name', 'text', 'Piano Moms of Austin')}
      {field('Group URL', 'group_url', 'url', 'https://facebook.com/groups/...')}
      <div className="grid grid-cols-2 gap-3">
        {field('Location', 'group_location', 'text', 'Austin, TX')}
        {field('Members', 'group_membership_size', 'number', '8800')}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[var(--ink-3)] mb-1">Post Type</label>
          <select
            name="post_type"
            defaultValue={group?.post_type ?? 'both'}
            className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
          >
            <option value="self_promo">Self Promo</option>
            <option value="third_party">Third Party</option>
            <option value="both">Both</option>
          </select>
        </div>
        {field('Shared With', 'shared_with', 'text', 'Partner name or —')}
      </div>
      <div>
        <label className="block text-xs text-[var(--ink-3)] mb-1">Posting Rules</label>
        <input
          name="posting_rules"
          type="text"
          defaultValue={group?.posting_rules ?? ''}
          placeholder="e.g. Sunday self-promo only"
          className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {field('Application Date', 'application_date', 'date')}
        {field('Acceptance Date', 'acceptance_date', 'date')}
        {field('Last Post Date', 'most_recent_post_date', 'date')}
      </div>

      {/* Schedule section */}
      <div className="border-t border-[var(--ink)]/8 pt-3 space-y-3">
        <p className="text-xs font-medium text-[var(--ink-2)] uppercase tracking-wide">Posting Schedule</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--ink-3)] mb-1">Frequency</label>
            <select
              name="post_frequency"
              value={freq}
              onChange={e => setFreq(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
            >
              <option value="">No schedule</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
              <option value="bimonthly">Bimonthly</option>
            </select>
          </div>
          {freq === 'biweekly' && (
            <div>
              <label className="block text-xs text-[var(--ink-3)] mb-1">Week Pattern</label>
              <select
                name="post_week_pattern"
                defaultValue={group?.post_week_pattern ?? 'both'}
                className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
              >
                <option value="both">Both weeks</option>
                <option value="a_week">A-Week (odd)</option>
                <option value="b_week">B-Week (even)</option>
              </select>
            </div>
          )}
        </div>

        {showDays && (
          <div>
            <label className="block text-xs text-[var(--ink-3)] mb-1.5">Day(s) of week</label>
            {/* Hidden inputs submit selected days as form values */}
            {selectedDays.map(day => (
              <input key={day} type="hidden" name="post_days" value={day} />
            ))}
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map(day => {
                const active = selectedDays.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
                    style={{
                      background: active ? 'rgba(73,37,47,0.25)' : 'transparent',
                      color: active ? 'var(--accent-text)' : 'var(--ink-3)',
                      borderColor: active ? 'var(--accent-text)' : 'rgba(255,248,240,0.15)',
                    }}
                  >
                    {DAY_LABEL[day]}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Qualification status */}
      <div>
        <label className="block text-xs text-[var(--ink-3)] mb-1">Qualification Status</label>
        <select
          name="qualification_status"
          defaultValue={group?.qualification_status ?? 'active'}
          className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
        >
          <option value="active">Active</option>
          <option value="disqualified_low_engagement">Disqualified (Low Engagement)</option>
          <option value="future_third_party">Future Third Party</option>
        </select>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <input
          type="checkbox"
          id="is_active"
          name="is_active"
          value="true"
          defaultChecked={group?.is_active ?? true}
          className="rounded"
        />
        <label htmlFor="is_active" className="text-sm text-[var(--ink-2)]">Active group</label>
      </div>

      {error && (
        <p className="text-xs text-[var(--red)] bg-[var(--red-l)] px-3 py-2 rounded-lg">{error}</p>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ink)]/8">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--ink)] text-sm font-medium hover:bg-[var(--accent-text)] hover:text-[var(--canvas)] disabled:opacity-60 transition-colors"
        >
          {isPending ? 'Saving…' : group ? 'Save changes' : 'Add group'}
        </button>
      </div>

      {/* Post Assets — only for existing groups */}
      {group && (
        <PostAssetsSection groupId={group.id} groupAssets={groupAssets} />
      )}
    </form>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FacebookGroupsClient({ groups, todayCompletions, allCompletions, assets }: Props) {
  const [filter, setFilter] = useState<FilterTab>('all')
  const [showForm, setShowForm] = useState(false)
  const [editGroup, setEditGroup] = useState<FacebookGroup | null>(null)

  const weekAgo  = new Date(Date.now() - 7  * 86_400_000).toISOString().slice(0, 10)
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)

  const activeGroups    = groups.filter(g => g.is_active).length
  const postedThisWeek  = groups.filter(g => g.most_recent_post_date && g.most_recent_post_date >= weekAgo).length
  const postedThisMonth = groups.filter(g => g.most_recent_post_date && g.most_recent_post_date >= monthAgo).length

  const filtered = filter === 'all' ? groups : groups.filter(g => g.post_type === filter)
  const dueToday = groups.filter(isDueToday)

  const engagement = computeEngagement(allCompletions)

  // For the edit modal, find fresh group data from the props (post-revalidation)
  const editGroupFresh = editGroup
    ? (groups.find(g => g.id === editGroup.id) ?? editGroup)
    : null

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all',         label: `All (${groups.length})` },
    { key: 'self_promo',  label: `Self Promo (${groups.filter(g => g.post_type === 'self_promo').length})` },
    { key: 'third_party', label: `Third Party (${groups.filter(g => g.post_type === 'third_party').length})` },
    { key: 'both',        label: `Both (${groups.filter(g => g.post_type === 'both').length})` },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-heading)' }}>
            Facebook Groups
          </h2>
          <p className="text-sm text-[var(--ink-3)] mt-0.5">Lead generation group tracker</p>
        </div>
        <button
          onClick={() => { setEditGroup(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--ink)] text-sm font-medium hover:bg-[var(--accent-text)] hover:text-[var(--canvas)] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Add group
        </button>
      </div>

      {/* Today's To-Do */}
      {dueToday.length > 0 && (
        <TodoSection
          dueGroups={dueToday}
          completions={todayCompletions}
          assets={assets}
          allCompletions={allCompletions}
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Groups',      value: groups.length },
          { label: 'Active Groups',     value: activeGroups },
          { label: 'Posted This Week',  value: postedThisWeek },
          { label: 'Posted This Month', value: postedThisMonth },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 px-5 py-4">
            <p className="text-xs text-[var(--ink-3)] mb-2 uppercase tracking-wide font-medium">{label}</p>
            <p className="text-3xl text-[var(--ink)] leading-none" style={{ fontFamily: 'var(--font-heading)' }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--ink)]/8 overflow-x-auto">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={[
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
              filter === key
                ? 'text-[var(--ink)] border-[var(--accent-text)]'
                : 'text-[var(--ink-3)] border-transparent hover:text-[var(--ink-2)]',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Modal */}
      {(showForm || editGroupFresh) && (
        <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:bg-black/50 sm:px-4">
          <div className="flex-1 overflow-y-auto bg-[var(--surface)] sm:flex-none sm:rounded-2xl sm:border sm:border-[var(--ink)]/8 sm:max-h-[90vh] sm:w-full sm:max-w-lg p-6 flex flex-col">
            {/* Modal header with engagement totals for edit */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-base font-medium text-[var(--ink)]">
                  {editGroupFresh ? 'Edit group' : 'Add Facebook group'}
                </h3>
                {editGroupFresh && engagement[editGroupFresh.id] && (
                  <p className="text-xs text-[var(--ink-3)] mt-1">
                    All-time: ♥{engagement[editGroupFresh.id].likes} likes · 💬{engagement[editGroupFresh.id].comments} comments · ✉{engagement[editGroupFresh.id].dms} DMs
                  </p>
                )}
              </div>
              <button
                onClick={() => { setShowForm(false); setEditGroup(null) }}
                className="p-2 text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <GroupForm
              group={editGroupFresh ?? undefined}
              groupAssets={editGroupFresh ? assets.filter(a => a.group_id === editGroupFresh.id) : []}
              onClose={() => { setShowForm(false); setEditGroup(null) }}
            />
          </div>
        </div>
      )}

      {/* Group list */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-[var(--ink-3)]">No groups yet. Add your first Facebook group.</p>
          </div>
        ) : (
          <>
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-[var(--ink)]/6">
              {filtered.map((group) => {
                const postBadge = group.post_type ? POST_TYPE_BADGE[group.post_type] : null
                const dateStyle = lastPostedStyle(group.most_recent_post_date)
                const qualBadge = QUAL_BADGE[group.qualification_status ?? 'active']
                const eng = engagement[group.id]
                return (
                  <div key={group.id} className={`p-4 space-y-2${!group.is_active ? ' opacity-50' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[var(--ink)] text-sm">
                          {group.group_url
                            ? <a href={group.group_url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent-text)] transition-colors">{group.group_name}</a>
                            : group.group_name}
                        </p>
                        {group.shared_with && (
                          <p className="text-xs text-[var(--ink-3)] mt-0.5">Shared with {group.shared_with}</p>
                        )}
                      </div>
                      {postBadge && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0" style={{ background: postBadge.bg, color: postBadge.color }}>
                          {postBadge.label}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: dateStyle.bg, color: dateStyle.color }}>
                        {formatDate(group.most_recent_post_date)}
                      </span>
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: qualBadge.bg, color: qualBadge.color }}
                        title={qualBadge.tooltip}
                      >
                        {qualBadge.shortLabel}
                      </span>
                      {eng && (eng.likes + eng.comments + eng.dms) > 0 && (
                        <span className="text-xs text-[var(--ink-3)]">♥{eng.likes} 💬{eng.comments} ✉{eng.dms}</span>
                      )}
                    </div>
                    {group.post_frequency && (
                      <p className="text-xs text-[var(--ink-3)]">{scheduleLabel(group)}</p>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => setEditGroup(group)}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium text-[var(--ink-2)] min-h-[40px]"
                        style={{ background: 'rgba(0,0,0,0.05)' }}
                      >
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                          <path d="M8.5 1.5l2 2-6 6H2.5v-2l6-6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                        </svg>
                        Edit
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <div
                className="grid items-center gap-3 px-5 py-2.5 border-b border-[var(--ink)]/8"
                style={{ gridTemplateColumns: '1fr 110px 100px 110px 130px 90px 130px' }}
              >
                {['Group Name', 'Shared With', 'Post Type', 'Status', 'Last Posted', 'Engagement', ''].map(h => (
                  <span key={h} className="text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">{h}</span>
                ))}
              </div>
              <div className="divide-y divide-[var(--ink)]/6">
                {filtered.map((group) => {
                  const postBadge = group.post_type ? POST_TYPE_BADGE[group.post_type] : null
                  const dateStyle = lastPostedStyle(group.most_recent_post_date)
                  const qualBadge = QUAL_BADGE[group.qualification_status ?? 'active']
                  const eng = engagement[group.id]
                  return (
                    <div
                      key={group.id}
                      className={`grid items-center gap-3 px-5 py-3.5 hover:bg-[var(--canvas)] transition-colors${!group.is_active ? ' opacity-50' : ''}`}
                      style={{ gridTemplateColumns: '1fr 110px 100px 110px 130px 90px 130px' }}
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-[var(--ink)] truncate block text-sm">
                          {group.group_url
                            ? <a href={group.group_url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent-text)] transition-colors">{group.group_name}</a>
                            : group.group_name}
                        </span>
                        {group.post_frequency && (
                          <span className="text-xs text-[var(--ink-3)] truncate block">{scheduleLabel(group)}</span>
                        )}
                      </div>
                      <span className="text-sm text-[var(--ink-2)] truncate">{group.shared_with ?? '—'}</span>
                      <span>
                        {postBadge
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: postBadge.bg, color: postBadge.color }}>{postBadge.label}</span>
                          : <span className="text-[var(--ink-3)] text-xs">—</span>}
                      </span>
                      <span>
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: qualBadge.bg, color: qualBadge.color }}
                          title={qualBadge.tooltip}
                        >
                          {qualBadge.shortLabel}
                        </span>
                      </span>
                      <span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: dateStyle.bg, color: dateStyle.color }}>
                          {formatDate(group.most_recent_post_date)}
                        </span>
                      </span>
                      <span className="text-xs text-[var(--ink-3)]">
                        {eng && (eng.likes + eng.comments + eng.dms) > 0
                          ? `♥${eng.likes} 💬${eng.comments} ✉${eng.dms}`
                          : '—'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setEditGroup(group)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--ink-2)] whitespace-nowrap"
                          style={{ background: 'rgba(0,0,0,0.05)' }}
                        >
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                            <path d="M8.5 1.5l2 2-6 6H2.5v-2l6-6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                          </svg>
                          Edit
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
