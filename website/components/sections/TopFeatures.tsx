import {
  ArrowRight,
  House,
  MapPin,
  RotateCcw,
  ShieldCheck,
  ShoppingCart,
  Snowflake,
  Tag,
  Truck,
} from '@/components/icons';
import { topFeatures } from '@/lib/data';

const iconMap = {
  'map-pin': MapPin,
  truck: Truck,
  tag: Tag,
  'rotate-ccw': RotateCcw,
  home: House,
  snowflake: Snowflake,
  'shield-check': ShieldCheck,
  'shopping-cart': ShoppingCart,
};

export default function TopFeatures() {
  return (
    <section id="features" className="pb-16 sm:pb-20">
      <div className="section-container">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-3xl font-bold text-text-dark sm:text-4xl">Top Features</h2>
            <p className="mt-2 text-muted">Everything you need in one app.</p>
          </div>
          <a
            href="#features"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
          >
            See All Features
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {topFeatures.map((feature) => {
            const Icon = iconMap[feature.icon];
            return (
              <article
                key={feature.title}
                className="rounded-2xl border border-border bg-white p-6 shadow-card"
              >
                <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${feature.color}`}>
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="text-base font-semibold text-text-dark">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{feature.description}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
