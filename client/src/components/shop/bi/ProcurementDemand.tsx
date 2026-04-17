import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { procurementDemandApi } from '../../../services/shopApi';
import { CURRENCY } from '../../../constants';
import {
  AlertTriangle, ArrowUpDown, ChevronDown, ChevronUp, Download,
  Filter, Loader2, Package, RefreshCw, Settings2, ShoppingCart, TrendingUp, Zap,
} from 'lucide-react';

interface DemandItem {
  product_id: string;
  product_name: string;
  sku: string;
  category_name: string | null;
  current_stock: number;
  avg_daily_sales: number;
  days_of_stock: number | null;
  suggested_order_qty: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW' | 'NO_DATA';
  cost_price: number;
  retail_price: number;
}

interface DemandSettings {
  salesWindowDays: number;
  minimumDaysThreshold: number;
  targetStockDays: number;
}

interface DemandSummary {
  total_products: number;
  high_priority: number;
  medium_priority: number;
  low_priority: number;
  no_data: number;
  estimated_purchase_cost: number;
}

type SortKey = 'product_name' | 'current_stock' | 'avg_daily_sales' | 'days_of_stock' | 'suggested_order_qty' | 'priority' | 'cost_price';
type FilterMode = 'all' | 'high' | 'medium' | 'low_stock' | 'fast_moving' | 'needs_order';

const PRIORITY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, NO_DATA: 3 };

const PriorityBadge: React.FC<{ priority: string }> = ({ priority }) => {
  const styles: Record<string, string> = {
    HIGH: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 ring-red-200 dark:ring-red-800',
    MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 ring-amber-200 dark:ring-amber-800',
    LOW: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-800',
    NO_DATA: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 ring-slate-200 dark:ring-slate-700',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${styles[priority] || styles.NO_DATA}`}>
      {priority === 'NO_DATA' ? 'No Data' : priority}
    </span>
  );
};

const StatCard: React.FC<{ label: string; value: string | number; icon: React.ReactNode; color: string }> = ({ label, value, icon, color }) => (
  <div className={`rounded-xl border p-4 ${color}`}>
    <div className="flex items-center gap-3">
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium opacity-70 truncate">{label}</p>
        <p className="text-xl font-bold tabular-nums">{value}</p>
      </div>
    </div>
  </div>
);

