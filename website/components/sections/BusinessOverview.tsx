import { productCategories, siteConfig } from '@/lib/data';

export default function BusinessOverview() {
  return (
    <section
      id="about-business"
      className="border-y border-border bg-white py-16 sm:py-20"
      aria-labelledby="business-overview-heading"
    >
      <div className="section-container">
        <div className="mx-auto max-w-3xl text-center">
          <h2 id="business-overview-heading" className="text-3xl font-bold text-text-dark sm:text-4xl">
            Your Local Grocery Store in B-17 Islamabad
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted sm:text-lg">
            oBo Store is a modern grocery store at {siteConfig.address}, {siteConfig.addressLine2}.
            We combine in-store shopping on Main Boulevard with smart grocery delivery across B-17
            Islamabad — so families get snacks, beverages, dairy and frozen items, and household
            essentials without the hassle.
          </p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-3">
          <article className="rounded-2xl border border-border bg-background p-6 shadow-card">
            <h3 className="text-lg font-semibold text-text-dark">What We Offer</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              From pantry staples to personal care, oBo Store stocks everyday products families rely
              on. Browse in store at FMC B-17 Kohsar Plaza or order online through our smart grocery
              shopping app.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted">
              {productCategories.map((category) => (
                <li key={category} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  {category}
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-2xl border border-border bg-background p-6 shadow-card">
            <h3 className="text-lg font-semibold text-text-dark">Where We Deliver</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Based at Kohsar Plaza on Main Boulevard, we serve B-17 Islamabad and nearby sectors
              with fast grocery delivery. Install our PWA for real-time tracking from store to
              doorstep.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted">
              {siteConfig.areaServed.slice(0, 4).map((area) => (
                <li key={area} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  {area}
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-2xl border border-border bg-background p-6 shadow-card">
            <h3 className="text-lg font-semibold text-text-dark">Why Customers Trust Us</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              oBo Store is built for busy households that want reliable service, fair prices, and
              secure ordering. Open daily {siteConfig.hours.toLowerCase()}, we make smart grocery
              shopping simple — online or in person.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                Real-time order tracking
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                Secure payments and easy returns
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                Smart utilities for meal and budget planning
              </li>
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}
