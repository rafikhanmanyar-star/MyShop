'use client';

import SkipLink from '@/components/SkipLink';
import Hero from '@/components/sections/Hero';
import ServiceAreaSection from '@/components/sections/ServiceAreaSection';
import WhyChooseSection from '@/components/sections/WhyChooseSection';
import TopFeatures from '@/components/sections/TopFeatures';
import SmartUtilities from '@/components/sections/SmartUtilities';
import HowItWorks from '@/components/sections/HowItWorks';
import StoreSection from '@/components/sections/StoreSection';
import LocalFaqSection from '@/components/sections/LocalFaqSection';
import FinalCTA from '@/components/sections/FinalCTA';
import Footer from '@/components/sections/Footer';
import Navbar from '@/components/sections/Navbar';
import PromoBar from '@/components/sections/PromoBar';

export default function LandingPage() {
  return (
    <>
      <SkipLink />
      <PromoBar />
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <Hero />
        <ServiceAreaSection />
        <WhyChooseSection />
        <TopFeatures />
        <SmartUtilities />
        <HowItWorks />
        <StoreSection />
        <FinalCTA />
        <LocalFaqSection />
      </main>
      <Footer />
    </>
  );
}
