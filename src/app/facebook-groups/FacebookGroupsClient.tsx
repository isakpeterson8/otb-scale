'use client'

import { useState, useTransition } from 'react'
import {
  createFacebookGroup,
  updateFacebookGroup,
  logPost,
} from '@/app/actions/facebook-groups'
import type { FacebookGroup, PostType } from '@/types/database'

interface Props {
  groups: FacebookGroup[]
}

type FilterTab = 'all' | PostType

const POST_TYPE_BADGE: Record<PostType, { label: string; bg: string; color: string }> = {
  self_promo:  { label: 'Self Promo',   bg: 'rgba(4,173,239,0.12)',   color: '#0284a8' },
  third_party: { label: 'Third Party',  bg: 'rgba(109,40,217,0.1)',   color: '#6d28d9' },
  both:        { label: 'Both',         bg: 'rgba(0,0,0,0.07)',       color: '#374151' },
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

function GroupForm({
  group,
  onClose,
}: {
  group?: FacebookGroup
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

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

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
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
      <div className="grid grid-cols-3 gap-3">
        {field('Application Date', 'application_date', 'date')}
        {field('Acceptance Date', 'acceptance_date', 'date')}
        {field('Last Post Date', 'most_recent_post_date', 'date')}
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
    </form>
  )
}

export default function FacebookGroupsClient({ groups }: Props) {
  const [filter, setFilter] = useState<FilterTab>('all')
  const [showForm, setShowForm] = useState(false)
  const [editGroup, setEditGroup] = useState<FacebookGroup | null>(null)
  const [isPending, startTransition] = useTransition()

  const weekAgo  = new Date(Date.now() - 7  * 86_400_000).toISOString().slice(0, 10)
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)

  const activeGroups    = groups.filter((g) => g.is_active).length
  const postedThisWeek  = groups.filter((g) => g.most_recent_post_date && g.most_recent_post_date >= weekAgo).length
  const postedThisMonth = groups.filter((g) => g.most_recent_post_date && g.most_recent_post_date >= monthAgo).length

  const filtered = filter === 'all' ? groups : groups.filter((g) => g.post_type === filter)

  function handleLogPost(id: string) {
    startTransition(async () => { await logPost(id) })
  }

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all',         label: `All (${groups.length})` },
    { key: 'self_promo',  label: `Self Promo (${groups.filter((g) => g.post_type === 'self_promo').length})` },
    { key: 'third_party', label: `Third Party (${groups.filter((g) => g.post_type === 'third_party').length})` },
    { key: 'both',        label: `Both (${groups.filter((g) => g.post_type === 'both').length})` },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
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

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Groups',       value: groups.length },
          { label: 'Active Groups',      value: activeGroups },
          { label: 'Posted This Week',   value: postedThisWeek },
          { label: 'Posted This Month',  value: postedThisMonth },
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
      <div className="flex items-center gap-1 border-b border-[var(--ink)]/8">
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
      {(showForm || editGroup) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg bg-[var(--surface)] rounded-2xl border border-[var(--ink)]/8 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-medium text-[var(--ink)]">
                {editGroup ? 'Edit group' : 'Add Facebook group'}
              </h3>
              <button
                onClick={() => { setShowForm(false); setEditGroup(null) }}
                className="text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <GroupForm
              group={editGroup ?? undefined}
              onClose={() => { setShowForm(false); setEditGroup(null) }}
            />
          </div>
        </div>
      )}

      {/* Group list */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--ink)]/8 overflow-hidden">
        {/* Column headers */}
        <div className="grid items-center gap-3 px-5 py-2.5 border-b border-[var(--ink)]/8"
          style={{ gridTemplateColumns: '1fr 140px 120px 140px 170px' }}>
          <span className="text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Group Name</span>
          <span className="text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Shared With</span>
          <span className="text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Post Type</span>
          <span className="text-xs text-[var(--ink-3)] font-medium uppercase tracking-wide">Last Posted</span>
          <span />
        </div>

        {filtered.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-[var(--ink-3)]">No groups yet. Add your first Facebook group.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--ink)]/6">
            {filtered.map((group) => {
              const postBadge = group.post_type ? POST_TYPE_BADGE[group.post_type] : null
              const dateStyle = lastPostedStyle(group.most_recent_post_date)
              return (
                <div
                  key={group.id}
                  className={`grid items-center gap-3 px-5 py-3.5 hover:bg-[var(--canvas)] transition-colors${!group.is_active ? ' opacity-50' : ''}`}
                  style={{ gridTemplateColumns: '1fr 140px 120px 140px 170px' }}
                >
                  {/* Group name */}
                  <span className="font-medium text-[var(--ink)] truncate">
                    {group.group_url ? (
                      <a
                        href={group.group_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-[var(--accent-text)] transition-colors"
                      >
                        {group.group_name}
                      </a>
                    ) : group.group_name}
                  </span>

                  {/* Shared with */}
                  <span className="text-sm text-[var(--ink-2)] truncate">
                    {group.shared_with ?? '—'}
                  </span>

                  {/* Post type badge */}
                  <span>
                    {postBadge ? (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: postBadge.bg, color: postBadge.color }}
                      >
                        {postBadge.label}
                      </span>
                    ) : <span className="text-[var(--ink-3)] text-xs">—</span>}
                  </span>

                  {/* Last posted */}
                  <span>
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: dateStyle.bg, color: dateStyle.color }}
                    >
                      {formatDate(group.most_recent_post_date)}
                    </span>
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleLogPost(group.id)}
                      disabled={isPending}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                      style={{ background: 'rgba(22,163,74,0.12)', color: '#15803d' }}
                    >
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path d="M2 6.5l2.5 2.5 5.5-5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Posted Today
                    </button>
                    <button
                      onClick={() => setEditGroup(group)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--ink-2)] hover:text-[var(--ink)] transition-colors whitespace-nowrap"
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
        )}
      </div>
    </div>
  )
}
