import BreadcrumbJsonLd from '@/components/BreadcrumbJsonLd';
import SiteShell from '@/components/SiteShell';
import SmartUtilities from '@/components/sections/SmartUtilities';
import FinalCTA from '@/components/sections/FinalCTA';
import SectionHeading from '@/components/SectionHeading';
import { createPageMetadata } from '@/lib/page-metadata';
import { pageMeta } from '@/lib/pages';

export const metadata = createPageMetadata(pageMeta.utilities);

export default function UtilitiesPage() {
  return (
    <SiteShell>
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', path: '/' },
          { name: 'Utilities', path: '/utilities' },
        ]}
      />
      <section className="bg-background pt-12 sm:pt-16">
        <div className="section-container">
          <SectionHeading
            level="h1"
            id="utilities-page-intro"
            title="Smart Grocery Utilities"
            description="Plan meals, manage budgets, and shop smarter with oBo Store utilities — designed for families doing grocery delivery in B-17 Islamabad."
          />
        </div>
      </section>
      <SmartUtilities headingLevel="h2" showExploreLink={false} />
      <FinalCTA />
    </SiteShell>
  );
}
