import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import Card from '../ui/Card';
import { slugifyReportTitle } from '../../lib/reportSlug';

export interface GenericCategoryPanelProps {
  title: string;
  subtitle?: string;
  /** Route segment matching server catalog, e.g. `inventory`, `cash_shift`. */
  categoryId: string;
  reports: string[];
}

export const GenericCategoryPanel: React.FC<GenericCategoryPanelProps> = ({ title, subtitle, categoryId, reports }) => {
  const location = useLocation();
  const qs = location.search || '';

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-[#0B2A5B] dark:text-slate-100">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {reports.map((name) => {
          const slug = slugifyReportTitle(name);
          const to = `/dashboard/reports/${encodeURIComponent(categoryId)}/${encodeURIComponent(slug)}${qs}`;
          return (
            <Link key={name} to={to} className="group block min-h-0 outline-none">
              <Card className="h-full border border-slate-200/80 bg-white/80 backdrop-blur-sm transition-shadow hover:border-[#0047AB]/40 hover:shadow-md dark:border-slate-700 dark:bg-slate-900/70 dark:hover:border-blue-500/50">
                <p className="text-sm font-semibold text-slate-800 group-hover:text-[#0047AB] dark:text-slate-100 dark:group-hover:text-blue-300">
                  {name}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Open dedicated report view with server pagination and CSV export.
                </p>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default GenericCategoryPanel;
