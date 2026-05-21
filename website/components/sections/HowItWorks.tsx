import {
  ArrowRight,
  Download,
  Gift,
  MapPin,
  Package,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Truck,
} from '@/components/icons';
import InstallButton from '@/components/InstallButton';
import OptimizedImage from '@/components/OptimizedImage';
import SectionHeading from '@/components/SectionHeading';
import { howItWorksLandingSteps, howItWorksSteps } from '@/lib/data';
import { siteImages } from '@/lib/images';

const landingIcons = [Download, ShoppingCart, MapPin];
const stepIcons = [ShoppingBag, ShoppingCart, Truck, Gift, Package, Smartphone];

type HowItWorksProps = {
  headingLevel?: 'h1' | 'h2';
  compact?: boolean;
};

export default function HowItWorks({ headingLevel = 'h2', compact = false }: HowItWorksProps) {
  const install = siteImages.pwaInstall;
  const steps = compact ? howItWorksLandingSteps : howItWorksSteps;

  return (
    <section id="how-it-works" className="py-16 sm:py-20" aria-labelledby="how-it-works-heading">
      <div className="section-container">
        <SectionHeading
          level={headingLevel}
          id="how-it-works-heading"
          title="How oBo Store Works"
          description={
            compact
              ? 'Install, shop, and track — grocery delivery made simple in B-17 Islamabad.'
              : 'From browse to doorstep — simple local grocery delivery in B-17 Islamabad.'
          }
          align="center"
        />

        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_320px] lg:items-start">
          <div
            className={
              compact
                ? 'grid gap-4 sm:grid-cols-3'
                : 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
            }
          >
            {steps.map((item, index) => {
              const Icon = compact ? landingIcons[index] : stepIcons[index];
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
                  {compact && index < steps.length - 1 && (
                    <ArrowRight
                      className="absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-primary sm:block"
                      aria-hidden="true"
                    />
                  )}
                  {!compact && index < steps.length - 1 && index % 3 !== 2 && (
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
            aria-labelledby="install-sidebar-heading"
          >
            <h3 id="install-sidebar-heading" className="text-lg font-bold text-text-dark">
              {compact ? 'Install as App (PWA)' : 'Quick install guide'}
            </h3>
            <p className="mt-2 text-sm text-muted">
              {compact
                ? 'Add oBo Store to your home screen for faster reordering and live tracking.'
                : 'Tap install and add oBo to your home screen for faster reordering from FMC B-17.'}
            </p>

            <figure className="mt-5 overflow-hidden rounded-2xl border border-border bg-background">
              <OptimizedImage
                src={install.src}
                alt={install.alt}
                width={install.width}
                height={install.height}
                sizes="320px"
                className="h-auto w-full"
              />
            </figure>

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
