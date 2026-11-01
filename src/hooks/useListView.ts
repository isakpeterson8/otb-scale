'use client'

import { useCallback, useEffect, useMemo, useRef, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  DEFAULT_VIEW,
  VIEW_PARAM_KEYS,
  isDefaultView,
  parseListView,
  serializeListView,
  type ListView,
  type ListViewConfig,
  type PresetKey,
} from '@/lib/list-view'

// localStorage can throw (private mode, blocked site data) or be absent; the
// page must behave the same without it, so every access is wrapped.
function loadStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function saveStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // ignore — remembering the view is a convenience only
  }
}

/**
 * The current list view, read from the URL, plus setters that push a new URL.
 * The server page re-renders with the new query; `isPending` is true meanwhile.
 *
 * On first load with no view params in the URL, the user's last-used view for
 * this page is restored from localStorage (with router.replace, so it does not
 * add a history entry).
 */
export function useListView(config: ListViewConfig) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const view = useMemo(() => parseListView(searchParams, config), [searchParams, config])

  const buildUrl = useCallback((next: ListView) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const key of VIEW_PARAM_KEYS) params.delete(key)
    for (const [key, value] of Object.entries(serializeListView(next))) params.set(key, value)
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }, [pathname, searchParams])

  const navigate = useCallback((next: ListView, mode: 'push' | 'replace' = 'push') => {
    saveStored(config.storageKey, new URLSearchParams(serializeListView(next)).toString())
    startTransition(() => {
      router[mode](buildUrl(next), { scroll: false })
    })
  }, [buildUrl, config.storageKey, router])

  // Restore once per mount, and only when the URL carries no view of its own —
  // a bookmarked or shared URL always wins over the remembered view.
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    if (VIEW_PARAM_KEYS.some(key => searchParams.has(key))) return
    const stored = loadStored(config.storageKey)
    if (!stored) return
    const remembered = parseListView(new URLSearchParams(stored), config)
    if (!isDefaultView(remembered)) navigate(remembered, 'replace')
  }, [config, navigate, searchParams])

  const setView = useCallback((patch: Partial<ListView>) => {
    navigate({ ...view, ...patch })
  }, [navigate, view])

  /** Presets replace the filters (not the sort or grouping). */
  const applyPreset = useCallback((preset: PresetKey) => {
    navigate({ ...view, status: [], source: [], q: '', preset })
  }, [navigate, view])

  const reset = useCallback(() => navigate(DEFAULT_VIEW), [navigate])

  return { view, setView, applyPreset, reset, isPending, isDefault: isDefaultView(view) }
}
