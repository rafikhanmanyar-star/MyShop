import BreadcrumbJsonLd from '@/components/BreadcrumbJsonLd';
import SiteShell from '@/components/SiteShell';
import SectionHeading from '@/components/SectionHeading';
import ServiceAreaSection from '@/components/sections/ServiceAreaSection';
import WhyChooseSection from '@/components/sections/WhyChooseSection';
import FinalCTA from '@/components/sections/FinalCTA';
import { createPageMetadata } from '@/lib/page-metadata';
import { pageMeta } from '@/lib/pages';

export const metadata = createPageMetadata(pageMeta.about);

export default function AboutPage() {
  return (
    <SiteShell>
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', path: '/' },
          { name: 'About', path: '/about' },
        ]}
      />
      <section className="bg-background pt-12 sm:pt-16">
        <div className="section-container">
          <SectionHeading
            level="h1"
            id="about-page-heading"
            title="About oBo Store"
            description="A trusted nearby grocery store at FMC B-17 Kohsar Plaza on Main Boulevard — serving B-17 Islamabad with in-store shopping, local grocery delivery, and smart planning tools."
          />
        </div>
      </section>
      <WhyChooseSection />
      <ServiceAreaSection />
      <FinalCTA />
    </SiteShell>
  );
}
