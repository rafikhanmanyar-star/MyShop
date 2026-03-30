import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';
import {
  THEME_STORAGE_KEY,
  type ThemePreference,
  applyThemeClass,
  resolveInitialTheme,
} from '../utils/themeStorage';

function readThemeForReact(): ThemePreference {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) return 'dark';
  return resolveInitialTheme();
}

interface ThemeContextValue {
  theme: ThemePreference;
  setTheme: (t: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(() => readThemeForReact());

  useLayoutEffect(() => {
    applyThemeClass(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* quota / private mode */
    }
  }, [theme]);

  const setTheme = useCallback((t: ThemePreference) => setThemeState(t), []);
  const toggleTheme = useCallback(() => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark')), []);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
