import FaqJsonLd from '@/components/FaqJsonLd';
import LandingPage from '@/components/LandingPage';
import { createPageMetadata } from '@/lib/page-metadata';
import { pageMeta } from '@/lib/pages';

export const metadata = createPageMetadata(pageMeta.home);

export default function HomePage() {
  return (
    <>
      <FaqJsonLd />
      <LandingPage />
    </>
  );
}
