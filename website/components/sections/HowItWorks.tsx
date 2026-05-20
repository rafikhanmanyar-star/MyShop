import {
  ArrowRight,
  Gift,
  Package,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Truck,
} from '@/components/icons';
import InstallButton from '@/components/InstallButton';
import { howItWorksSteps } from '@/lib/data';

const stepIcons = [ShoppingBag, ShoppingCart, Truck, Gift, Package, Smartphone];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-16 sm:py-20">
      <div className="section-container">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-text-dark sm:text-4xl">How oBo Store Works</h2>
          <p className="mt-3 text-muted">Simple steps to get your order</p>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_340px] lg:items-start">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {howItWorksSteps.map((item, index) => {
              const Icon = stepIcons[index];
              return (
                <article
                  key={item.title}
                  className="relative rounded-2xl border border-border bg-white p-5 shadow-card"
                >
                  <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                    {item.step}
                  </div>
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                  <h3 className="text-sm font-semibold text-text-dark">{item.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted">{item.description}</p>
                  {index < howItWorksSteps.length - 1 && index % 3 !== 2 && (
                    <ArrowRight
                      className="absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-primary lg:block"
                      aria-hidden="true"
                    />
                  )}
                </article>
              );
            })}
          </div>

          <aside
            id="install"
            className="rounded-3xl border border-border bg-white p-6 shadow-card-lg lg:sticky lg:top-24"
          >
            <h3 className="text-lg font-bold text-text-dark">Install as App (PWA)</h3>
            <p className="mt-2 text-sm text-muted">
              Tap the install button and enjoy the app-like experience.
            </p>

            {/* Browser install mockup */}
            <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-background">
              <div className="flex items-center gap-1 border-b border-border bg-white px-3 py-2">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                <span className="h-2 w-2 rounded-full bg-accent" />
                <span className="h-2 w-2 rounded-full bg-green-400" />
              </div>
              <div className="p-4">
                <div className="rounded-xl border border-border bg-white p-3 shadow-sm">
                  <p className="text-xs font-semibold text-text-dark">Add to Home Screen</p>
                  <p className="mt-1 text-[10px] text-muted">Install oBo Store for quick access</p>
                  <div className="mt-3 flex gap-2">
                    <span className="rounded-lg border border-border px-3 py-1 text-[10px] text-muted">
                      Cancel
                    </span>
                    <span className="rounded-lg bg-primary px-3 py-1 text-[10px] font-semibold text-white">
                      Install
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5">
              <InstallButton className="w-full px-6 py-3" />
            </div>
            <p className="mt-3 text-center text-xs text-muted">Light · Fast · Reliable</p>
          </aside>
        </div>
      </div>
    </section>
  );
}
