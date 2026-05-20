import type { Metadata } from 'next';
import SiteShell from '@/components/SiteShell';
import LegalDocument from '@/components/LegalDocument';
import { createPageMetadata } from '@/lib/page-metadata';
import { pageMeta } from '@/lib/pages';

export const metadata: Metadata = createPageMetadata(pageMeta.privacyPolicy);

const sections = [
  {
    heading: 'Information we collect',
    paragraphs: [
      'When you use oBo Store, we may collect your name, phone number, delivery address, order history, and device information needed to run the PWA and process deliveries.',
    ],
  },
  {
    heading: 'How we use your data',
    paragraphs: [
      'We use your information to fulfill orders, provide customer support, improve our services, send order updates, and comply with legal obligations. We do not sell your personal data to third parties.',
    ],
  },
  {
    heading: 'Data security',
    paragraphs: [
      'We apply reasonable technical and organizational safeguards to protect your shopping and account information. No method of transmission over the internet is 100% secure.',
    ],
  },
  {
    heading: 'Your rights',
    paragraphs: [
      'You may request access, correction, or deletion of your personal data by contacting support@obostore.com. We will respond within a reasonable timeframe as required by applicable law.',
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <SiteShell>
      <LegalDocument
        title="Privacy Policy"
        intro="oBo Store respects your privacy. This policy describes how we collect, use, and protect your information when you use our website and PWA."
        sections={sections}
      />
    </SiteShell>
  );
}
