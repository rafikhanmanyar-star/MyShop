import BreadcrumbJsonLd from '@/components/BreadcrumbJsonLd';
import FaqJsonLd from '@/components/FaqJsonLd';
import SiteShell from '@/components/SiteShell';
import StoreSection from '@/components/sections/StoreSection';
import LocalFaqSection from '@/components/sections/LocalFaqSection';
import { createPageMetadata } from '@/lib/page-metadata';
import { pageMeta } from '@/lib/pages';

export const metadata = createPageMetadata(pageMeta.contact);

export default function ContactPage() {
  return (
    <SiteShell>
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', path: '/' },
          { name: 'Contact', path: '/contact' },
        ]}
      />
      <FaqJsonLd />
      <StoreSection
        headingLevel="h1"
        title="Contact oBo Store"
        description="Reach us for orders and support at FMC B-17 Kohsar Plaza, Main Boulevard, Islamabad — or visit our nearby grocery store in person."
        showContactLink={false}
      />
      <LocalFaqSection showContactCta={false} />
    </SiteShell>
  );
}
