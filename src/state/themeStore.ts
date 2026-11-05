import { create } from 'zustand'

/**
 * Which of the two palettes the interface is painted in.
 *
 * `system` defers to the operating system and keeps following it while the
 * player is in the game, so a theme switch on the device is picked up live.
 */
export type ThemeMode = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'

const STORAGE_KEY = 'businesslife-theme-v1'

function media(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia('(prefers-color-scheme: light)')
}

/** The palette a mode actually paints right now. */
export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'dark' || mode === 'light') return mode
  return media()?.matches ? 'light' : 'dark'
}

/**
 * Paints a mode onto the document. The stylesheets only read `data-theme`, so
 * this single attribute repaints the whole interface.
 */
export function applyTheme(mode: ThemeMode): void {
  const resolved = resolveTheme(mode)
  const root = document.documentElement
  root.dataset.theme = resolved
  root.style.colorScheme = resolved
}

function readStoredMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark' || stored === 'light' || stored === 'system') return stored
  } catch {
    // Private browsing or storage disabled: the default below still applies.
  }
  return 'system'
}

interface ThemeState {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: readStoredMode(),

  setMode: (mode) => {
    applyTheme(mode)
    try {
      window.localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // Not fatal: the choice still holds for this session.
    }
    set({ mode })
  },
}))

/**
 * Called once from the entry point, before the first render, so the saved
 * theme is already on <html> when the interface paints — no flash of the
 * wrong palette. Also wires `system` up to live OS changes.
 */
export function initTheme(): void {
  applyTheme(useThemeStore.getState().mode)

  const query = media()
  if (!query) return
  query.addEventListener('change', () => {
    if (useThemeStore.getState().mode === 'system') applyTheme('system')
  })
}
