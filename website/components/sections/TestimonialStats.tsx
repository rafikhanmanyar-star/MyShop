import { Star } from '@/components/icons';
import { stats } from '@/lib/data';

export default function TestimonialStats() {
  return (
    <section id="about" className="pb-16 sm:pb-20" aria-labelledby="about-heading">
      <div className="section-container">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <h2 id="about-heading" className="text-3xl font-bold text-text-dark sm:text-4xl">
            About oBo store Islamabad
          </h2>
          <p className="mt-3 text-muted">
            A local smart grocery store serving B-17 families with in-store shopping and
            online delivery
          </p>
        </div>
        <div className="overflow-hidden rounded-3xl border border-border bg-white shadow-card-lg">
          <div className="grid lg:grid-cols-2">
            <div className="border-b border-border p-8 sm:p-10 lg:border-b-0 lg:border-r">
              <div className="flex gap-1" role="img" aria-label="5 star rating">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-accent text-accent" aria-hidden="true" />
                ))}
              </div>
              <blockquote className="mt-5 text-lg leading-relaxed text-text-dark">
                &ldquo;oBo Store has completely changed how I shop for groceries. Fast delivery,
                great prices, and the app is so easy to use. I love the budget planner
                feature!&rdquo;
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
                  <p className="text-sm text-muted">Regular Customer, B-17 Islamabad</p>
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
