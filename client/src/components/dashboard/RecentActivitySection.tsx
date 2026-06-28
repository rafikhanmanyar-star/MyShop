import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Eye, Receipt, BookMarked, CreditCard } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { shopApi, khataApi, procurementApi } from '../../services/shopApi';
import { CURRENCY } from '../../constants';

type RecentRow = {
  id: string;
  ref: string;
  title: string;
  subtitle: string;
  amount: number;
  amountClass?: string;
  onOpen: () => void;
};

function money(n: number) {
  return `${CURRENCY} ${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortDate(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ymd(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function RecentCard({
  title,
  icon: Icon,
  rows,
  loading,
  onViewAll,
}: {
  title: string;
  icon: LucideIcon;
  rows: RecentRow[];
  loading: boolean;
  onViewAll: () => void;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-[10px] border border-gray-100 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:border-gray-700 dark:bg-card dark:shadow-none">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-[#4A90E2]" strokeWidth={2} aria-hidden />
          <h3 className="text-[0.7rem] font-bold uppercase tracking-wider text-[#6C757D] dark:text-muted-foreground">
            {title}
          </h3>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="inline-flex items-center gap-0.5 text-[0.7rem] font-semibold text-[#4A90E2] hover:underline"
        >
          View all
          <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} />
        </button>
      </div>
      <div className="flex-1 divide-y divide-gray-100 dark:divide-gray-700/70">
        {loading ? (
          [0, 1].map((i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="h-3 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-2.5 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
              </div>
              <div className="h-3 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ))
        ) : rows.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">No recent records.</div>
        ) : (
          rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={row.onOpen}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-gray-50 dark:hover:bg-slate-800/60"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-[#212529] dark:text-foreground">{row.ref}</span>
                </div>
                <p className="mt-0.5 truncate text-[0.7rem] text-[#6C757D] dark:text-muted-foreground">
                  {row.title}
                  {row.subtitle ? ` · ${row.subtitle}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <span className={`text-sm font-bold tabular-nums ${row.amountClass ?? 'text-[#212529] dark:text-foreground'}`}>
                  {money(row.amount)}
                </span>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-[#6C757D] dark:border-gray-600 dark:text-muted-foreground">
                  <Eye className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default function RecentActivitySection() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<any[]>([]);
  const [khata, setKhata] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [salesRes, khataRes, payRes] = await Promise.all([
        shopApi.getSales({ days: 90 }).catch(() => []),
        khataApi.getLedger().catch(() => []),
        procurementApi.getSupplierPayments().catch(() => []),
      ]);
      if (cancelled) return;
      const salesArr = Array.isArray(salesRes) ? salesRes : [];
      const khataArr = Array.isArray(khataRes) ? khataRes : [];
      const payArr = Array.isArray(payRes) ? payRes : [];
      setSales(
        [...salesArr]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 2)
      );
      setKhata(
        [...khataArr]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 2)
      );
      setPayments(payArr.slice(0, 2));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const salesRows: RecentRow[] = useMemo(
    () =>
      sales.map((s, i) => ({
        id: String(s.id ?? s.saleNumber ?? i),
        ref: String(s.saleNumber ?? '—'),
        title: s.customerName?.trim() || 'Walk-in customer',
        subtitle: shortDate(s.createdAt),
        amount: Number(s.grandTotal) || 0,
        amountClass: 'text-emerald-600 dark:text-emerald-400',
        onOpen: () => navigate(`/accounting/reports/daily?date=${ymd(s.createdAt)}`),
      })),
    [sales, navigate]
  );

  const khataRows: RecentRow[] = useMemo(
    () =>
      khata.map((k, i) => {
        const isDebit = String(k.type).toLowerCase() === 'debit';
        return {
          id: String(k.id ?? i),
          ref: k.sale_number?.trim() || (isDebit ? 'Credit sale' : 'Payment'),
          title: k.customer_name?.trim() || 'Customer',
          subtitle: k.note?.trim() || shortDate(k.created_at),
          amount: Number(k.amount) || 0,
          amountClass: isDebit ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400',
          onOpen: () => navigate('/khata'),
        };
      }),
    [khata, navigate]
  );

  const paymentRows: RecentRow[] = useMemo(
    () =>
      payments.map((p, i) => ({
        id: String(p.id ?? i),
        ref: p.reference?.trim() || String(p.payment_method || 'Payment'),
        title: p.supplier_name?.trim() || 'Supplier',
        subtitle: shortDate(p.payment_date),
        amount: Number(p.amount) || 0,
        amountClass: 'text-rose-600 dark:text-rose-400',
        onOpen: () => navigate('/procurement'),
      })),
    [payments, navigate]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-0.5">
        <span className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Recent activity</span>
        <span className="h-px min-w-[2rem] flex-1 bg-border dark:bg-slate-700" />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 lg:gap-4">
        <RecentCard
          title="Recent sales"
          icon={Receipt}
          rows={salesRows}
          loading={loading}
          onViewAll={() => navigate('/accounting/reports/daily')}
        />
        <RecentCard
          title="Recent khata"
          icon={BookMarked}
          rows={khataRows}
          loading={loading}
          onViewAll={() => navigate('/khata')}
        />
        <RecentCard
          title="Recent vendor payments"
          icon={CreditCard}
          rows={paymentRows}
          loading={loading}
          onViewAll={() => navigate('/procurement')}
        />
      </div>
    </div>
  );
}
