import Link from 'next/link';
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
import OptimizedImage from '@/components/OptimizedImage';
import SectionHeading from '@/components/SectionHeading';
import { topFeatures } from '@/lib/data';
import { siteImages, type SiteImageKey } from '@/lib/images';

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

const featureImages: Partial<Record<string, SiteImageKey>> = {
  'map-pin': 'trackingFeature',
};

type TopFeaturesProps = {
  headingLevel?: 'h1' | 'h2';
  showViewAllLink?: boolean;
};

export default function TopFeatures({
  headingLevel = 'h2',
  showViewAllLink = true,
}: TopFeaturesProps) {
  return (
    <section id="features" className="pb-16 sm:pb-20" aria-labelledby="features-heading">
      <div className="section-container">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <SectionHeading
            level={headingLevel}
            id="features-heading"
            title="Top Features"
            description="Everything you need from a nearby grocery store in B-17 — online or in person at FMC B-17."
          />
          {showViewAllLink && headingLevel === 'h2' && (
            <Link
              href="/features"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary/80"
            >
              Explore all oBo Store features
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {topFeatures.map((feature) => {
            const Icon = iconMap[feature.icon];
            const imageKey = featureImages[feature.icon];
            const image = imageKey ? siteImages[imageKey] : null;

            return (
              <article
                key={feature.title}
                className="rounded-2xl border border-border bg-white p-6 shadow-card"
              >
                {image ? (
                  <div className="mb-4 overflow-hidden rounded-xl">
                    <OptimizedImage
                      src={image.src}
                      alt={image.alt}
                      width={image.width}
                      height={image.height}
                      sizes="(max-width: 640px) 50vw, 280px"
                      className="aspect-[7/4] h-auto w-full object-cover"
                    />
                  </div>
                ) : (
                  <div
                    className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${feature.color}`}
                  >
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </div>
                )}
                <h3 className="text-base font-semibold text-text-dark">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{feature.description}</p>
              </article>
            );
          })}
        </div>

        {showViewAllLink && headingLevel === 'h2' && (
          <p className="mt-8 text-center text-sm text-muted">
            Want the full list?{' '}
            <Link href="/features" className="font-semibold text-primary hover:text-primary/80">
              See delivery, tracking, offers, and more on our Features page
            </Link>
            .
          </p>
        )}
      </div>
    </section>
  );
}
