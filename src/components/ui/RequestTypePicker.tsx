'use client'

/**
 * The card-grid request-type picker. Lifted out of the Squarespace Concierge
 * form so Canva Edits renders the identical control rather than a second
 * look-alike. Generic over the value union so each caller keeps its own enum.
 */

export interface RequestTypeOption<T extends string> {
  value: T
  label: string
  description: string
}

interface Props<T extends string> {
  options: readonly RequestTypeOption<T>[]
  /** '' means nothing picked yet — callers treat that as invalid. */
  value: T | ''
  onChange: (value: T) => void
  label?: string
}

export default function RequestTypePicker<T extends string>({
  options,
  value,
  onChange,
  label = 'Request type',
}: Props<T>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-[var(--ink-3)]">
        {label} <span style={{ color: 'var(--red)' }}>*</span>
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={[
              'text-left px-4 py-3 rounded-lg border transition-all',
              value === opt.value
                ? 'border-[var(--accent-text)] bg-[var(--accent-text)]/5'
                : 'border-[var(--ink)]/12 hover:border-[var(--ink)]/25',
            ].join(' ')}
          >
            <p className="text-sm font-medium text-[var(--ink)]">{opt.label}</p>
            <p className="text-xs text-[var(--ink-3)] mt-0.5">{opt.description}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
