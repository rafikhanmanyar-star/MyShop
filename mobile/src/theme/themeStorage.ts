/** Persisted user choice; `system` follows Android / OS color scheme. */
export const THEME_PREFERENCE_KEY = 'myshop_theme_preference';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const VALID: ThemePreference[] = ['system', 'light', 'dark'];

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && VALID.includes(value as ThemePreference);
}

/** Detect OS / browser dark mode (Android 10+ system theme). */
export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  return getSystemTheme();
}

/** Read stored preference before React paints (inline script + provider init). */
export function readStoredThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = localStorage.getItem(THEME_PREFERENCE_KEY);
    if (isThemePreference(stored)) return stored;
  } catch {
    /* private mode / quota */
  }
  return 'system';
}

export function persistThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_PREFERENCE_KEY, preference);
  } catch {
    /* ignore */
  }
}

/** Apply `data-theme` on <html> for CSS selectors (no flash when called from inline script). */
export function applyDataTheme(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved;
}

/** Bootstrap resolved theme before React — used in index.html inline script. */
export function bootstrapThemeFromStorage(): ResolvedTheme {
  const preference = readStoredThemePreference();
  const resolved = resolveTheme(preference);
  applyDataTheme(resolved);
  return resolved;
}
