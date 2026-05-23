import { brandColors } from './colors';
import type { ThemeTokens } from './lightTheme';

/** Dark theme — dark gray surfaces (not pure black) for OLED comfort + contrast. */
export const darkTheme: ThemeTokens = {
  mode: 'dark',
  bg: '#0F172A',
  bgCard: '#1E293B',
  bgOverlay: 'rgba(0, 0, 0, 0.65)',
  surfaceElevated: '#1E293B',
  text: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  textTertiary: '#64748B',
  border: '#334155',
  borderLight: '#1E293B',
  borderSubtle: 'rgba(148, 163, 184, 0.15)',
  shadowSm: '0 1px 2px rgba(0, 0, 0, 0.35)',
  shadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
  shadowLg: '0 8px 24px rgba(0, 0, 0, 0.45)',
  shadowXl: '0 16px 40px rgba(0, 0, 0, 0.5)',
  navBg: 'rgba(15, 23, 42, 0.95)',
  headerBg: 'rgba(15, 23, 42, 0.92)',
  skeletonFrom: '#334155',
  skeletonMid: '#475569',
  metaThemeColor: '#0F172A',
  statusBarStyle: 'dark',
  promoOverlay: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 55%)',
  inputBg: '#1E293B',
  toastBg: '#F1F5F9',
  toastText: '#0F172A',
  ...brandColors,
};
