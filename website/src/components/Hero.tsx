import { ArrowRight, Sparkles } from 'lucide-react';
import { siteConfig } from '../config/site';

interface HeroProps {
  shopName?: string;
}

export default function Hero({ shopName }: HeroProps) {
  const title = shopName ? `Welcome to ${shopName}` : 'Your neighborhood store, delivered';

  return (
    <section className="gradient-hero border-b border-zinc-100 pb-16 pt-12 dark:border-zinc-800 sm:pb-20 sm:pt-16">
      <main className="section-pad flex w-full max-w-3xl flex-col items-center gap-10 py-8 text-center sm:items-start sm:text-left lg:max-w-6xl lg:flex-row lg:items-center lg:justify-between lg:gap-16">
        <div className="flex flex-col items-center gap-6 sm:items-start">
          <p className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-1.5 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            <Sparkles className="h-4 w-4 text-brand" />
            Mobile ordering · Live tracking · Loyalty rewards
          </p>
          <h1 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {title}
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            {siteConfig.tagline} Browse products, order for home delivery or pickup, earn points, and track your rider
            in real time — all from your phone.
          </p>
          <div className="flex w-full flex-col gap-4 text-base font-medium sm:flex-row">
            <a
              href={siteConfig.shopOrderUrl}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-background transition-colors hover:opacity-90 sm:w-auto md:min-w-[158px]"
            >
              Start shopping
              <ArrowRight className="h-5 w-5" />
            </a>
            <a
              href={siteConfig.shopProductsUrl}
              className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a] sm:w-auto md:min-w-[158px]"
            >
              View all products
            </a>
          </div>
        </div>

        <div className="grid w-full max-w-md grid-cols-2 gap-3 sm:max-w-lg">
          {[
            { value: '500+', label: 'Products online' },
            { value: '30 min', label: 'Typical delivery' },
            { value: 'PWA', label: 'No app store needed' },
            { value: 'PKR', label: 'COD & wallets' },
          ].map((stat) => (
            <div key={stat.label} className="glass-card rounded-2xl px-4 py-5 text-center">
              <p className="text-2xl font-bold text-brand">{stat.value}</p>
              <p className="mt-1 text-xs font-medium text-zinc-500 sm:text-sm">{stat.label}</p>
            </div>
          ))}
        </div>
      </main>
    </section>
  );
}
