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
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
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
          <ul className="mt-3 space-y-1 rounded-lg bg-[var(--red-l)] px-3 py-2.5">
            {consequences.map((c) => (
              <li key={c} className="text-xs text-[var(--ink-2)]">• {c}</li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-xs text-[var(--ink-3)]">This cannot be undone.</p>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={isPending}>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Deleting…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
