import { orderSteps, paymentMethods } from '../data/features';
import { siteConfig } from '../config/site';

export default function OrderSteps() {
  return (
    <section id="order" className="scroll-mt-20 bg-slate-50 py-16 sm:py-20">
      <div className="section-pad">
        <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">How to order</h2>
        <p className="mt-2 max-w-xl text-slate-600">Three simple steps from browse to doorstep.</p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {orderSteps.map((s) => (
            <div
              key={s.step}
              className="relative rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-lg font-bold text-white">
                {s.step}
              </span>
              <h3 className="mt-4 text-xl font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{s.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h3 className="font-semibold text-slate-900">Payment & delivery options</h3>
          <div className="mt-4 flex flex-wrap gap-4">
            {paymentMethods.map((m) => (
              <div key={m.label} className="flex items-center gap-2 rounded-full bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
                <m.icon className="h-4 w-4 text-primary" />
                {m.label}
              </div>
            ))}
          </div>
          <a
            href={siteConfig.shopOrderUrl}
            className="mt-6 inline-block rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Open shop app to order
          </a>
        </div>
      </div>
    </section>
  );
}
