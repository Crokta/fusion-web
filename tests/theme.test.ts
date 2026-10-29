import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, currentTheme, setTheme, storedTheme, THEME_KEY } from '@/lib/theme'

function systemPrefersLight(light: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: light && query.includes('light'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

describe('the theme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.head.innerHTML =
      '<meta name="color-scheme" content="dark light"><meta name="theme-color" content="#060b10">'
  })
  afterEach(() => vi.unstubAllGlobals())

  it('follows the system while nothing is kept', () => {
    systemPrefersLight(true)
    expect(storedTheme()).toBeNull()
    expect(currentTheme()).toBe('light')
    systemPrefersLight(false)
    expect(currentTheme()).toBe('dark')
  })

  it('keeps a choice over the system, and applies it to the page', () => {
    systemPrefersLight(true)
    setTheme('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    expect(currentTheme()).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute('content')).toBe(
      'dark',
    )
  })

  it('ignores a stored value it does not know', () => {
    systemPrefersLight(false)
    localStorage.setItem(THEME_KEY, 'sepia')
    expect(currentTheme()).toBe('dark')
  })

  it('sets the browser chrome colour for light', () => {
    applyTheme('light')
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#e9eef3',
    )
  })
})

describe('the theme across tabs', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('follows a switch made in another tab', async () => {
    const { renderHook, act } = await import('@testing-library/react')
    const { useTheme } = await import('@/lib/theme')
    systemPrefersLight(false)
    localStorage.setItem(THEME_KEY, 'dark')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
    act(() => {
      localStorage.setItem(THEME_KEY, 'light')
      window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY }))
    })
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
