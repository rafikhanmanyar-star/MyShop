/** Shared brand colors — tenant primary/accent may override --primary at runtime. */
export const brandColors = {
  primary: '#4F46E5',
  primaryLight: '#818CF8',
  primaryDark: '#3730A3',
  accent: '#10B981',
  accentLight: '#34D399',
  danger: '#EF4444',
  warning: '#F59E0B',
} as const;

export type SemanticColorKey = keyof typeof brandColors;
