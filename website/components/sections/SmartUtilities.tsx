import Link from 'next/link';
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Users,
  Wallet,
} from '@/components/icons';
import OptimizedImage from '@/components/OptimizedImage';
import SectionHeading from '@/components/SectionHeading';
import { utilities } from '@/lib/data';
import { siteImages } from '@/lib/images';

const icons = [Wallet, CalendarDays, Bell, BookOpen, Users, ClipboardList];

type SmartUtilitiesProps = {
  headingLevel?: 'h1' | 'h2';
  showExploreLink?: boolean;
  variant?: 'full' | 'banner';
};

export default function SmartUtilities({
  headingLevel = 'h2',
  showExploreLink = true,
  variant = 'full',
}: SmartUtilitiesProps) {
  const budget = siteImages.budgetPlanner;

  if (variant === 'banner') {
    return (
      <section id="utilities" className="pb-16 sm:pb-20" aria-labelledby="utilities-heading">
        <div className="section-container">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-primary to-cta px-4 py-8 sm:px-8 sm:py-10">
            <h2 id="utilities-heading" className="sr-only">
              Smart Utilities for a Smarter You
            </h2>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
              {utilities.map((utility, index) => {
                const Icon = icons[index];
                return (
                  <div key={utility.title} className="flex flex-col items-center text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-white/10">
                      <Icon className="h-5 w-5 text-white" aria-hidden="true" />
                    </div>
                    <p className="text-sm font-semibold text-white">{utility.title}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="utilities" className="bg-dark-navy py-16 sm:py-20" aria-labelledby="utilities-heading">
      <div className="section-container">
        <div className="mx-auto max-w-2xl text-center">
          <SectionHeading
            level={headingLevel}
            id="utilities-heading"
            title="Smart Utilities for a Smarter You"
            description="Plan budgets, weekly menus, and family shopping — built for households in B-17 Islamabad."
            align="center"
            titleClassName="text-3xl font-bold text-white sm:text-4xl"
            descriptionClassName="mt-3 text-slate-400"
          />
          {showExploreLink && headingLevel === 'h2' && (
            <Link
              href="/utilities"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary-on-dark hover:text-white"
            >
              Explore smart grocery utilities
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>

        <figure className="mx-auto mt-10 max-w-xl overflow-hidden rounded-3xl border border-white/10 shadow-card-lg">
          <OptimizedImage
            src={budget.src}
            alt={budget.alt}
            width={budget.width}
            height={budget.height}
            sizes="(max-width: 768px) 100vw, 480px"
            className="aspect-[3/2] h-auto w-full object-cover"
          />
        </figure>

        <div className="mt-10 flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible lg:grid-cols-6">
          {utilities.map((utility, index) => {
            const Icon = icons[index];
            return (
              <article
                key={utility.title}
                className="min-w-[200px] shrink-0 rounded-2xl border border-white/10 bg-white/5 p-5 md:min-w-0"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <h3 className="text-sm font-semibold text-white">{utility.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">{utility.description}</p>
              </article>
            );
          })}
        </div>

        {showExploreLink && headingLevel === 'h2' && (
          <p className="mt-8 text-center text-sm text-slate-400">
            <Link href="/utilities" className="font-semibold text-primary-on-dark hover:text-white">
              Learn about budget planner, menu planner, and other oBo Store utilities
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
