import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

/** A shared ticking clock; components re-render once per `intervalMs`. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

const reducedQuery = '(prefers-reduced-motion: reduce)'
export function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia?.(reducedQuery)
      mq?.addEventListener('change', cb)
      return () => mq?.removeEventListener('change', cb)
    },
    () => window.matchMedia?.(reducedQuery).matches ?? false,
    () => false,
  )
}

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia?.(query)
      mq?.addEventListener('change', cb)
      return () => mq?.removeEventListener('change', cb)
    },
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  )
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))

/**
 * Global keyboard shortcut. `combo` is e.g. "mod+k", "shift+?", "g w" is not supported —
 * Fusion keeps shortcuts single-chord so they are easy to learn on a watch floor.
 * Plain-letter shortcuts are ignored while the user is typing.
 */
export function useHotkey(combo: string, handler: (e: KeyboardEvent) => void, enabled = true) {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => {
    if (!enabled) return
    const parts = combo.toLowerCase().split('+')
    const key = parts.pop()!
    const mod = parts.includes('mod')
    const shift = parts.includes('shift')
    const alt = parts.includes('alt')
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key) return
      if (mod !== (e.metaKey || e.ctrlKey)) return
      if (alt !== e.altKey) return
      if (shift && !e.shiftKey) return
      if (!mod && isTyping(e.target)) return
      ref.current(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [combo, enabled])
}
