import { MapPin, Truck } from '@/components/icons';
import InstallButton from '@/components/InstallButton';
import OptimizedImage from '@/components/OptimizedImage';
import SectionHeading from '@/components/SectionHeading';
import { productCategories, siteConfig } from '@/lib/data';
import { siteImages } from '@/lib/images';

type ServiceAreaSectionProps = {
  headingLevel?: 'h1' | 'h2';
};

export default function ServiceAreaSection({ headingLevel = 'h2' }: ServiceAreaSectionProps) {
  const delivery = siteImages.householdDelivery;

  return (
    <section id="delivery" className="py-16 sm:py-20" aria-labelledby="delivery-heading">
      <div className="section-container">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <SectionHeading
              level={headingLevel}
              id="delivery-heading"
              title="Grocery Delivery Made Simple"
              description="Order from our FMC B-17 store and get local grocery delivery across B-17 Islamabad — with live tracking from Kohsar Plaza to your home."
            />

            <p className="mt-4 text-base leading-relaxed text-muted">
              oBo store is your nearby grocery store on Main Boulevard. Stock up on snacks,
              drinks, dairy and frozen items, and household essentials without leaving B-17.
            </p>
            <p className="mt-4 text-base leading-relaxed text-muted">
              Need a quick restock or a full weekly shop? Our app keeps checkout simple and
              delivery reliable in the areas below.
            </p>

            <ul className="mt-6 flex flex-wrap gap-2" aria-label="Delivery areas">
              {siteConfig.areaServed.map((area) => (
                <li
                  key={area}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm text-text-dark"
                >
                  <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  {area}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <InstallButton className="w-full px-6 py-3 sm:w-auto" />
              <a
                href={siteConfig.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-white px-6 py-3 text-sm font-semibold text-text-dark sm:w-auto"
              >
                <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
                Get directions to Kohsar Plaza
              </a>
            </div>
          </div>

          <div className="space-y-6">
            <figure className="overflow-hidden rounded-3xl border border-border bg-white shadow-card-lg">
              <OptimizedImage
                src={delivery.src}
                alt={delivery.alt}
                width={delivery.width}
                height={delivery.height}
                sizes="(max-width: 1024px) 100vw, 480px"
                className="aspect-[16/10] h-auto w-full object-cover"
              />
            </figure>

            <div className="rounded-3xl border border-border bg-white p-8 shadow-card-lg">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Truck className="h-6 w-6 text-primary" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-text-dark">What we stock</h3>
                  <p className="text-sm text-muted">Everyday groceries for B-17 homes</p>
                </div>
              </div>
              <ul className="mt-6 space-y-3">
                {productCategories.map((category) => (
                  <li
                    key={category}
                    className="flex items-center gap-2 text-sm text-text-dark before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full before:bg-primary"
                  >
                    {category}
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-sm leading-relaxed text-muted">
                We focus on everyday essentials families need — dairy and frozen items, pantry
                staples, and household goods — not a produce market.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
