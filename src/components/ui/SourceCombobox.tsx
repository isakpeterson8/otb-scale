'use client'

import { useId, useState } from 'react'
import type { FacetOption } from '@/lib/list-view'

/**
 * Source picker shared by the school and lead forms. Typing filters the
 * existing sources case-insensitively; picking one uses its exact spelling.
 *
 * - `allowCreate` (schools): when nothing matches exactly, offers
 *   `+ Add "<text>"`. Leaving the field with typed text that matches an
 *   existing source (ignoring case) snaps to that source's spelling.
 * - Without it (leads): only the given options can be chosen; typed text
 *   that matches no option reverts to the previous choice.
 *
 * The chosen value is posted through a hidden input named `name`; blank means
 * no source. Server actions normalize again, so this is a convenience, not
 * the safeguard.
 */
export default function SourceCombobox({
  name,
  label,
  options,
  defaultValue,
  allowCreate = false,
  placeholder = '',
  onChange,
}: {
  name: string
  label: string
  /** Each source once; `value` is what gets saved. */
  options: FacetOption[]
  defaultValue?: string | null
  allowCreate?: boolean
  placeholder?: string
  onChange?: (value: string) => void
}) {
  const id = useId()
  const listId = `${id}-list`
  const labelFor = (value: string) => options.find(o => o.value === value)?.label ?? value

  const [value, setValue] = useState(defaultValue?.trim() ?? '')
  const [text, setText] = useState(() => (defaultValue?.trim() ? labelFor(defaultValue.trim()) : ''))
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const query = text.trim().toLowerCase()
  const exact = (o: FacetOption) => o.label.toLowerCase() === query || o.value.toLowerCase() === query
  const matches = query
    ? options.filter(o => o.label.toLowerCase().includes(query) || o.value.toLowerCase().includes(query))
    : options
  const canCreate = allowCreate && query !== '' && !options.some(exact)
  const items: ({ kind: 'option'; option: FacetOption } | { kind: 'create'; text: string })[] = [
    ...matches.map(option => ({ kind: 'option' as const, option })),
    ...(canCreate ? [{ kind: 'create' as const, text: text.trim() }] : []),
  ]

  function commit(next: string, display: string) {
    setValue(next)
    setText(display)
    setOpen(false)
    if (next !== value) onChange?.(next)
  }

  function choose(index: number) {
    const item = items[index]
    if (!item) return
    if (item.kind === 'option') commit(item.option.value, item.option.label)
    else commit(item.text, item.text)
  }

  // Leaving the field settles whatever was typed.
  function settle() {
    if (!query) return commit('', '')
    const match = options.find(exact)
    if (match) return commit(match.value, match.label)
    if (allowCreate) return commit(text.trim(), text.trim())
    commit(value, value ? labelFor(value) : '')
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      else setActive(i => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && open) {
      // Pick the highlighted item instead of submitting the form.
      e.preventDefault()
      if (items.length) choose(Math.min(active, items.length - 1))
      else settle()
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
    }
  }

  const showList = open && items.length > 0
  const activeIndex = Math.min(active, items.length - 1)

  return (
    <div className="relative">
      <label htmlFor={id} className="block text-xs text-[var(--ink-3)] mb-1">{label}</label>
      <input type="hidden" name={name} value={value} />
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        maxLength={100}
        value={text}
        placeholder={placeholder}
        onChange={e => { setText(e.target.value); setOpen(true); setActive(0) }}
        onFocus={() => setOpen(true)}
        onBlur={settle}
        onKeyDown={onKeyDown}
        className="w-full px-3 py-2 rounded-lg border border-[var(--ink)]/15 bg-[var(--canvas)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-text)]"
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg border border-[var(--ink)]/15 bg-[var(--surface)] py-1 shadow-lg"
        >
          {items.map((item, i) => (
            <li
              key={item.kind === 'option' ? `o:${item.option.value}` : 'create'}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              // mousedown, not click: it fires before the input's blur settles the text.
              onMouseDown={e => { e.preventDefault(); choose(i) }}
              onMouseEnter={() => setActive(i)}
              className={[
                'px-3 py-2 text-sm cursor-pointer truncate',
                i === activeIndex ? 'bg-[var(--accent-light)] text-[var(--ink)]' : 'text-[var(--ink-2)]',
                item.kind === 'create' ? 'text-[var(--accent-text)]' : '',
              ].join(' ')}
            >
              {item.kind === 'option' ? item.option.label : `+ Add “${item.text}”`}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
