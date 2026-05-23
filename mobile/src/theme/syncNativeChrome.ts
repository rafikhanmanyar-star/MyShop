/** Sync meta theme-color; Capacitor StatusBar when available on native Android. */
import type { ThemeTokens } from './lightTheme';
import type { ResolvedTheme } from './themeStorage';

export async function syncNativeChrome(tokens: ThemeTokens, resolved: ResolvedTheme): Promise<void> {
  if (typeof document === 'undefined') return;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', tokens.metaThemeColor);

  const appleBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (appleBar) {
    appleBar.setAttribute('content', resolved === 'dark' ? 'black-translucent' : 'default');
  }

  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;

    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setBackgroundColor({ color: tokens.metaThemeColor });
    await StatusBar.setStyle({
      style: tokens.statusBarStyle === 'dark' ? Style.Dark : Style.Light,
    });
  } catch {
    /* web preview or plugin unavailable */
  }
}

export type ThemeContextValue = {
  preference: import('./themeStorage').ThemePreference;
  resolved: ResolvedTheme;
  tokens: ThemeTokens;
  setPreference: (next: import('./themeStorage').ThemePreference) => void;
  isDark: boolean;
};
