import { siteConfig, faqItems } from '@/lib/data';

/** Resolve absolute URLs for JSON-LD */
export function absoluteUrl(path: string): string {
  return new URL(path.startsWith('/') ? path : `/${path}`, siteConfig.url).toString();
}

const logoImageObject = () => ({
  '@type': 'ImageObject' as const,
  url: absoluteUrl(siteConfig.logo),
});

const postalAddress = {
  '@type': 'PostalAddress' as const,
  streetAddress: 'FMC B-17 Kohsar Plaza Main Boulevard',
  addressLocality: 'Islamabad',
  addressCountry: 'Pakistan',
};

/** GroceryStore (LocalBusiness) — oBo Store physical & online grocery */
export function getGroceryStoreSchema() {
  return {
    '@type': 'GroceryStore',
    '@id': `${siteConfig.url}/#grocery-store`,
    name: siteConfig.name,
    url: siteConfig.url,
    logo: logoImageObject(),
    image: logoImageObject(),
    telephone: siteConfig.phone,
    email: siteConfig.email,
    priceRange: siteConfig.priceRange,
    address: postalAddress,
    areaServed: siteConfig.schemaAreaServed.map((name) => ({
      '@type': 'Place',
      name,
    })),
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday',
        ],
        opens: '09:00',
        closes: '23:00',
      },
    ],
    geo: {
      '@type': 'GeoCoordinates',
      latitude: siteConfig.geo.latitude,
      longitude: siteConfig.geo.longitude,
    },
    hasMap: siteConfig.mapsUrl,
  };
}

/** Organization — brand entity */
export function getOrganizationSchema() {
  return {
    '@type': 'Organization',
    '@id': `${siteConfig.url}/#organization`,
    name: siteConfig.name,
    url: siteConfig.url,
    logo: logoImageObject(),
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      telephone: siteConfig.phone,
      email: siteConfig.email,
      areaServed: 'PK',
      availableLanguage: ['English', 'Urdu'],
    },
  };
}

/** WebSite — site-level entity with search action */
export function getWebSiteSchema() {
  return {
    '@type': 'WebSite',
    '@id': `${siteConfig.url}/#website`,
    name: siteConfig.name,
    url: siteConfig.url,
    inLanguage: 'en-PK',
    publisher: { '@id': `${siteConfig.url}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: absoluteUrl('/?q={search_term_string}'),
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** FAQPage — must match visible FAQ in LocalFaqSection */
export function getFaqSchema() {
  return {
    '@type': 'FAQPage',
    '@id': `${siteConfig.url}/#faq`,
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

/** Combined @graph for a single JSON-LD script tag */
export function getJsonLdGraph(options?: { includeFaq?: boolean }) {
  const graph: Record<string, unknown>[] = [
    getOrganizationSchema(),
    getGroceryStoreSchema(),
    getWebSiteSchema(),
  ];

  if (options?.includeFaq) {
    graph.push(getFaqSchema());
  }

  return graph;
}

/** Serialized JSON-LD document (valid JSON) */
export function getJsonLdDocument(options?: { includeFaq?: boolean }): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': getJsonLdGraph(options),
  });
}

/** Standalone FAQPage JSON-LD for home and contact pages */
export function getFaqSchemaDocument(): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    ...getFaqSchema(),
  });
}

/** Shared metadata and structured data for oBo store */
export const seoConfig = {
  metadataBase: new URL(siteConfig.url),
  description: siteConfig.description,
  applicationName: siteConfig.name,
  authors: [{ name: siteConfig.name, url: siteConfig.url }],
  creator: siteConfig.name,
  publisher: siteConfig.name,
  category: 'Grocery delivery',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large' as const,
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website' as const,
    locale: 'en_PK',
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: siteConfig.title,
    description: siteConfig.description,
    images: [
      {
        url: '/images/hero-pwa-ordering.webp',
        width: 360,
        height: 720,
        alt: 'oBo Store PWA grocery ordering screen',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image' as const,
    title: siteConfig.title,
    description: siteConfig.description,
    images: ['/images/hero-pwa-ordering.webp'],
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    other: [
      { rel: 'mask-icon', url: '/icons/icon.svg', color: '#1F7A63' },
    ],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default' as const,
    title: siteConfig.shortName,
  },
  other: {
    'geo.region': 'PK-IS',
    'geo.placename': siteConfig.city,
    'geo.position': `${siteConfig.geo.latitude};${siteConfig.geo.longitude}`,
    ICBM: `${siteConfig.geo.latitude}, ${siteConfig.geo.longitude}`,
  },
};
