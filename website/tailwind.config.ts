import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1F7A63',
        'primary-on-dark': '#5EEAD4',
        cta: '#047857',
        'dark-navy': '#001F24',
        'text-dark': '#0F172A',
        muted: '#64748B',
        background: '#F7F9F8',
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
