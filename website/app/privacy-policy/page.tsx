import type { Metadata } from 'next';
import SiteShell from '@/components/SiteShell';
import LegalDocument from '@/components/LegalDocument';
import { createPageMetadata } from '@/lib/page-metadata';
import { siteConfig } from '@/lib/data';
import { pageMeta } from '@/lib/pages';

export const metadata: Metadata = createPageMetadata(pageMeta.privacyPolicy);

const appName = 'OBO Stores';
const androidPackage = 'com.obostores.customer';
const effectiveDate = 'May 22, 2026';

const sections = [
  {
    heading: 'Who we are',
    paragraphs: [
      `This Privacy Policy describes how ${siteConfig.name} ("we", "us", or "our") collects, uses, and shares information when you use our marketing website at ${siteConfig.url}, our online grocery shop (PWA), and our Android app "${appName}" (package name ${androidPackage}) available on Google Play.`,
      `If you have questions about this policy, contact us at ${siteConfig.email} or ${siteConfig.phone}.`,
    ],
  },
  {
    heading: 'Information we collect',
    paragraphs: ['Depending on how you use our services, we may collect the following types of information:'],
    listItems: [
      'Account and contact details: name, phone number, email (if provided), and delivery addresses you save in the app.',
      'Order information: items purchased, order history, payment method type (we do not store full card numbers on our servers), delivery notes, and order status.',
      'Location data: GPS coordinates or map pin you choose for delivery, and approximate location when you use "Use my location" or the map picker (only with your permission).',
      'Device and app data: device type, operating system, app version, language, and technical logs needed to run the service.',
      'Communications: messages you send to customer support and feedback you provide.',
      'Usage data: pages or screens viewed, search queries, cart activity, and feature usage to improve the shop experience.',
    ],
  },
  {
    heading: 'Android app — Firebase and notifications',
    paragraphs: [
      `The ${appName} Android app uses Google Firebase services provided by Google LLC. These run only in the native Android app shell, not in the browser version of the shop.`,
    ],
    listItems: [
      'Firebase Analytics: anonymous usage events (for example, app opens) to understand how the app is used.',
      'Firebase Crashlytics: crash reports and diagnostic data to fix bugs and improve stability.',
      'Firebase Cloud Messaging (FCM): a device token so we can send push notifications about orders and delivery updates when you allow notifications.',
    ],
  },
  {
    heading: 'How we use your information',
    paragraphs: ['We use personal information to:'],
    listItems: [
      'Process and deliver your grocery orders and show order tracking.',
      'Authenticate your account and keep your session secure.',
      'Send order confirmations, delivery updates, and (if enabled) push notifications.',
      'Provide customer support and handle returns or complaints.',
      'Improve our website, app, product selection, and delivery service.',
      'Comply with legal obligations and prevent fraud or abuse.',
    ],
  },
  {
    heading: 'Legal basis (where applicable)',
    paragraphs: [
      'We process your data to perform our contract with you (fulfilling orders), based on your consent (for example, location or push notifications, which you can withdraw in device settings), and for our legitimate interests in operating and improving a safe grocery delivery service.',
    ],
  },
  {
    heading: 'Sharing with third parties',
    paragraphs: [
      'We do not sell your personal information. We may share data only as needed to operate the service:',
    ],
    listItems: [
      'Delivery partners and riders: name, phone, address, and order details to complete delivery.',
      'Payment processors: information required to process your payment securely.',
      'Google (Firebase): analytics, crash reporting, and push messaging as described above. See Google\'s Privacy Policy at https://policies.google.com/privacy.',
      'Maps providers: coordinates or addresses when you use map features (subject to their policies).',
      'Hosting and infrastructure providers that store and process data on our behalf under confidentiality obligations.',
      'Authorities when required by law or to protect rights, safety, or security.',
    ],
  },
  {
    heading: 'Data retention',
    paragraphs: [
      'We keep your information for as long as your account is active and as needed to fulfill orders, resolve disputes, and meet legal record-keeping requirements. You may request deletion of account-related data subject to exceptions (for example, completed order records we must retain for accounting or tax purposes).',
    ],
  },
  {
    heading: 'Data security',
    paragraphs: [
      'We use reasonable technical and organizational measures to protect your information, including encrypted connections (HTTPS) for data in transit. No method of transmission or storage over the internet is completely secure; we cannot guarantee absolute security.',
    ],
  },
  {
    heading: 'Delete your account and data',
    paragraphs: [
      `You can request deletion of your customer account and associated personal data at any time. Visit ${siteConfig.url}/delete-account for step-by-step instructions, what we delete, what we may retain, and how to contact us. This is the URL we provide to Google Play for account deletion requests.`,
    ],
  },
  {
    heading: 'Your choices and rights',
    paragraphs: ['You can:'],
    listItems: [
      'Update your profile and saved addresses in the app account settings.',
      'Deny or revoke location access and notification permission in your device or browser settings.',
      `Request access or correction of your personal data by emailing ${siteConfig.email}.`,
      'Uninstall the Android app or remove the PWA from your device at any time.',
    ],
  },
  {
    heading: "Children's privacy",
    paragraphs: [
      'Our services are not directed to children under 13. We do not knowingly collect personal information from children. If you believe a child has provided us data, contact us and we will delete it.',
    ],
  },
  {
    heading: 'International users',
    paragraphs: [
      'oBo Store operates in Pakistan. Your information may be processed on servers located in Pakistan or other countries where our service providers operate, with appropriate safeguards where required.',
    ],
  },
  {
    heading: 'Changes to this policy',
    paragraphs: [
      'We may update this Privacy Policy from time to time. We will post the revised policy on this page with an updated "Last updated" date. Continued use of our services after changes means you accept the updated policy.',
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <SiteShell>
      <LegalDocument
        title="Privacy Policy"
        intro={`${siteConfig.name} respects your privacy. This policy explains what we collect, how we use it, and your choices when you use our website, online shop (PWA), and Android app on Google Play.`}
        sections={sections}
        lastUpdated={effectiveDate}
      />
    </SiteShell>
  );
}
