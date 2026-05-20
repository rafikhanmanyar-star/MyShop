import {
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Users,
  Wallet,
} from '@/components/icons';
import { utilities } from '@/lib/data';

const icons = [Wallet, CalendarDays, Bell, BookOpen, Users, ClipboardList];

export default function SmartUtilities() {
  return (
    <section id="utilities" className="bg-dark-navy py-16 sm:py-20">
      <div className="section-container">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Smart Utilities for a Smarter You
          </h2>
          <p className="mt-3 text-muted">Plan better. Save more. Live easier.</p>
        </div>

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
      </div>
    </section>
  );
}
