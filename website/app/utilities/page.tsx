import type { Metadata } from 'next';
import SiteShell from '@/components/SiteShell';
import SmartUtilities from '@/components/sections/SmartUtilities';
import FinalCTA from '@/components/sections/FinalCTA';
import { createPageMetadata } from '@/lib/page-metadata';
import { pageMeta } from '@/lib/pages';

export const metadata: Metadata = createPageMetadata(pageMeta.utilities);

export default function UtilitiesPage() {
  return (
    <SiteShell>
      <SmartUtilities headingLevel="h1" showExploreLink={false} />
      <FinalCTA />
    </SiteShell>
  );
}
