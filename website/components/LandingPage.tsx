'use client';

import SkipLink from '@/components/SkipLink';
import Hero from '@/components/sections/Hero';
import BusinessOverview from '@/components/sections/BusinessOverview';
import TrustStrip from '@/components/sections/TrustStrip';
import TopFeatures from '@/components/sections/TopFeatures';
import SmartUtilities from '@/components/sections/SmartUtilities';
import HowItWorks from '@/components/sections/HowItWorks';
import TestimonialStats from '@/components/sections/TestimonialStats';
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
        <BusinessOverview />
        <TrustStrip />
        <TopFeatures />
        <SmartUtilities variant="banner" />
        <HowItWorks compact />
        <TestimonialStats />
        <StoreSection showContactLink={false} />
        <FinalCTA />
        <LocalFaqSection />
      </main>
      <Footer />
    </>
  );
}
