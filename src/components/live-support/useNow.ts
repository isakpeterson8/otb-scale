'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * The current time, rounded down to `intervalMs` and re-rendering each tick.
 * null during the server render and hydration, so local-timezone text is only
 * produced in the browser and the two renders always agree.
 */
export function useNow(intervalMs = 10_000): Date | null {
  const subscribe = useCallback((onTick: () => void) => {
    const id = setInterval(onTick, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  const bucket = useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / intervalMs),
    () => null,
  )
  return bucket == null ? null : new Date(bucket * intervalMs)
}

export function fmtLocalDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  })
}
