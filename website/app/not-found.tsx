import Link from 'next/link';
import SiteShell from '@/components/SiteShell';
import { createNoIndexMetadata } from '@/lib/page-metadata';

export const metadata = createNoIndexMetadata(
  'Page Not Found | oBo Store',
  'The page you are looking for could not be found. Return to oBo Store to order groceries in B-17 Islamabad.'
);

export default function NotFound() {
  return (
    <SiteShell>
      <section className="py-20 text-center">
        <div className="section-container">
          <h1 className="text-3xl font-bold text-text-dark sm:text-4xl">Page not found</h1>
          <p className="mx-auto mt-4 max-w-md text-muted">
            We could not find that page. Head back to oBo Store to browse groceries and delivery
            options in B-17 Islamabad.
          </p>
          <nav className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center" aria-label="Helpful links">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white"
            >
              Return to home
            </Link>
            <Link
              href="/contact"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-border px-6 py-3 text-sm font-semibold text-text-dark"
            >
              Contact oBo Store
            </Link>
          </nav>
        </div>
      </section>
    </SiteShell>
  );
}
