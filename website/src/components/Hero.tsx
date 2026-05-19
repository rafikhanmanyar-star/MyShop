import { ArrowRight, Sparkles } from 'lucide-react';
import { siteConfig } from '../config/site';

interface HeroProps {
  shopName?: string;
}

export default function Hero({ shopName }: HeroProps) {
  const title = shopName ? `Welcome to ${shopName}` : 'Your neighborhood store, delivered';

  return (
    <section className="gradient-hero border-b border-slate-100 pb-16 pt-12 sm:pb-20 sm:pt-16">
      <div className="section-pad">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-4 py-1.5 text-sm font-medium text-primary">
            <Sparkles className="h-4 w-4" />
            Mobile ordering · Live tracking · Loyalty rewards
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          <p className="mt-5 text-lg text-slate-600 sm:text-xl">
            {siteConfig.tagline} Browse products, order for home delivery or pickup, earn points, and track your rider
            in real time — all from your phone.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={siteConfig.shopOrderUrl}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-8 py-4 text-base font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-primary-dark sm:w-auto"
            >
              Start shopping
              <ArrowRight className="h-5 w-5" />
            </a>
            <a
              href={siteConfig.shopProductsUrl}
              className="inline-flex w-full items-center justify-center rounded-full border border-slate-200 bg-white px-8 py-4 text-base font-semibold text-slate-800 transition hover:border-slate-300 sm:w-auto"
            >
              View all products
            </a>
          </div>
        </div>

        <div className="mx-auto mt-14 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { value: '500+', label: 'Products online' },
            { value: '30 min', label: 'Typical delivery' },
            { value: 'PWA', label: 'No app store needed' },
            { value: 'PKR', label: 'COD & wallets' },
          ].map((stat) => (
            <div key={stat.label} className="glass-card rounded-2xl px-4 py-5 text-center">
              <p className="text-2xl font-bold text-primary">{stat.value}</p>
              <p className="mt-1 text-xs font-medium text-slate-500 sm:text-sm">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
