import { Clock, MapPin, Phone } from '@/components/icons';
import { siteConfig } from '@/lib/data';

export default function StoreSection() {
  return (
    <section className="pb-16 sm:pb-20">
      <div className="section-container">
        <div className="grid gap-8 lg:grid-cols-3 lg:items-center">
          {/* Storefront card */}
          <div className="overflow-hidden rounded-3xl border border-border bg-white shadow-card">
            <div className="relative h-56 bg-gradient-to-br from-slate-200 to-slate-300 sm:h-64">
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/40 to-transparent p-4">
                <div className="inline-block rounded-lg bg-primary px-4 py-2">
                  <span className="text-sm font-bold text-white">{siteConfig.brand}</span>
                </div>
              </div>
              {/* Storefront illustration */}
              <div className="absolute left-1/2 top-8 -translate-x-1/2">
                <div className="h-32 w-48 rounded-t-lg border-2 border-white/60 bg-white/20 backdrop-blur-sm">
                  <div className="mx-auto mt-4 h-16 w-36 rounded bg-primary/80" />
                  <div className="mx-auto mt-2 h-8 w-28 rounded bg-white/30" />
                </div>
              </div>
            </div>
          </div>

          {/* Store info */}
          <div className="lg:px-4">
            <h2 className="text-2xl font-bold text-text-dark sm:text-3xl">
              Visit Our Physical Store
            </h2>
            <ul className="mt-6 space-y-4">
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span className="text-muted">{siteConfig.address}</span>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span className="text-muted">{siteConfig.hours}</span>
              </li>
              <li className="flex items-start gap-3">
                <Phone className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <a href={`tel:${siteConfig.phone.replace(/\s/g, '')}`} className="text-muted hover:text-primary">
                  Call Us {siteConfig.phone}
                </a>
              </li>
            </ul>
          </div>

          {/* Map placeholder */}
          <div className="overflow-hidden rounded-3xl border border-border bg-white shadow-card">
            <div className="relative h-56 bg-[#E8F0EA] sm:h-64" aria-label="Store location map">
              <div className="absolute inset-0 opacity-30">
                <div className="grid h-full w-full grid-cols-6 grid-rows-6">
                  {Array.from({ length: 36 }).map((_, i) => (
                    <div key={i} className="border border-primary/10" />
                  ))}
                </div>
              </div>
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
                <MapPin className="h-10 w-10 fill-primary text-primary" aria-hidden="true" />
              </div>
              <div className="absolute bottom-4 left-4 rounded-lg bg-white px-3 py-2 text-xs font-medium text-text-dark shadow-sm">
                FMC B-17 Kohsar Plaza
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
