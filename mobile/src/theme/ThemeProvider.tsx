import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { applyThemeTokens, getThemeTokens } from './applyThemeTokens';
import { syncNativeChrome } from './syncNativeChrome';
import type { ThemeContextValue } from './syncNativeChrome';
import {
  applyDataTheme,
  getSystemTheme,
  persistThemePreference,
  readStoredThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from './themeStorage';

const ThemeContext = createContext<ThemeContextValue | null>(null);

const TRANSITION_MS = 220;

function readInitialState(): { preference: ThemePreference; resolved: ResolvedTheme } {
  const preference = readStoredThemePreference();
  const fromDom = document.documentElement.getAttribute('data-theme');
  const resolved: ResolvedTheme =
    fromDom === 'dark' || fromDom === 'light' ? fromDom : resolveTheme(preference);
  return { preference, resolved };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [{ preference, resolved }, setState] = useState(readInitialState);

  const applyResolved = useCallback((nextPreference: ThemePreference, nextResolved: ResolvedTheme) => {
    applyDataTheme(nextResolved);
    const tokens = applyThemeTokens(nextResolved);
    void syncNativeChrome(tokens, nextResolved);
    setState({ preference: nextPreference, resolved: nextResolved });
  }, []);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      persistThemePreference(next);
      const nextResolved = resolveTheme(next);
      applyResolved(next, nextResolved);
    },
    [applyResolved]
  );

  // Initial token sync + fade transition class on preference change
  useLayoutEffect(() => {
    applyDataTheme(resolved);
    const tokens = applyThemeTokens(resolved);
    void syncNativeChrome(tokens, resolved);
  }, [resolved]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('theme-transition');
    const t = window.setTimeout(() => root.classList.remove('theme-transition'), TRANSITION_MS);
    return () => window.clearTimeout(t);
  }, [resolved]);

  // Listen for Android system theme changes when preference is "system"
  useEffect(() => {
    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const sys = getSystemTheme();
      applyResolved('system', sys);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference, applyResolved]);

  // Re-apply when app returns to foreground (system theme may have changed)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (preference !== 'system') return;
      applyResolved('system', getSystemTheme());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [preference, applyResolved]);

  const tokens = useMemo(() => getThemeTokens(resolved), [resolved]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolved,
      tokens,
      setPreference,
      isDark: resolved === 'dark',
    }),
    [preference, resolved, tokens, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export type { ThemePreference, ResolvedTheme };
