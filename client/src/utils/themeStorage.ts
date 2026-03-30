/** Must match inline script in `index.html` and `ThemeContext` — single source of truth for keys/values. */
export const THEME_STORAGE_KEY = 'theme';

export type ThemePreference = 'light' | 'dark';

/** Resolve initial theme before React (no localStorage in SSR — guard window). */
export function resolveInitialTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch {
    /* private mode */
  }
  return 'light';
}

export function applyThemeClass(theme: ThemePreference): void {
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}
