import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import GlobalJsonLd from '@/components/GlobalJsonLd';
import { siteConfig } from '@/lib/data';
import { seoConfig } from '@/lib/seo';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  preload: true,
  adjustFontFallback: true,
});

export const viewport: Viewport = {
  themeColor: siteConfig.themeColor,
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light',
};

/** Global metadata — page files override title, description, canonical, OG, and Twitter */
export const metadata: Metadata = {
  metadataBase: seoConfig.metadataBase,
  applicationName: seoConfig.applicationName,
  manifest: seoConfig.manifest,
  icons: seoConfig.icons,
  appleWebApp: seoConfig.appleWebApp,
  robots: seoConfig.robots,
  formatDetection: seoConfig.formatDetection,
  other: {
    ...seoConfig.other,
    'msapplication-TileColor': siteConfig.themeColor,
    'msapplication-config': '/browserconfig.xml',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-PK" className={inter.variable}>
      <body className="min-h-screen font-sans antialiased">
        <GlobalJsonLd />
        {children}
      </body>
    </html>
  );
}
