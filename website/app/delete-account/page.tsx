import type { Metadata } from 'next';
import Link from 'next/link';
import SiteShell from '@/components/SiteShell';
import LegalDocument from '@/components/LegalDocument';
import { createPageMetadata } from '@/lib/page-metadata';
import { siteConfig } from '@/lib/data';
import { pageMeta } from '@/lib/pages';

export const metadata: Metadata = createPageMetadata(pageMeta.deleteAccount);

const deletionEmailSubject = encodeURIComponent('Account and data deletion request — OBO Stores');
const deletionEmailBody = encodeURIComponent(
  [
    'Please delete my oBo Store / OBO Stores account and associated personal data.',
    '',
    'Registered phone number:',
    'Full name (as on account):',
    'Shop I order from (if known):',
    'Reason (optional):',
    '',
    'I understand some order records may be kept where required by law.',
  ].join('\n')
);
const deletionMailto = `mailto:${siteConfig.email}?subject=${deletionEmailSubject}&body=${deletionEmailBody}`;

const sections = [
  {
    heading: 'Who can use this page',
    paragraphs: [
      `This page is for customers who created an account in the ${siteConfig.name} app (PWA or Android "OBO Stores" on Google Play) and want their account and personal data removed.`,
      'You must be the account holder. We may ask you to confirm ownership using the phone number registered on your account before we process a request.',
    ],
  },
  {
    heading: 'What we delete',
    paragraphs: ['When your request is approved, we delete or anonymize account-related personal data, including:'],
    listItems: [
      'Your mobile app login profile (name, phone number, saved delivery addresses, and password credentials).',
      'Saved preferences such as budget plans, menu planner data, recipes, and shopping lists linked to your account.',
      'Push notification tokens (FCM) associated with your account on Android.',
      'Loyalty profile and marketing preferences tied to your customer identity, where applicable.',
    ],
  },
  {
    heading: 'What we may keep',
    paragraphs: [
      'Some information cannot be fully erased where we must comply with law or resolve disputes:',
    ],
    listItems: [
      'Completed order records (items, amounts, dates) may be retained for accounting, tax, and fraud prevention, usually with personal identifiers minimized after deletion.',
      'Payment records held by payment providers are subject to their retention policies.',
      'Anonymous or aggregated analytics that cannot identify you.',
      'Backups may take up to 90 days to roll off according to our hosting retention schedule.',
    ],
  },
  {
    heading: 'How to request deletion',
    paragraphs: [
      'Choose one of the following methods. Include the phone number you use to sign in so we can locate your account.',
    ],
    listItems: [
      `Email: send a message to ${siteConfig.email} from the address below (use the button on this page to start an email with the details we need).`,
      `Phone / WhatsApp: call or message ${siteConfig.phone} during store hours and ask for "account deletion".`,
      `In store: visit ${siteConfig.address}, ${siteConfig.addressLine2}, and request account deletion at the counter.`,
    ],
  },
  {
    heading: 'Processing time',
    paragraphs: [
      'We aim to confirm receipt within 3 business days and complete deletion within 30 days. You will receive confirmation when your account has been deleted. Until then, you may continue to sign in; if you want to stop using the app immediately, uninstall the Android app or remove the PWA and sign out.',
    ],
  },
  {
    heading: 'After deletion',
    paragraphs: [
      'Your account cannot be recovered. You may register again with the same phone number only if we have fully removed your prior profile. Order history visible to the store for past deliveries may still exist in anonymized form as described above.',
    ],
  },
];

export default function DeleteAccountPage() {
  return (
    <SiteShell>
      <LegalDocument
        title="Delete your account and data"
        intro={`Use this page to request deletion of your ${siteConfig.name} customer account and associated personal data. This is the official link for Google Play and our privacy policy.`}
        sections={sections}
        lastUpdated="May 22, 2026"
      />

      <div className="section-container mx-auto max-w-3xl pb-16 sm:pb-20">
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-text-dark">Start a deletion request</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            The fastest way is email. Use the button below — it opens your mail app with a template. Send
            from an email you can access, and include your registered phone number.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <a
              href={deletionMailto}
              className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-primary/90"
            >
              Email deletion request
            </a>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-full border border-border bg-white px-6 py-3 text-sm font-semibold text-text-dark hover:bg-background"
            >
              Contact support
            </Link>
            <Link
              href="/privacy-policy"
              className="inline-flex items-center justify-center rounded-full border border-border bg-white px-6 py-3 text-sm font-semibold text-text-dark hover:bg-background"
            >
              Privacy Policy
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted">
            Direct email:{' '}
            <a href={`mailto:${siteConfig.email}`} className="font-medium text-primary hover:text-primary/80">
              {siteConfig.email}
            </a>
          </p>
        </div>
      </div>
    </SiteShell>
  );
}
