import type { Feature } from '../data/features';

interface FeatureGridProps {
  id?: string;
  title: string;
  subtitle: string;
  features: Feature[];
  accent?: 'brand' | 'pos' | 'rider';
}

const accentMap = {
  brand: 'bg-zinc-100 text-brand dark:bg-zinc-800',
  pos: 'bg-blue-50 text-pos dark:bg-blue-950',
  rider: 'bg-rose-50 text-rider dark:bg-rose-950',
};

export default function FeatureGrid({ id, title, subtitle, features, accent = 'brand' }: FeatureGridProps) {
  const iconClass = accentMap[accent];

  return (
    <section id={id} className="scroll-mt-20 py-16 sm:py-20">
      <div className="section-pad">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-zinc-600 dark:text-zinc-400">{subtitle}</p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <article
              key={f.title}
              className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className={`mb-4 inline-flex rounded-xl p-3 ${iconClass}`}>
                <f.icon className="h-6 w-6" strokeWidth={2} />
              </div>
              <h3 className="text-lg font-semibold text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{f.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
