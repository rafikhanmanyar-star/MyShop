'use client';

import PromoBar from '@/components/sections/PromoBar';
import Navbar from '@/components/sections/Navbar';
import Hero from '@/components/sections/Hero';
import TrustStrip from '@/components/sections/TrustStrip';
import TopFeatures from '@/components/sections/TopFeatures';
import SmartUtilities from '@/components/sections/SmartUtilities';
import HowItWorks from '@/components/sections/HowItWorks';
import TestimonialStats from '@/components/sections/TestimonialStats';
import StoreSection from '@/components/sections/StoreSection';
import FinalCTA from '@/components/sections/FinalCTA';
import Footer from '@/components/sections/Footer';
import { PWAInstallProvider } from '@/components/PWAInstallProvider';

export default function LandingPage() {
  return (
    <PWAInstallProvider>
      <PromoBar />
      <Navbar />
      <main>
        <Hero />
        <TrustStrip />
        <TopFeatures />
        <SmartUtilities />
        <HowItWorks />
        <TestimonialStats />
        <StoreSection />
        <FinalCTA />
      </main>
      <Footer />
    </PWAInstallProvider>
  );
}
