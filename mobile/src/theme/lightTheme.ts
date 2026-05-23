import { brandColors } from './colors';

export type ThemeMode = 'light' | 'dark';
export type StatusBarStyle = 'light' | 'dark';

export interface ThemeTokens {
  mode: ThemeMode;
  bg: string;
  bgCard: string;
  bgOverlay: string;
  surfaceElevated: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textTertiary: string;
  border: string;
  borderLight: string;
  borderSubtle: string;
  shadowSm: string;
  shadow: string;
  shadowLg: string;
  shadowXl: string;
  navBg: string;
  headerBg: string;
  skeletonFrom: string;
  skeletonMid: string;
  metaThemeColor: string;
  statusBarStyle: StatusBarStyle;
  promoOverlay: string;
  inputBg: string;
  toastBg: string;
  toastText: string;
  primary: string;
  primaryLight: string;
  primaryDark: string;
  accent: string;
  accentLight: string;
  danger: string;
  warning: string;
}

/** Light theme surface + text tokens (OLED-friendly off-white, not pure white everywhere). */
export const lightTheme: ThemeTokens = {
  mode: 'light',
  bg: '#F8FAFC',
  bgCard: '#FFFFFF',
  bgOverlay: 'rgba(15, 23, 42, 0.6)',
  surfaceElevated: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  textTertiary: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  borderSubtle: 'rgba(15, 23, 42, 0.08)',
  shadowSm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  shadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
  shadowLg: '0 8px 24px rgba(0, 0, 0, 0.12)',
  shadowXl: '0 16px 40px rgba(0, 0, 0, 0.15)',
  navBg: 'rgba(255, 255, 255, 0.92)',
  headerBg: 'rgba(255, 255, 255, 0.92)',
  skeletonFrom: '#E2E8F0',
  skeletonMid: '#F1F5F9',
  metaThemeColor: brandColors.primary,
  statusBarStyle: 'light',
  promoOverlay: 'linear-gradient(to top, rgba(15,23,42,0.35) 0%, transparent 55%)',
  inputBg: '#FFFFFF',
  toastBg: '#0F172A',
  toastText: '#FFFFFF',
  ...brandColors,
};
