import type { Feature } from '../data/features';

interface FeatureGridProps {
  id?: string;
  title: string;
  subtitle: string;
  features: Feature[];
  accent?: 'primary' | 'pos' | 'rider';
}

const accentMap = {
  primary: 'bg-indigo-50 text-primary',
  pos: 'bg-blue-50 text-pos',
  rider: 'bg-rose-50 text-rider',
};

export default function FeatureGrid({ id, title, subtitle, features, accent = 'primary' }: FeatureGridProps) {
  const iconClass = accentMap[accent];

  return (
    <section id={id} className="scroll-mt-20 py-16 sm:py-20">
      <div className="section-pad">
        <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-slate-600">{subtitle}</p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <article
              key={f.title}
              className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition hover:shadow-md"
            >
              <div className={`mb-4 inline-flex rounded-xl p-3 ${iconClass}`}>
                <f.icon className="h-6 w-6" strokeWidth={2} />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
