'use client';

import SkipLink from '@/components/SkipLink';
import PromoBar from '@/components/sections/PromoBar';
import Navbar from '@/components/sections/Navbar';
import Footer from '@/components/sections/Footer';
export default function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SkipLink />
      <PromoBar />
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <Footer />
    </>
  );
}
