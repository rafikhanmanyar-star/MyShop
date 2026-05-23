import { getBreadcrumbSchemaDocument, type BreadcrumbItem } from '@/lib/seo';

type BreadcrumbJsonLdProps = {
  items: BreadcrumbItem[];
};

/** BreadcrumbList schema for inner pages */
export default function BreadcrumbJsonLd({ items }: BreadcrumbJsonLdProps) {
  if (items.length < 2) {
    return null;
  }

  const document = getBreadcrumbSchemaDocument(items);

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: document }} />
  );
}
