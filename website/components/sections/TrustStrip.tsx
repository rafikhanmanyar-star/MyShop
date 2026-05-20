import {
  DollarSign,
  MapPin,
  RotateCcw,
  ShieldCheck,
  Store,
  Truck,
} from '@/components/icons';
import { trustFeatures } from '@/lib/data';

const icons = [Truck, MapPin, DollarSign, RotateCcw, Store, ShieldCheck];

export default function TrustStrip() {
  return (
    <section className="pb-12 sm:pb-16" aria-label="Trust features">
      <div className="section-container">
        <div className="rounded-3xl border border-border bg-white p-6 shadow-card sm:p-8">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
            {trustFeatures.map((feature, index) => {
              const Icon = icons[index];
              return (
                <div key={feature.title} className="flex flex-col items-center text-center sm:items-start sm:text-left">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-semibold text-text-dark">{feature.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{feature.subtitle}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
