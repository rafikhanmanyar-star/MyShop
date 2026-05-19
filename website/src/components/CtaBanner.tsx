import { siteConfig } from '../config/site';

export default function CtaBanner() {
  return (
    <section className="bg-primary py-14">
      <div className="section-pad text-center">
        <h2 className="text-2xl font-bold text-white sm:text-3xl">Ready to order?</h2>
        <p className="mx-auto mt-2 max-w-lg text-indigo-100">
          Open the shop on your phone, add to cart, and get delivery or pickup — no app store required.
        </p>
        <a
          href={siteConfig.shopOrderUrl}
          className="mt-6 inline-block rounded-full bg-white px-8 py-3.5 text-base font-semibold text-primary shadow-lg hover:bg-slate-50"
        >
          Shop now at {siteConfig.shopSlug}
        </a>
      </div>
    </section>
  );
}
