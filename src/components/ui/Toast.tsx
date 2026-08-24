'use client'

import { useCallback, useEffect, useState } from 'react'

export type ToastKind = 'success' | 'error'

export interface ToastState {
  message: string
  kind: ToastKind
}

/**
 * Local toast state with auto-dismiss. Mirrors the inline pattern already used
 * in EducationClient, lifted so multiple pages can share it.
 */
export function useToast(timeoutMs = 4000) {
  const [toast, setToast] = useState<ToastState | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), timeoutMs)
    return () => clearTimeout(t)
  }, [toast, timeoutMs])

  const showToast = useCallback((message: string, kind: ToastKind = 'success') => {
    setToast({ message, kind })
  }, [])

  return { toast, showToast }
}

export default function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null

  const isError = toast.kind === 'error'

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg"
      style={{
        background: 'var(--surface)',
        color: isError ? 'var(--red)' : 'var(--ink)',
        border: `1px solid ${isError ? 'var(--red)' : 'rgba(255,248,240,0.12)'}`,
      }}
    >
      {toast.message}
    </div>
  )
}
