import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2, RefreshCw, Search } from 'lucide-react';
import { shopApi, ShopBrand, ShopProductCategory } from '../../../services/shopApi';
import { CURRENCY } from '../../../constants';

const PAGE_SIZE = 20;

type SortKey =
  | 'margin_pct'
  | 'margin_amount'
  | 'name'
  | 'sku'
  | 'barcode'
  | 'brand'
  | 'category_id'
  | 'subcategory_id'
  | 'unit'
  | 'cost_price'
  | 'retail_price'
  | 'on_hand'
  | 'available'
  | 'reserved_total'
  | 'reorder_point'
  | 'nearest_expiry'
  | 'sales_deactivated'
  | 'weight';

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'margin_pct', label: 'Margin %' },
  { key: 'margin_amount', label: `Margin (${CURRENCY})` },
  { key: 'sku', label: 'SKU' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'name', label: 'Product name' },
  { key: 'brand', label: 'Brand' },
  { key: 'category_id', label: 'Category' },
  { key: 'subcategory_id', label: 'Subcategory' },
  { key: 'unit', label: 'Unit' },
  { key: 'weight', label: 'Weight' },
  { key: 'cost_price', label: `Cost (${CURRENCY})` },
  { key: 'retail_price', label: `Retail (${CURRENCY})` },
  { key: 'on_hand', label: 'On hand' },
  { key: 'available', label: 'Available' },
  { key: 'reserved_total', label: 'Reserved' },
  { key: 'reorder_point', label: 'Reorder pt.' },
  { key: 'nearest_expiry', label: 'Nearest expiry' },
  { key: 'sales_deactivated', label: 'Sales off' },
];

