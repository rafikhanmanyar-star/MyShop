import { bottomNavTokens } from './bottomNavTokens';

const iconProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  width: bottomNavTokens.iconSize,
  height: bottomNavTokens.iconSize,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const bottomNavIcons = {
  home: (
    <svg {...iconProps}>
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  ),
  browse: (
    <svg {...iconProps}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  offers: (
    <svg {...iconProps}>
      <path d="M20 12V8H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h12v4" />
      <path d="M4 6v12a2 2 0 0 0 2 2h14v-8" />
      <path d="M18 12h.01" />
    </svg>
  ),
  cart: (
    <svg {...iconProps}>
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  ),
  orders: (
    <svg {...iconProps}>
      <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z" />
      <path d="M15 3v4a2 2 0 0 0 2 2h4" />
    </svg>
  ),
  utils: (
    <svg {...iconProps}>
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4 2 2 0 0 0 0 4h13a1 1 0 0 0 1-1v-2Z" />
      <path d="M18 5h.01" />
      <path d="M19 11v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9" />
      <polyline points="8 13 12 17 16 13" />
    </svg>
  ),
} as const;
