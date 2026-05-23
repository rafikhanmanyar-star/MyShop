import BreadcrumbJsonLd from '@/components/BreadcrumbJsonLd';
import SiteShell from '@/components/SiteShell';
import HowItWorks from '@/components/sections/HowItWorks';
import TopFeatures from '@/components/sections/TopFeatures';
import FinalCTA from '@/components/sections/FinalCTA';
import SectionHeading from '@/components/SectionHeading';
import { createPageMetadata } from '@/lib/page-metadata';
import { pageMeta } from '@/lib/pages';

export const metadata = createPageMetadata(pageMeta.features);

export default function FeaturesPage() {
  return (
    <SiteShell>
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', path: '/' },
          { name: 'Features', path: '/features' },
        ]}
      />
      <section className="bg-background pt-12 sm:pt-16">
        <div className="section-container">
          <SectionHeading
            level="h1"
            id="features-page-intro"
            title="Grocery App Features"
            description="Everything you need for grocery delivery in B-17 Islamabad — from live tracking and fast delivery to secure payments and easy returns at oBo Store."
          />
        </div>
      </section>
      <TopFeatures headingLevel="h2" showViewAllLink={false} />
      <HowItWorks />
      <FinalCTA />
    </SiteShell>
  );
}
