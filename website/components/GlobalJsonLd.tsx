import { getJsonLdDocument } from '@/lib/seo';

/** Organization, GroceryStore, and WebSite — site-wide */
export default function GlobalJsonLd() {
  const document = getJsonLdDocument({ includeFaq: false });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: document }}
    />
  );
}