const ProcurementDemand: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DemandItem[]>([]);
  const [summary, setSummary] = useState<DemandSummary | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [settings, setSettings] = useState<DemandSettings>({
    salesWindowDays: 7,
    minimumDaysThreshold: 5,
    targetStockDays: 15,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('priority');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [showDraftModal, setShowDraftModal] = useState(false);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await procurementDemandApi.analyze(settings);
      setItems(result.items || []);
      setSummary(result.summary || null);
      setGeneratedAt(result.generated_at || new Date().toISOString());
      setSelected(new Set());
    } catch (e: any) {
      setError(e?.error || e?.message || 'Failed to analyze');
    } finally {
      setLoading(false);
    }
  }, [settings]);

  useEffect(() => {
    runAnalysis();
  }, []);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon: React.FC<{ col: SortKey }> = ({ col }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3.5 h-3.5 opacity-30" />;
    return sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />;
  };

  const filtered = useMemo(() => {
    let list = [...items];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.product_name.toLowerCase().includes(q) ||
        (i.sku && i.sku.toLowerCase().includes(q)) ||
        (i.category_name && i.category_name.toLowerCase().includes(q))
      );
    }

    switch (filterMode) {
      case 'high':
        list = list.filter(i => i.priority === 'HIGH');
        break;
      case 'medium':
        list = list.filter(i => i.priority === 'MEDIUM');
        break;
      case 'low_stock':
        list = list.filter(i => i.current_stock <= 0 || (i.days_of_stock !== null && i.days_of_stock <= settings.minimumDaysThreshold));
        break;
      case 'fast_moving':
        list = list.filter(i => i.avg_daily_sales > 0);
        list.sort((a, b) => b.avg_daily_sales - a.avg_daily_sales);
        break;
      case 'needs_order':
        list = list.filter(i => i.suggested_order_qty > 0);
        break;
    }

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'product_name': cmp = a.product_name.localeCompare(b.product_name); break;
        case 'current_stock': cmp = a.current_stock - b.current_stock; break;
        case 'avg_daily_sales': cmp = a.avg_daily_sales - b.avg_daily_sales; break;
        case 'days_of_stock': cmp = (a.days_of_stock ?? 9999) - (b.days_of_stock ?? 9999); break;
        case 'suggested_order_qty': cmp = a.suggested_order_qty - b.suggested_order_qty; break;
        case 'priority': cmp = (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9); break;
        case 'cost_price': cmp = a.cost_price - b.cost_price; break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return list;
  }, [items, search, filterMode, sortKey, sortDir, settings.minimumDaysThreshold]);

  const toggleSelectAll = () => {
    const actionable = filtered.filter(i => i.suggested_order_qty > 0);
    if (selected.size === actionable.length && actionable.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(actionable.map(i => i.product_id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedItems = useMemo(
    () => items.filter(i => selected.has(i.product_id) && i.suggested_order_qty > 0),
    [items, selected]
  );

  const selectedCost = useMemo(
    () => selectedItems.reduce((sum, i) => sum + i.suggested_order_qty * i.cost_price, 0),
    [selectedItems]
  );

  const handleSaveDraft = async () => {
    if (selectedItems.length === 0) return;
    setSaving(true);
    try {
      const draftItems = selectedItems.map(i => ({
        productId: i.product_id,
        suggestedQty: i.suggested_order_qty,
        finalQty: i.suggested_order_qty,
        currentStock: i.current_stock,
        avgDailySales: i.avg_daily_sales,
        daysOfStock: i.days_of_stock,
        priority: i.priority,
      }));
      await procurementDemandApi.saveDraft({
        name: draftName || `Purchase List ${new Date().toLocaleDateString()}`,
        items: draftItems,
        settings,
      });
      setShowDraftModal(false);
      setDraftName('');
      setSelected(new Set());
    } catch (e: any) {
      setError(e?.error || 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  const exportCSV = () => {
    const rows = [
      ['Product', 'SKU', 'Category', 'Stock', 'Avg Daily Sales', 'Days of Stock', 'Suggested Qty', 'Priority', 'Est. Cost'],
      ...filtered.map(i => [
        i.product_name,
        i.sku,
        i.category_name || '',
        i.current_stock,
        i.avg_daily_sales,
        i.days_of_stock ?? 'N/A',
        i.suggested_order_qty,
        i.priority,
        (i.suggested_order_qty * i.cost_price).toFixed(2),
      ])
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `procurement-demand-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filters: { key: FilterMode; label: string }[] = [
    { key: 'all', label: 'All Products' },
    { key: 'high', label: 'High Priority' },
    { key: 'medium', label: 'Medium Priority' },
    { key: 'low_stock', label: 'Low Stock' },
    { key: 'fast_moving', label: 'Fast Moving' },
    { key: 'needs_order', label: 'Needs Order' },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            label="Total Products"
            value={summary.total_products}
            icon={<Package className="w-5 h-5" />}
            color="bg-card border-border text-foreground"
          />
          <StatCard
            label="High Priority"
            value={summary.high_priority}
            icon={<AlertTriangle className="w-5 h-5 text-red-500" />}
            color="bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-800 dark:text-red-200"
          />
          <StatCard
            label="Medium Priority"
            value={summary.medium_priority}
            icon={<Zap className="w-5 h-5 text-amber-500" />}
            color="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200"
          />
          <StatCard
            label="Low Priority"
            value={summary.low_priority}
            icon={<TrendingUp className="w-5 h-5 text-emerald-500" />}
            color="bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200"
          />
          <StatCard
            label="No Data"
            value={summary.no_data}
            icon={<Package className="w-5 h-5 text-slate-400" />}
            color="bg-card border-border text-muted-foreground"
          />
          <StatCard
            label="Est. Purchase Cost"
            value={`${CURRENCY} ${summary.estimated_purchase_cost.toLocaleString()}`}
            icon={<ShoppingCart className="w-5 h-5 text-indigo-500" />}
            color="bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-900 text-indigo-800 dark:text-indigo-200"
          />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-card text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
          />
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setFilterMode(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterMode === f.key
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg border border-border bg-card hover:bg-muted transition"
            title="Settings"
          >
            <Settings2 className="w-4 h-4" />
          </button>
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={exportCSV}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:bg-muted disabled:opacity-50 transition"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Analysis Settings</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="pd-sales-window" className="block text-xs font-medium text-muted-foreground mb-1">Sales Analysis Window (days)</label>
              <input
                id="pd-sales-window"
                type="number"
                min={1}
                max={90}
                value={settings.salesWindowDays}
                onChange={e => setSettings(s => ({ ...s, salesWindowDays: Math.max(1, parseInt(e.target.value) || 7) }))}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              />
            </div>
            <div>
              <label htmlFor="pd-min-threshold" className="block text-xs font-medium text-muted-foreground mb-1">Min. Days Threshold</label>
              <input
                id="pd-min-threshold"
                type="number"
                min={1}
                max={30}
                value={settings.minimumDaysThreshold}
                onChange={e => setSettings(s => ({ ...s, minimumDaysThreshold: Math.max(1, parseInt(e.target.value) || 5) }))}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              />
            </div>
            <div>
              <label htmlFor="pd-target-stock" className="block text-xs font-medium text-muted-foreground mb-1">Target Stock (days)</label>
              <input
                id="pd-target-stock"
                type="number"
                min={1}
                max={90}
                value={settings.targetStockDays}
                onChange={e => setSettings(s => ({ ...s, targetStockDays: Math.max(1, parseInt(e.target.value) || 15) }))}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              />
            </div>
          </div>
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="mt-3 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            Apply & Refresh
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Selected Actions Bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-4 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-3">
          <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
            {selected.size} item{selected.size !== 1 ? 's' : ''} selected
          </span>
          <span className="text-xs text-indigo-600 dark:text-indigo-400">
            Est. cost: {CURRENCY} {selectedCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
          <button
            onClick={() => { setDraftName(`Purchase List ${new Date().toLocaleDateString()}`); setShowDraftModal(true); }}
            className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition shadow-sm"
          >
            <ShoppingCart className="w-4 h-4" />
            Generate Purchase List
          </button>
        </div>
      )}

      {/* Main Table */}
      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-3 text-left w-10">
                    <input
                      type="checkbox"
                      checked={selected.size > 0 && selected.size === filtered.filter(i => i.suggested_order_qty > 0).length}
                      onChange={toggleSelectAll}
                      className="rounded border-border"
                      title="Select all"
                    />
                  </th>
                  {([
                    ['product_name', 'Product'],
                    ['current_stock', 'Stock'],
                    ['avg_daily_sales', 'Avg/Day'],
                    ['days_of_stock', 'Days Left'],
                    ['suggested_order_qty', 'Suggested Qty'],
                    ['cost_price', 'Est. Cost'],
                    ['priority', 'Priority'],
                  ] as [SortKey, string][]).map(([key, label]) => (
                    <th
                      key={key}
                      onClick={() => toggleSort(key)}
                      className="px-3 py-3 text-left font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground transition whitespace-nowrap"
                    >
                      <span className="inline-flex items-center gap-1">
                        {label}
                        <SortIcon col={key} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-muted-foreground">
                      {items.length === 0 ? 'No product data available.' : 'No products match current filters.'}
                    </td>
                  </tr>
                ) : filtered.map(item => {
                  const rowHighlight =
                    item.priority === 'HIGH' ? 'bg-red-50/50 dark:bg-red-950/10' :
                    item.priority === 'MEDIUM' ? 'bg-amber-50/30 dark:bg-amber-950/5' : '';
                  return (
                    <tr
                      key={item.product_id}
                      className={`border-b border-border/50 hover:bg-muted/30 transition ${rowHighlight}`}
                    >
                      <td className="px-3 py-2.5">
                        {item.suggested_order_qty > 0 && (
                          <input
                            type="checkbox"
                            checked={selected.has(item.product_id)}
                            onChange={() => toggleSelect(item.product_id)}
                            className="rounded border-border"
                            title={`Select ${item.product_name}`}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-foreground">{item.product_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.sku && <span>{item.sku}</span>}
                          {item.category_name && <span className="ml-2 opacity-60">{item.category_name}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums font-medium">
                        <span className={item.current_stock <= 0 ? 'text-red-600 dark:text-red-400' : ''}>
                          {item.current_stock}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{item.avg_daily_sales}</td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {item.days_of_stock !== null ? (
                          <span className={
                            item.days_of_stock <= 3 ? 'text-red-600 dark:text-red-400 font-bold' :
                            item.days_of_stock <= 7 ? 'text-amber-600 dark:text-amber-400 font-semibold' :
                            'text-emerald-600 dark:text-emerald-400'
                          }>
                            {item.days_of_stock} days
                          </span>
                        ) : (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums font-semibold">
                        {item.suggested_order_qty > 0 ? item.suggested_order_qty : (
                          <span className="text-muted-foreground font-normal">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                        {item.suggested_order_qty > 0
                          ? `${CURRENCY} ${(item.suggested_order_qty * item.cost_price).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                          : '-'}
                      </td>
                      <td className="px-3 py-2.5">
                        <PriorityBadge priority={item.priority} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {generatedAt && (
            <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
              Showing {filtered.length} of {items.length} products.
              Analysis window: {settings.salesWindowDays} days. Target stock: {settings.targetStockDays} days.
              Generated: {new Date(generatedAt).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {/* Draft Modal */}
      {showDraftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDraftModal(false)}>
          <div
            className="bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-1">Generate Purchase List</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} will be saved as a purchase draft.
            </p>
            <label className="block text-sm font-medium mb-1">Draft Name</label>
            <input
              type="text"
              value={draftName}
              onChange={e => setDraftName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm mb-4"
              placeholder="e.g. Weekly Restock"
              autoFocus
            />
            <div className="rounded-lg bg-muted p-3 mb-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Items</span>
                <span className="font-semibold">{selectedItems.length}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-muted-foreground">Estimated Cost</span>
                <span className="font-semibold">{CURRENCY} {selectedCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDraftModal(false)}
                className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDraft}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProcurementDemand;
