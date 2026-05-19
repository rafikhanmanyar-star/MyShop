import { ArrowRight, Monitor, Bike } from 'lucide-react';
import FeatureGrid from './FeatureGrid';
import { posFeatures, riderFeatures } from '../data/features';
import { siteConfig } from '../config/site';

export default function BusinessSection() {
  return (
    <section id="business" className="scroll-mt-20 border-t border-slate-100 bg-white">
      <div className="section-pad py-14 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Powered by MyShop</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-900">One platform for shop, counter & delivery</h2>
        <p className="mx-auto mt-3 max-w-2xl text-slate-600">
          oBo stores is the customer-facing app. Behind it, MyShop runs your POS, inventory, and accounting — and OBO
          RIDER gets orders to customers fast.
        </p>
      </div>

      <FeatureGrid
        title="For store owners — MyShop POS"
        subtitle="Everything you need to run the counter and back office."
        features={posFeatures}
        accent="pos"
      />

      <div className="section-pad pb-8">
        <a
          href={siteConfig.posAppUrl}
          className="inline-flex items-center gap-2 rounded-full border-2 border-pos px-6 py-3 text-sm font-semibold text-pos hover:bg-blue-50"
        >
          <Monitor className="h-4 w-4" />
          Store owner login
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>

      <div className="bg-slate-50">
        <FeatureGrid
          title="For riders — OBO RIDER"
          subtitle="Accept deliveries, navigate with live maps, and update order status on the go."
          features={riderFeatures}
          accent="rider"
        />
        <div className="section-pad pb-16">
          <a
            href={siteConfig.riderAppUrl}
            className="inline-flex items-center gap-2 rounded-full bg-rider px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
          >
            <Bike className="h-4 w-4" />
            Open rider app
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
