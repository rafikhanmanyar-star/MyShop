import { getFaqSchemaDocument } from '@/lib/seo';

/** FAQPage schema — only on pages that render the visible FAQ section */
export default function FaqJsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: getFaqSchemaDocument() }}
    />
  );
}
