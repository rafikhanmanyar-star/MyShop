import { useEffect, useState } from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import ProductShowcase from './components/ProductShowcase';
import FeatureGrid from './components/FeatureGrid';
import OrderSteps from './components/OrderSteps';
import BusinessSection from './components/BusinessSection';
import CtaBanner from './components/CtaBanner';
import Footer from './components/Footer';
import { fetchShopInfo } from './api/public';
import { siteConfig } from './config/site';
import { lifestyleFeatures, orderingFeatures } from './data/features';

export default function App() {
  const [shopName, setShopName] = useState<string | undefined>();

  useEffect(() => {
    fetchShopInfo(siteConfig.shopSlug)
      .then((info) => {
        const name = info.company_name?.trim();
        if (name) setShopName(name);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <Header />
      <main>
        <Hero shopName={shopName} />
        <ProductShowcase />
        <FeatureGrid
          id="features"
          title="Everything in the ordering app"
          subtitle="oBo stores is more than a catalog — loyalty, tracking, and smart tools for everyday shopping."
          features={orderingFeatures}
        />
        <div className="bg-zinc-100 dark:bg-zinc-900">
          <FeatureGrid
            title="Plan meals & stay on budget"
            subtitle="Optional tools built into the same app you use to order."
            features={lifestyleFeatures}
          />
        </div>
        <OrderSteps />
        <BusinessSection />
        <CtaBanner />
      </main>
      <Footer />
    </div>
  );
}
