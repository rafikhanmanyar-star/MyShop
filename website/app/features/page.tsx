import type { Metadata } from 'next';
import SiteShell from '@/components/SiteShell';
import HowItWorks from '@/components/sections/HowItWorks';
import TopFeatures from '@/components/sections/TopFeatures';
import FinalCTA from '@/components/sections/FinalCTA';
import { createPageMetadata } from '@/lib/page-metadata';
import { pageMeta } from '@/lib/pages';

export const metadata: Metadata = createPageMetadata(pageMeta.features);

export default function FeaturesPage() {
  return (
    <SiteShell>
      <TopFeatures headingLevel="h1" showViewAllLink={false} />
      <HowItWorks />
      <FinalCTA />
    </SiteShell>
  );
}
