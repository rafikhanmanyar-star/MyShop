import React, { useEffect, useState } from 'react';
import Card from '../../ui/Card';
import { reportsApi, type AuditSummaryResponse } from '../../../services/reportsApi';
import { useReportFilters } from '../../../hooks/useReportFilters';
import GenericCategoryPanel from '../GenericCategoryPanel';

const AUDIT_REPORT_TITLES = [
  'Void Transactions',
  'Cancelled Invoices',
  'Discount Audit',
  'Price Override Audit',
  'Login Activity',
  'Role & Permission Audit',
  'Deleted Records',
  'Failed Transactions',
  'Suspicious Activity Detection',
];

function StatCard(props: { title: string; value: string | number; hint?: string }) {
  return (
    <Card className="border border-slate-200/80 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-950/70">
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{props.title}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-[#0B2A5B] dark:text-slate-50">{props.value}</p>
      {props.hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{props.hint}</p>}
    </Card>
  );
}

const AuditReportsPanel: React.FC = () => {
  const { filters, range } = useReportFilters();
  const [data, setData] = useState<AuditSummaryResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const from = range.from;
  const to = range.to;
  const branch = filters.branchId?.trim() || null;

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      setErr('Select a valid date range in the filters above.');
      setData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await reportsApi.auditSummary({ from, to, branchId: branch });
        if (!cancelled) setData(res);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || e?.error || 'Unable to load audit summary');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to, branch]);

  if (err) {
    return (
      <Card className="border border-amber-200 bg-amber-50/90 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        <p className="font-semibold">Audit workspace</p>
        <p className="mt-1 text-sm">{err}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-[#0B2A5B] dark:text-slate-100">Audit &amp; security</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          POS voids, discounts, price overrides, and <span className="font-medium">system_logs</span> aggregates for the
          selected window{branch ? ' (branch-scoped where applicable).' : '.'}
        </p>
      </div>

      {loading && !data && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading audit summary…</p>
      )}

      {data && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Void tickets (shop_sales)"
              value={data.voidTransactions.count}
              hint={`Trend: ${data.voidTransactions.trend}`}
            />
            <StatCard
              title="Void + refunded"
              value={data.cancelledInvoices.count}
              hint="Cancelled / refunded invoices in range"
            />
            <StatCard title="Tickets with discount" value={data.discountAudit.linesWithDiscount} />
            <StatCard title="Price override lines" value={data.priceOverrides.lineCount} />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card className="border border-slate-200/80 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-950/70">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">System logs</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{data.systemLogs.entries}</span>{' '}
                entries,{' '}
                <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">{data.systemLogs.failedEntries}</span>{' '}
                with errors.
              </p>
              {data.systemLogs.topModules.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm text-slate-700 dark:text-slate-300">
                  {data.systemLogs.topModules.map((m) => (
                    <li key={m.module} className="flex justify-between gap-2">
                      <span className="truncate font-mono text-xs">{m.module || '(empty)'}</span>
                      <span className="shrink-0 tabular-nums font-semibold">{m.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="border border-slate-200/80 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-950/70">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Risk signals</p>
              {data.suspicious.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No heuristic alerts in this window.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {data.suspicious.map((s, i) => (
                    <li key={i} className="rounded-lg border border-amber-200/80 bg-amber-50/50 px-3 py-2 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
                      <p className="font-semibold text-amber-950 dark:text-amber-100">{s.label}</p>
                      <p className="mt-0.5 text-xs text-amber-900/90 dark:text-amber-200/90">{s.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      <GenericCategoryPanel
        title="Audit report catalog"
        subtitle="Each card opens the dedicated dataset with pagination and CSV export."
        categoryId="audit"
        reports={AUDIT_REPORT_TITLES}
      />
    </div>
  );
};

export default AuditReportsPanel;
