/** Mirrors `slugifyReportTitle` in `server/services/reporting/reportCatalog.ts` for client-side links. */
export function slugifyReportTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
