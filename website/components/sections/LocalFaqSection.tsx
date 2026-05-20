import Link from 'next/link';
import SectionHeading from '@/components/SectionHeading';
import { faqItems, siteConfig } from '@/lib/data';

type LocalFaqSectionProps = {
  headingLevel?: 'h1' | 'h2';
  showContactCta?: boolean;
};

/** Optional contextual links per FAQ — descriptive anchor text for internal linking */
const faqRelatedLinks: Partial<
  Record<
    (typeof faqItems)[number]['question'],
    { href: string; label: string; external?: boolean }[]
  >
> = {
  'Where is oBo Store located?': [
    { href: '/contact', label: 'View store address and contact details' },
  ],
  'Does oBo Store offer grocery delivery?': [
    { href: '/#delivery', label: 'See our B-17 delivery areas' },
    { href: '/contact', label: 'Contact us about delivery' },
  ],
  'Can I install oBo Store like an app?': [
    { href: siteConfig.shopUrl, label: 'Open oBo Store app', external: true },
  ],
  'Does oBo Store offer returns?': [
    { href: '/return-policy', label: 'Read our return policy' },
    { href: '/contact', label: 'Contact support about a return' },
  ],
};

export default function LocalFaqSection({
  headingLevel = 'h2',
  showContactCta = true,
}: LocalFaqSectionProps) {
  return (
    <section id="faq" className="bg-background py-16 sm:py-20" aria-labelledby="faq-heading">
      <div className="section-container">
        <SectionHeading
          level={headingLevel}
          id="faq-heading"
          title="Frequently Asked Questions"
          description="Common questions about oBo Store at FMC B-17 Kohsar Plaza, grocery delivery, and our PWA."
          align="center"
        />

        <dl className="mx-auto mt-10 max-w-3xl divide-y divide-border rounded-3xl border border-border bg-white shadow-card">
          {faqItems.map((item) => {
            const related = faqRelatedLinks[item.question];

            return (
              <div key={item.question} className="px-6 py-5 first:rounded-t-3xl last:rounded-b-3xl">
                <dt>
                  <h3 className="text-base font-semibold text-text-dark">{item.question}</h3>
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-muted">{item.answer}</dd>
                {related && related.length > 0 && (
                  <dd className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                    {related.map((link) =>
                      link.external ? (
                        <a
                          key={link.href}
                          href={link.href}
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-primary hover:text-primary/80"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          key={link.href}
                          href={link.href}
                          className="text-sm font-medium text-primary hover:text-primary/80"
                        >
                          {link.label}
                        </Link>
                      ),
                    )}
                  </dd>
                )}
              </div>
            );
          })}
        </dl>

        {showContactCta && (
          <p className="mx-auto mt-8 max-w-3xl text-center text-sm text-muted">
            Still have a question?{' '}
            <Link href="/contact" className="font-semibold text-primary hover:text-primary/80">
              Contact oBo Store at FMC B-17 Kohsar Plaza
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
