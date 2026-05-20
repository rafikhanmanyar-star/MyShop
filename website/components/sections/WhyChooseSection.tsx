import {
  DollarSign,
  MapPin,
  RotateCcw,
  ShieldCheck,
  Star,
  Store,
  Truck,
} from '@/components/icons';
import SectionHeading from '@/components/SectionHeading';
import { stats, trustFeatures } from '@/lib/data';

const icons = [Truck, MapPin, DollarSign, RotateCcw, Store, ShieldCheck];

type WhyChooseSectionProps = {
  headingLevel?: 'h1' | 'h2';
};

export default function WhyChooseSection({ headingLevel = 'h2' }: WhyChooseSectionProps) {
  return (
    <section id="why-choose" className="pb-16 sm:pb-20" aria-labelledby="why-choose-heading">
      <div className="section-container">
        <SectionHeading
          level={headingLevel}
          id="why-choose-heading"
          title="Why Choose oBo Store"
          description="Your nearby grocery store on Main Boulevard at Kohsar Plaza, FMC B-17 — with local grocery delivery across B-17 Islamabad."
          align="center"
        />

        <div className="mt-10 rounded-3xl border border-border bg-white p-6 shadow-card sm:p-8">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
            {trustFeatures.map((feature, index) => {
              const Icon = icons[index];
              return (
                <div
                  key={feature.title}
                  className="flex flex-col items-center text-center sm:items-start sm:text-left"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                  <h3 className="text-sm font-semibold text-text-dark">{feature.title}</h3>
                  <p className="mt-0.5 text-xs text-muted">{feature.subtitle}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-8 overflow-hidden rounded-3xl border border-border bg-white shadow-card-lg">
          <div className="grid lg:grid-cols-2">
            <div className="border-b border-border p-8 sm:p-10 lg:border-b-0 lg:border-r">
              <div className="flex gap-1" role="img" aria-label="5 star rating">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-accent text-accent" aria-hidden="true" />
                ))}
              </div>
              <blockquote className="mt-5 text-lg leading-relaxed text-text-dark">
                &ldquo;oBo Store is the nearby grocery store we rely on in B-17. Local grocery
                delivery is fast, prices are fair, and ordering household essentials takes
                minutes.&rdquo;
              </blockquote>
              <div className="mt-6 flex items-center gap-3">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
                  aria-hidden="true"
                >
                  SK
                </div>
                <div>
                  <p className="font-semibold text-text-dark">Sarah Khan</p>
                  <p className="text-sm text-muted">Regular customer, B-17 Islamabad</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2">
              {stats.map((stat, index) => (
                <div
                  key={stat.label}
                  className={`flex flex-col items-center justify-center p-8 text-center ${
                    index % 2 === 0 ? 'border-r border-border' : ''
                  } ${index < 2 ? 'border-b border-border' : ''}`}
                >
                  <p className="text-2xl font-bold text-primary sm:text-3xl">{stat.value}</p>
                  <p className="mt-1 text-sm text-muted">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
