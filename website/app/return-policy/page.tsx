import BreadcrumbJsonLd from '@/components/BreadcrumbJsonLd';
import SiteShell from '@/components/SiteShell';
import LegalDocument from '@/components/LegalDocument';
import { createPageMetadata } from '@/lib/page-metadata';
import { pageMeta } from '@/lib/pages';

export const metadata = createPageMetadata(pageMeta.returnPolicy);

const sections = [
  {
    heading: 'Eligible items',
    paragraphs: [
      'Returns may be accepted for unopened grocery, household, dairy, and frozen products that arrive damaged, expired, or incorrect. Perishable dairy and frozen items must be reported within 24 hours of delivery.',
    ],
  },
  {
    heading: 'How to request a return',
    paragraphs: [
      'Contact oBo Store customer support with your order number and photos of the item and packaging. Our team will confirm eligibility and arrange a pickup or in-store return where applicable.',
    ],
  },
  {
    heading: 'Refunds',
    paragraphs: [
      'Approved returns are refunded to your original payment method or store credit within 5–7 business days. Cash on delivery orders may receive store credit or a bank transfer after verification.',
    ],
  },
  {
    heading: 'Non-returnable items',
    paragraphs: [
      'Opened food products, items without original packaging, and products marked final sale are not eligible for return unless required by law.',
    ],
  },
];

export default function ReturnPolicyPage() {
  return (
    <SiteShell>
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', path: '/' },
          { name: 'Return Policy', path: '/return-policy' },
        ]}
      />
      <LegalDocument
        title="Return Policy"
        intro="This return policy explains how oBo Store handles returns for grocery, household, dairy, and frozen products ordered through our website and PWA."
        sections={sections}
      />
    </SiteShell>
  );
}
