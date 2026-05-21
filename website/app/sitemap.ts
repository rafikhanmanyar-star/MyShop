import type { MetadataRoute } from 'next';
import { siteConfig } from '@/lib/data';
import { sitemapPaths } from '@/lib/pages';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return sitemapPaths.map((path) => ({
    url: path === '/' ? siteConfig.url : `${siteConfig.url}${path}`,
    lastModified,
    changeFrequency: path === '/' ? ('weekly' as const) : ('monthly' as const),
    priority:
      path === '/'
        ? 1
        : path === '/privacy-policy' ||
            path === '/terms-and-conditions' ||
            path === '/return-policy'
          ? 0.5
          : 0.8,
  }));
}
