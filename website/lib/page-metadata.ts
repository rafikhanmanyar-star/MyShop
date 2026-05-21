import type { Metadata } from 'next';
import { siteConfig } from '@/lib/data';
import { absoluteUrl, seoConfig } from '@/lib/seo';

type PageMetadataInput = {
  title: string;
  description: string;
  path: string;
};

const defaultOgImage = {
  url: absoluteUrl('/images/hero-app-mockup.png'),
  width: 360,
  height: 720,
  alt: 'oBo Store PWA grocery ordering screen',
};

/**
 * Page-level metadata only — global icons, manifest, and robots live in app/layout.tsx
 * to avoid duplicate meta tags.
 */
export function createPageMetadata({
  title,
  description,
  path,
}: PageMetadataInput): Metadata {
  const canonicalPath = path.startsWith('/') ? path : `/${path}`;
  const pageUrl = absoluteUrl(canonicalPath);

  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: 'website',
      locale: 'en_PK',
      url: pageUrl,
      siteName: siteConfig.name,
      title,
      description,
      images: [defaultOgImage],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [defaultOgImage.url],
    },
  };
}

/** 404 and other non-indexable pages */
export function createNoIndexMetadata(title: string, description: string): Metadata {
  return {
    title: { absolute: title },
    description,
    robots: {
      index: false,
      follow: false,
    },
  };
}
