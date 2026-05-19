import { orderSteps, paymentMethods } from '../data/features';
import { siteConfig } from '../config/site';

export default function OrderSteps() {
  return (
    <section id="order" className="scroll-mt-20 bg-zinc-50 py-16 dark:bg-zinc-900 sm:py-20">
      <div className="section-pad">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">How to order</h2>
        <p className="mt-2 max-w-xl text-zinc-600 dark:text-zinc-400">Three simple steps from browse to doorstep.</p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {orderSteps.map((s) => (
            <div
              key={s.step}
              className="relative rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-lg font-bold text-background">
                {s.step}
              </span>
              <h3 className="mt-4 text-xl font-semibold text-foreground">{s.title}</h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{s.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 dark:border-zinc-700 dark:bg-zinc-950">
          <h3 className="font-semibold text-foreground">Payment & delivery options</h3>
          <div className="mt-4 flex flex-wrap gap-4">
            {paymentMethods.map((m) => (
              <div
                key={m.label}
                className="flex items-center gap-2 rounded-full bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                <m.icon className="h-4 w-4" />
                {m.label}
              </div>
            ))}
          </div>
          <a
            href={siteConfig.shopOrderUrl}
            className="mt-6 inline-flex h-12 items-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition hover:opacity-90"
          >
            Open shop app to order
          </a>
        </div>
      </div>
    </section>
  );
}
