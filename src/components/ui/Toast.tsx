'use client'

import { useCallback, useEffect, useState } from 'react'

export type ToastKind = 'success' | 'error'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastState {
  message: string
  kind: ToastKind
  /** Optional button, e.g. "Undo". Clicking it also dismisses the toast. */
  action?: ToastAction
  /** Overrides the hook's timeout for this toast. */
  durationMs?: number
}

/**
 * Local toast state with auto-dismiss. Mirrors the inline pattern already used
 * in EducationClient, lifted so multiple pages can share it.
 */
export function useToast(timeoutMs = 4000) {
  const [toast, setToast] = useState<ToastState | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.durationMs ?? timeoutMs)
    return () => clearTimeout(t)
  }, [toast, timeoutMs])

  const showToast = useCallback(
    (message: string, kind: ToastKind = 'success', opts: { action?: ToastAction; durationMs?: number } = {}) => {
      setToast({ message, kind, ...opts })
    },
    [],
  )
  const dismissToast = useCallback(() => setToast(null), [])

  return { toast, showToast, dismissToast }
}

export default function Toast({ toast, onDismiss }: { toast: ToastState | null; onDismiss?: () => void }) {
  if (!toast) return null

  const isError = toast.kind === 'error'

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-[70] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg"
      style={{
        background: 'var(--surface)',
        color: isError ? 'var(--red)' : 'var(--ink)',
        border: `1px solid ${isError ? 'var(--red)' : 'rgba(255,248,240,0.12)'}`,
      }}
    >
      <span>{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => { toast.action!.onClick(); onDismiss?.() }}
          className="shrink-0 rounded-md px-2 py-0.5 text-sm font-semibold text-[var(--accent-text)] underline-offset-2 hover:underline"
        >
          {toast.action.label}
        </button>
      )}
    </div>
  )
}
