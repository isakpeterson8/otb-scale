'use client'

import { useTransition } from 'react'
import { exitViewAs } from '@/app/actions/admin'

export function ViewAsBanner({ email }: { email: string }) {
  const [isPending, startTransition] = useTransition()

  function handleExit() {
    startTransition(async () => {
      await exitViewAs()
      window.location.href = '/admin'
    })
  }

  return (
    <div
      className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium"
      style={{ background: 'rgba(220,38,38,0.12)', color: '#b91c1c', borderBottom: '1px solid rgba(220,38,38,0.2)' }}
    >
      <span className="truncate mr-3 min-w-0">👁 Viewing as {email} — Read only mode</span>
      <button
        onClick={handleExit}
        disabled={isPending}
        className="px-3 py-1 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
        style={{ background: 'rgba(220,38,38,0.15)', color: '#b91c1c' }}
      >
        {isPending ? 'Exiting…' : 'Exit'}
      </button>
    </div>
  )
}
