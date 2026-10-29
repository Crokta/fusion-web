import { useCallback, useSyncExternalStore } from 'react'

/**
 * Light or dark, chosen with the switch in the top bar. The choice is kept per browser; with none
 * kept, the system's preference decides. index.html applies the same rule before first paint, so
 * the page never flashes the wrong theme (keep the two in step).
 */
export type Theme = 'dark' | 'light'

export const THEME_KEY = 'fusion.theme'
const SYSTEM_LIGHT = '(prefers-color-scheme: light)'
// The top bar's background in each theme, for the browser's own chrome.
const THEME_COLOR: Record<Theme, string> = { dark: '#060b10', light: '#e9eef3' }

export function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return value === 'dark' || value === 'light' ? value : null
  } catch {
    return null // storage blocked (private window, policy): fall back to the system
  }
}

export function systemTheme(): Theme {
  return window.matchMedia?.(SYSTEM_LIGHT).matches ? 'light' : 'dark'
}

export function currentTheme(): Theme {
  return storedTheme() ?? systemTheme()
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.dataset.theme = theme
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
}

const listeners = new Set<() => void>()

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Not kept, but still applied for this page.
  }
  applyTheme(theme)
  listeners.forEach((l) => l())
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  // The page and the switch read the same choice from here on.
  applyTheme(currentTheme())
  const mq = window.matchMedia?.(SYSTEM_LIGHT)
  // Follow the system while nothing is kept.
  const onSystem = () => {
    if (storedTheme() === null) {
      applyTheme(systemTheme())
      onChange()
    }
  }
  mq?.addEventListener('change', onSystem)
  // Another tab switched: follow it, so every tab shows the theme its switch says.
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY || e.key === null) {
      applyTheme(currentTheme())
      onChange()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(onChange)
    mq?.removeEventListener('change', onSystem)
    window.removeEventListener('storage', onStorage)
  }
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => 'dark' as Theme)
  const toggle = useCallback(() => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'), [])
  return { theme, setTheme, toggle }
}
