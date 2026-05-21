import Link from 'next/link';
import { Clock, MapPin, Phone } from '@/components/icons';
import OptimizedImage from '@/components/OptimizedImage';
import SectionHeading from '@/components/SectionHeading';
import StoreMap from '@/components/StoreMap';
import { siteConfig } from '@/lib/data';
import { siteImages } from '@/lib/images';

type StoreSectionProps = {
  headingLevel?: 'h1' | 'h2';
  title?: string;
  description?: string;
  showContactLink?: boolean;
};

export default function StoreSection({
  headingLevel = 'h2',
  title = 'Visit Our Physical Store',
  description = 'Walk in to our FMC B-17 location on Main Boulevard at Kohsar Plaza — the same range you order online, with friendly staff on site.',
  showContactLink = true,
}: StoreSectionProps) {
  const store = siteImages.storeFmcB17;

  return (
    <section className="pb-16 sm:pb-20" aria-labelledby="store-heading">
      <div className="section-container">
        <div className="grid gap-8 lg:grid-cols-3 lg:items-center">
          <figure className="overflow-hidden rounded-3xl border border-border bg-white shadow-card">
            <OptimizedImage
              src={store.src}
              alt={store.alt}
              width={store.width}
              height={store.height}
              sizes="(max-width: 1024px) 100vw, 320px"
              className="h-56 w-full object-cover sm:h-64"
            />
          </figure>

          <div className="lg:px-4">
            <SectionHeading
              level={headingLevel}
              id="store-heading"
              title={title}
              description={description}
              titleClassName="text-2xl font-bold text-text-dark sm:text-3xl"
              descriptionClassName="mt-3 text-sm leading-relaxed text-muted"
            />
            <ul className="mt-6 space-y-4">
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <address className="not-italic font-semibold text-primary">
                  {siteConfig.address}
                  <br />
                  <span className="font-normal text-muted">{siteConfig.addressLine2}</span>
                </address>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span className="text-muted">{siteConfig.hours}</span>
              </li>
              <li className="flex items-start gap-3">
                <Phone className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <a
                  href={`tel:${siteConfig.phone.replace(/\s/g, '')}`}
                  className="text-muted hover:text-primary"
                >
                  Call us: {siteConfig.phone}
                </a>
              </li>
            </ul>
            {showContactLink && (
              <p className="mt-6 text-sm text-muted">
                <Link href="/contact" className="font-semibold text-primary hover:text-primary/80">
                  Contact oBo Store for directions, hours, and order support
                </Link>
              </p>
            )}
          </div>

          <StoreMap />
        </div>
      </div>
    </section>
  );
}
