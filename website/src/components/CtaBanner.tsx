import { siteConfig } from '../config/site';

export default function CtaBanner() {
  return (
    <section className="bg-foreground py-14">
      <div className="section-pad text-center">
        <h2 className="text-2xl font-semibold text-background sm:text-3xl">Ready to order?</h2>
        <p className="mx-auto mt-2 max-w-lg text-zinc-400">
          Open the shop on your phone, add to cart, and get delivery or pickup — no app store required.
        </p>
        <a
          href={siteConfig.shopOrderUrl}
          className="mt-6 inline-flex h-12 items-center rounded-full bg-background px-8 text-base font-medium text-foreground transition hover:opacity-90"
        >
          Shop now at {siteConfig.shopSlug}
        </a>
      </div>
    </section>
  );
}
