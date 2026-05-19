'use client'

import { useTransition } from 'react'
import { exitViewAs } from '@/app/actions/admin'

export function ViewAsBanner({ studioName }: { studioName: string }) {
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
      style={{ background: 'rgba(139,69,19,0.15)', color: '#c97b3a', borderBottom: '1px solid rgba(139,69,19,0.25)' }}
    >
      <span className="truncate mr-3 min-w-0">Viewing as {studioName} — Read only mode</span>
      <button
        onClick={handleExit}
        disabled={isPending}
        className="px-3 py-1 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
        style={{ background: 'rgba(139,69,19,0.2)', color: '#c97b3a' }}
      >
        {isPending ? 'Exiting…' : 'Exit View'}
      </button>
    </div>
  )
}
