import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#DC2626',
        'primary-on-dark': '#FCA5A5',
        cta: '#B91C1C',
        'dark-navy': '#18181B',
        'text-dark': '#0F172A',
        muted: '#64748B',
        background: '#FFFFFF',
        accent: '#F59E0B',
        border: '#E5E7EB',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 24px rgba(15, 23, 42, 0.06)',
        'card-lg': '0 8px 32px rgba(15, 23, 42, 0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