function parseNum(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function marginPct(retail: number, cost: number): number | null {
  if (!(retail > 0)) return null;
  return ((retail - cost) / retail) * 100;
}

function formatMoney(n: number): string {
  return `${CURRENCY} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function summarizeWarehouses(ws: unknown): string {
  if (ws == null) return '—';
  if (typeof ws === 'string') {
    try {
      return summarizeWarehouses(JSON.parse(ws));
    } catch {
      return ws.length > 48 ? `${ws.slice(0, 45)}…` : ws;
    }
  }
  if (typeof ws === 'object' && !Array.isArray(ws)) {
    const keys = Object.keys(ws as object);
    return keys.length ? `${keys.length} warehouse${keys.length === 1 ? '' : 's'}` : '—';
  }
  return '—';
}

function formatAttributes(a: unknown): string {
  if (a == null || a === '') return '—';
  let o: unknown = a;
  if (typeof a === 'string') {
    try {
      o = JSON.parse(a);
    } catch {
      return a.length > 100 ? `${a.slice(0, 97)}…` : a;
    }
  }
  const s = JSON.stringify(o);
  return s.length > 100 ? `${s.slice(0, 97)}…` : s;
}

function formatExpiry(v: unknown): string {
  if (v == null || v === '') return '—';
  const d = typeof v === 'string' ? v.slice(0, 10) : String(v);
  return d || '—';
}

export default function HighMarginProducts() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('margin_pct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [categories, setCategories] = useState<ShopProductCategory[]>([]);
  const [brands, setBrands] = useState<ShopBrand[]>([]);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [sortKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cats, brs] = await Promise.all([shopApi.getShopCategories(), shopApi.getShopBrands()]);
        if (!cancelled) {
          setCategories(Array.isArray(cats) ? cats : []);
          setBrands(Array.isArray(brs) ? brs : []);
        }
      } catch {
        if (!cancelled) {
          setCategories([]);
          setBrands([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const categoryName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) {
      m.set(c.id, c.name);
    }
    return m;
  }, [categories]);

  const brandName = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of brands) {
      m.set(b.id, b.name);
    }
    return m;
  }, [brands]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await shopApi.getInventorySkus({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        sortBy: sortKey,
        sortDir,
      });
      setItems(res.items ?? []);
      setTotal(Number(res.total) || 0);
    } catch (e: any) {
      setError(e?.error || e?.message || 'Failed to load SKUs');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, search, sortKey, sortDir]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon: React.FC<{ col: SortKey }> = ({ col }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />;
    return sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />;
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginationNumbers = useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
    for (const p of [...pages]) {
      if (p < 1 || p > totalPages) pages.delete(p);
    }
    return [...pages].sort((a, b) => a - b);
  }, [page, totalPages]);

  const fromIdx = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const toIdx = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="animate-in fade-in space-y-5 duration-300">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-950/80 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#0B2A5B] dark:text-slate-100">High margin products</h2>
          <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500 dark:text-slate-400">
            Full SKU catalog with gross margin on retail price. Sorted by highest margin by default; use column headers to
            change sort. Pagination loads 20 SKUs per page from the server.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <div className="relative w-full min-w-[240px] sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search name, SKU, barcode…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50/80 py-2 pl-9 pr-3 text-sm outline-none ring-[#0047AB] focus:border-[#0047AB] focus:bg-white focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:focus:bg-slate-900"
              aria-label="Search SKUs"
            />
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-24 dark:border-slate-700 dark:bg-slate-900/60">
          <Loader2 className="h-9 w-9 animate-spin text-[#0047AB]" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[3200px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 dark:border-slate-600 dark:bg-slate-800/60">
                  <th className="sticky left-0 z-10 bg-slate-50/95 px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800/95 dark:text-slate-400">
                    Detail fields
                  </th>
                  {SORT_COLUMNS.map(({ key, label }) => (
                    <th
                      key={key}
                      role="columnheader"
                      className="cursor-pointer select-none whitespace-nowrap px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                      onClick={() => toggleSort(key)}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {label}
                        <SortIcon col={key} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/80">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={SORT_COLUMNS.length + 1} className="px-3 py-16 text-center text-slate-500 dark:text-slate-400">
                      No SKUs match your filters.
                    </td>
                  </tr>
                ) : (
                  items.map(row => {
                    const retail = parseNum(row.retail_price);
                    const cost = parseNum(row.cost_price);
                    const mp = marginPct(retail, cost);
                    const ma = retail - cost;
                    const catLabel =
                      (row.category_id && categoryName.get(String(row.category_id))) || row.category_id || '—';
                    const subLabel =
                      (row.subcategory_id && categoryName.get(String(row.subcategory_id))) ||
                      row.subcategory_id ||
                      '—';
                    const brandLabel =
                      String(row.brand ?? '').trim() ||
                      (row.brand_id ? brandName.get(String(row.brand_id)) : undefined) ||
                      '—';
                    const wu = row.weight_unit ? String(row.weight_unit) : '';
                    const wt =
                      row.weight != null && row.weight !== ''
                        ? `${parseNum(row.weight)}${wu ? ` ${wu}` : ''}`
                        : '—';
                    const salesOff = Boolean(row.sales_deactivated);
                    const desc = row.mobile_description || row.description || '';
                    const descShort = desc.length > 80 ? `${desc.slice(0, 77)}…` : desc || '—';

                    return (
                      <tr
                        key={String(row.id)}
                        className="transition hover:bg-slate-50/90 dark:hover:bg-slate-800/40"
                      >
                        <td className="sticky left-0 z-[1] border-r border-slate-100 bg-white/95 px-3 py-3 align-top text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-300">
                          <div className="space-y-1 font-medium">
                            <div>
                              <span className="text-slate-400">ID</span>{' '}
                              <span className="font-mono text-[11px]">{String(row.id)}</span>
                            </div>
                            <div title={desc}>
                              <span className="text-slate-400">Description</span> {descShort}
                            </div>
                            <div>
                              <span className="text-slate-400">Warehouses</span> {summarizeWarehouses(row.warehouse_stock)}
                            </div>
                            <div title={formatAttributes(row.attributes)}>
                              <span className="text-slate-400">Attributes</span> {formatAttributes(row.attributes)}
                            </div>
                            <div className="truncate" title={row.image_url ? String(row.image_url) : ''}>
                              <span className="text-slate-400">Image</span>{' '}
                              {row.image_url ? String(row.image_url).slice(0, 56) + (String(row.image_url).length > 56 ? '…' : '') : '—'}
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                          {mp != null ? `${mp.toFixed(2)}%` : '—'}
                        </td>
                        <td className={`whitespace-nowrap px-3 py-3 tabular-nums ${ma >= 0 ? 'text-slate-800 dark:text-slate-100' : 'text-red-600 dark:text-red-400'}`}>
                          {formatMoney(ma)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-900 dark:text-slate-100">
                          {row.sku || '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                          {row.barcode || '—'}
                        </td>
                        <td className="max-w-[14rem] px-3 py-3 font-semibold text-slate-900 dark:text-slate-100">
                          {row.name || '—'}
                        </td>
                        <td className="max-w-[10rem] truncate px-3 py-3 text-slate-700 dark:text-slate-300" title={brandLabel}>
                          {brandLabel}
                        </td>
                        <td className="max-w-[10rem] truncate px-3 py-3 text-slate-700 dark:text-slate-300" title={catLabel}>
                          {catLabel}
                        </td>
                        <td className="max-w-[10rem] truncate px-3 py-3 text-slate-600 dark:text-slate-400" title={subLabel}>
                          {subLabel}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-700 dark:text-slate-300">{row.unit || '—'}</td>
                        <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-700 dark:text-slate-300">{wt}</td>
                        <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-700 dark:text-slate-300">
                          {formatMoney(cost)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-800 dark:text-slate-200">
                          {formatMoney(retail)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-800 dark:text-slate-200">
                          {parseNum(row.on_hand).toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-800 dark:text-slate-200">
                          {parseNum(row.available).toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-800 dark:text-slate-200">
                          {parseNum(row.reserved_total).toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-700 dark:text-slate-300">
                          {parseNum(row.reorder_point).toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                          {formatExpiry(row.nearest_expiry)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <span
                            className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold ${
                              salesOff
                                ? 'border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                                : 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                            }`}
                          >
                            {salesOff ? 'Yes' : 'No'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col items-start justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs sm:flex-row sm:items-center dark:border-slate-600">
            <p className="text-slate-500 dark:text-slate-400">
              Showing {fromIdx} to {toIdx} of {total.toLocaleString()} SKU{total === 1 ? '' : 's'}
              {loading && items.length > 0 ? <span className="ml-2 text-[#0047AB]">Updating…</span> : null}.
            </p>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="inline-flex items-center gap-0.5 rounded-md px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </button>
              {paginationNumbers.map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  disabled={loading}
                  className={`min-w-8 rounded-md px-2.5 py-1.5 text-xs font-bold transition ${
                    page === n
                      ? 'bg-[#0047AB] text-white shadow-sm dark:bg-[#5b8cff]'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="inline-flex items-center gap-0.5 rounded-md px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
