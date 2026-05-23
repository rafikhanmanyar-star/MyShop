import type { Metadata } from 'next';
import { seoKeywords, siteConfig } from '@/lib/data';
import { absoluteUrl, seoConfig } from '@/lib/seo';

type PageMetadataInput = {
  title: string;
  description: string;
  path: string;
  ogDescription?: string;
  keywords?: string[];
};

const defaultOgImage = {
  url: absoluteUrl('/images/hero-home.png'),
  width: 685,
  height: 617,
  alt: 'oBo Store grocery delivery app for B-17 Islamabad',
};

/**
 * Page-level metadata — global icons, manifest, and robots live in app/layout.tsx
 * to avoid duplicate meta tags.
 */
export function createPageMetadata({
  title,
  description,
  path,
  ogDescription,
  keywords,
}: PageMetadataInput): Metadata {
  const canonicalPath = path.startsWith('/') ? path : `/${path}`;
  const pageUrl = absoluteUrl(canonicalPath);
  const openGraphDescription = ogDescription ?? description;

  return {
    title: { absolute: title },
    description,
    keywords: keywords ?? [...seoKeywords],
    authors: seoConfig.authors,
    creator: siteConfig.name,
    publisher: siteConfig.name,
    category: seoConfig.category,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: 'website',
      locale: 'en_PK',
      url: pageUrl,
      siteName: siteConfig.name,
      title,
      description: openGraphDescription,
      images: [defaultOgImage],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: openGraphDescription,
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
