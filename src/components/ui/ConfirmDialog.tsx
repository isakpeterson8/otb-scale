'use client'

import { useEffect } from 'react'
import Button from './Button'

interface ConfirmDialogProps {
  title: string
  /** Main body copy. Keep it specific about what is being removed. */
  message: string
  /** Optional list of side effects (e.g. cascading child records) shown as bullets. */
  consequences?: string[]
  confirmLabel?: string
  cancelLabel?: string
  isPending?: boolean
  /** Shown on the confirm button while isPending. */
  pendingLabel?: string
  /** 'danger' (default) is for deletes; 'default' for reversible confirmations. */
  tone?: 'danger' | 'default'
  /** Small print under the message. Defaults to "This cannot be undone." for danger, none otherwise. */
  note?: string | null
  /** Optional middle button, e.g. "Skip those". */
  secondary?: { label: string; onClick: () => void }
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  title,
  message,
  consequences,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  isPending = false,
  pendingLabel,
  tone = 'danger',
  note,
  secondary,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const smallPrint = note === undefined ? (tone === 'danger' ? 'This cannot be undone.' : null) : note

  // Escape closes the dialog — but never mid-request
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isPending) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isPending, onCancel])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
      onClick={() => { if (!isPending) onCancel() }}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-sm rounded-2xl border border-[var(--ink)]/8 bg-[var(--surface)] p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-dialog-title" className="text-base font-medium text-[var(--ink)]">
          {title}
        </h3>

        <p className="mt-2 text-sm text-[var(--ink-2)]">{message}</p>

        {consequences && consequences.length > 0 && (
          <ul className={`mt-3 space-y-1 rounded-lg px-3 py-2.5 ${tone === 'danger' ? 'bg-[var(--red-l)]' : 'bg-[var(--canvas)]'}`}>
            {consequences.map((c) => (
              <li key={c} className="text-xs text-[var(--ink-2)]">• {c}</li>
            ))}
          </ul>
        )}

        {smallPrint && <p className="mt-3 text-xs text-[var(--ink-3)]">{smallPrint}</p>}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={isPending}>
            {cancelLabel}
          </Button>
          {secondary && (
            <Button variant="ghost" onClick={secondary.onClick} disabled={isPending}>
              {secondary.label}
            </Button>
          )}
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} disabled={isPending}>
            {isPending ? (pendingLabel ?? (tone === 'danger' ? 'Deleting…' : 'Saving…')) : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
