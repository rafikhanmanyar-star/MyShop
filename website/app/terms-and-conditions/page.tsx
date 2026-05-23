import BreadcrumbJsonLd from '@/components/BreadcrumbJsonLd';
import SiteShell from '@/components/SiteShell';
import LegalDocument from '@/components/LegalDocument';
import { createPageMetadata } from '@/lib/page-metadata';
import { pageMeta } from '@/lib/pages';

export const metadata = createPageMetadata(pageMeta.terms);

const sections = [
  {
    heading: 'Use of the service',
    paragraphs: [
      'By using the oBo Store website or PWA, you agree to these terms. You must provide accurate contact and delivery information and use the service only for lawful personal shopping purposes.',
    ],
  },
  {
    heading: 'Orders and pricing',
    paragraphs: [
      'Product availability and prices may change without notice. We reserve the right to cancel or modify orders affected by stock issues, pricing errors, or delivery constraints in your area.',
    ],
  },
  {
    heading: 'PWA installation',
    paragraphs: [
      'Installing the oBo Store PWA adds a shortcut to your device. You are responsible for keeping your device secure and for any orders placed through your installed app session.',
    ],
  },
  {
    heading: 'Limitation of liability',
    paragraphs: [
      'oBo Store is not liable for indirect damages arising from service interruptions, third-party payment failures, or events outside our reasonable control. Our liability is limited to the value of the affected order where permitted by law.',
    ],
  },
];

export default function TermsAndConditionsPage() {
  return (
    <SiteShell>
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', path: '/' },
          { name: 'Terms and Conditions', path: '/terms-and-conditions' },
        ]}
      />
      <LegalDocument
        title="Terms and Conditions"
        intro="These terms govern your use of the oBo Store website and progressive web app (PWA). Please read them before placing an order."
        sections={sections}
      />
    </SiteShell>
  );
}
