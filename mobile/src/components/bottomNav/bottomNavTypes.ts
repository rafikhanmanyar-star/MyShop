import type { ReactNode } from 'react';

export type BottomNavItemId = 'home' | 'browse' | 'offers' | 'cart' | 'orders' | 'utils';

export interface BottomNavItem {
  id: BottomNavItemId;
  label: string;
  path: string;
  icon: ReactNode;
  gradientFrom: string;
  gradientTo: string;
  glowColor: string;
}
