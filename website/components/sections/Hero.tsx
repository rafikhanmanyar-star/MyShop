import { BadgeCheck, CreditCard, Play, RotateCcw, Truck } from '@/components/icons';
import InstallButton from '@/components/InstallButton';
import PhoneMockup from '@/components/PhoneMockup';

const chips = [
  { icon: Truck, label: 'Fast Delivery' },
  { icon: BadgeCheck, label: 'Live Tracking' },
  { icon: RotateCcw, label: 'Easy Returns' },
  { icon: CreditCard, label: 'Secure Payments' },
];

export default function Hero() {
  return (
    <section id="home" className="overflow-hidden bg-background py-12 sm:py-16 lg:py-20">
      <div className="section-container">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
              <BadgeCheck className="h-4 w-4" aria-hidden="true" />
              Trusted by Thousands of Families
            </span>

            <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight text-text-dark sm:text-5xl lg:text-[3.25rem]">
              Your Trusted Smart{' '}
              <span className="text-primary">Grocery</span> Store.
            </h1>

            <p className="mt-5 text-base leading-relaxed text-muted sm:text-lg">
              Order groceries, snacks, dairy, frozen items, and household essentials with
              real-time tracking, fast delivery, and smart planning utilities — all in one
              modern app.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <InstallButton className="w-full px-6 py-3 sm:w-auto" />
              <a
                href="#how-it-works"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-white px-6 py-3 text-sm font-semibold text-text-dark sm:w-auto"
              >
                <Play className="h-4 w-4 text-primary" aria-hidden="true" />
                How It Works
              </a>
            </div>

            <div className="mt-8 flex flex-wrap gap-4">
              {chips.map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2 text-sm text-muted">
                  <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-center lg:justify-end">
            <PhoneMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
