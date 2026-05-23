import Link from 'next/link';

type LegalSection = {
  heading: string;
  paragraphs: string[];
  listItems?: string[];
};

type LegalDocumentProps = {
  title: string;
  intro: string;
  sections: LegalSection[];
  lastUpdated?: string;
};

export default function LegalDocument({
  title,
  intro,
  sections,
  lastUpdated = 'May 22, 2026',
}: LegalDocumentProps) {
  const lastUpdatedIso = '2026-05-22';

  return (
    <article className="py-12 sm:py-16">
      <div className="section-container mx-auto max-w-3xl">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted">
          <Link href="/" className="hover:text-primary">
            Home
          </Link>
          <span className="mx-2" aria-hidden="true">
            /
          </span>
          <span aria-current="page" className="text-text-dark">
            {title}
          </span>
        </nav>

        <h1 className="text-3xl font-bold text-text-dark sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted">
          <time dateTime={lastUpdatedIso}>Last updated: {lastUpdated}</time>
        </p>
        <p className="mt-6 text-base leading-relaxed text-muted">{intro}</p>

        <div className="mt-10 space-y-8">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-xl font-semibold text-text-dark">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 48)} className="mt-3 text-sm leading-relaxed text-muted">
                  {paragraph}
                </p>
              ))}
              {section.listItems && section.listItems.length > 0 && (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
                  {section.listItems.map((item) => (
                    <li key={item.slice(0, 48)}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <p className="mt-10 text-sm text-muted">
          Questions?{' '}
          <Link href="/contact" className="font-semibold text-primary hover:text-primary/80">
            Contact oBo Store customer support
          </Link>
        </p>
      </div>
    </article>
  );
}
