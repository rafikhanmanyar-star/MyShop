import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
import { useInventory } from '../../../context/InventoryContext';
import { ICONS, CURRENCY } from '../../../constants';
import Card from '../../ui/Card';
import { getShopCategoriesOfflineFirst } from '../../../services/categoriesOfflineCache';
import { shopApi } from '../../../services/shopApi';
import type { InventoryItem } from '../../../types/inventory';
import WarehouseHeatmapModal from './WarehouseHeatmapModal';

const BAR_COLORS = ['bg-indigo-600', 'bg-emerald-500', 'bg-amber-500'];

type CriticalSortKey = 'name' | 'category' | 'onHand' | 'reorderPoint' | 'status';

type ColWidthKey = 'item' | 'category' | 'onHand' | 'reorder' | 'status';

/** Drives Critical Stock Alerts rows; `critical` = all at/below reorder (default). */
type SummaryFilter =
    | 'critical'
    | 'total_skus'
    | 'low_stock'
    | 'out_of_stock'
    | 'stock_value'
    | 'expired'
    | 'expiring_7'
    | 'expiring_30';

const MIN_COL_PX = 72;
const DEFAULT_COL_WIDTHS: Record<ColWidthKey, number> = {
    item: 220,
    category: 140,
    onHand: 100,
    reorder: 120,
    status: 128,
};

function SortGlyph({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
    if (!active) return <ArrowUpDown className="w-3.5 h-3.5 shrink-0 opacity-40 dark:opacity-50" strokeWidth={2} aria-hidden />;
    return dir === 'asc' ? (
        <ChevronUp className="w-3.5 h-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" strokeWidth={2} aria-hidden />
    ) : (
        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" strokeWidth={2} aria-hidden />
    );
}

const InventoryDashboard: React.FC = () => {
    const { items, lowStockItems, totalInventoryValue, warehouses } = useInventory();
    const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
    const [sortKey, setSortKey] = useState<CriticalSortKey>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [colWidths, setColWidths] = useState<Record<ColWidthKey, number>>(() => ({ ...DEFAULT_COL_WIDTHS }));
    const [heatmapOpen, setHeatmapOpen] = useState(false);
    const [expiryKpi, setExpiryKpi] = useState<{
        expired_qty?: string | number;
        expiring_7_qty?: string | number;
        expiring_30_qty?: string | number;
    } | null>(null);
    const [expiryRows, setExpiryRows] = useState<any[]>([]);
    const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>('critical');

    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const res = await getShopCategoriesOfflineFirst();
                setCategories(Array.isArray(res) ? res : []);
            } catch (err) {
                console.error('Failed to fetch categories:', err);
            }
        };
        fetchCategories();
    }, []);

    useEffect(() => {
        shopApi
            .getInventoryExpirySummary()
            .then((r: any) => {
                setExpiryKpi(r?.kpi ?? {});
                setExpiryRows(Array.isArray(r?.rows) ? r.rows : []);
            })
            .catch(() => {
                setExpiryKpi(null);
                setExpiryRows([]);
            });
    }, []);

    // Real branch/warehouse inventory: units per warehouse and % of total stock
    const warehouseUtilization = React.useMemo(() => {
        const totalUnits = items.reduce((sum, i) => sum + i.onHand, 0);
        return warehouses.map((wh, i) => {
            const unitsAtWh = items.reduce((sum, item) => sum + (item.warehouseStock?.[wh.id] ?? 0), 0);
            const pct = totalUnits > 0 ? Math.round((unitsAtWh / totalUnits) * 100) : 0;
            return { id: wh.id, name: wh.name, units: unitsAtWh, pct, color: BAR_COLORS[i % BAR_COLORS.length] };
        });
    }, [warehouses, items]);

    /** Product IDs with batch expiry in each bucket (from expiry-summary rows). */
    const expiryProductIdSets = useMemo(() => {
        const expired = new Set<string>();
        const expiring7 = new Set<string>();
        const expiring30 = new Set<string>();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        for (const r of expiryRows) {
            const pid = String((r as { product_id?: string; productId?: string }).product_id ?? (r as { productId?: string }).productId ?? '');
            const expRaw = (r as { expiry_date?: string }).expiry_date;
            const exp = expRaw != null ? String(expRaw).slice(0, 10) : '';
            if (!pid || !exp) continue;
            const d = new Date(`${exp}T12:00:00`);
            if (Number.isNaN(d.getTime())) continue;
            if (d < today) {
                expired.add(pid);
                continue;
            }
            const days = (d.getTime() - today.getTime()) / 86400000;
            if (days <= 30) expiring30.add(pid);
            if (days <= 7) expiring7.add(pid);
        }
        return { expired, expiring7, expiring30 };
    }, [expiryRows]);

    const tableSourceItems = useMemo((): InventoryItem[] => {
        switch (summaryFilter) {
            case 'critical':
                return lowStockItems;
            case 'total_skus':
                return items;
            case 'low_stock':
                return items.filter(i => i.onHand > 0 && i.onHand <= i.reorderPoint);
            case 'out_of_stock':
                return items.filter(i => i.onHand <= 0);
            case 'stock_value':
                return items;
            case 'expired':
                return items.filter(i => expiryProductIdSets.expired.has(i.id));
            case 'expiring_7':
                return items.filter(i => expiryProductIdSets.expiring7.has(i.id));
            case 'expiring_30':
                return items.filter(i => expiryProductIdSets.expiring30.has(i.id));
            default:
                return lowStockItems;
        }
    }, [summaryFilter, items, lowStockItems, expiryProductIdSets]);

    const filteredLowStockItems = useMemo(() => {
        if (!selectedCategoryId) return tableSourceItems;
        const selectedCat = categories.find(c => c.id === selectedCategoryId);
        return tableSourceItems.filter(item =>
            item.category === selectedCategoryId ||
            (selectedCat && selectedCat.name === item.category)
        );
    }, [tableSourceItems, selectedCategoryId, categories]);

    const getCategoryDisplayName = useCallback((itemCategory: string | undefined) => {
        if (!itemCategory) return 'General';
        const cat = categories.find(c => c.id === itemCategory || c.name === itemCategory);
        return cat ? cat.name : itemCategory;
    }, [categories]);

    const toggleSort = useCallback((key: CriticalSortKey) => {
        setSortKey((prev) => {
            if (prev === key) {
                setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                return prev;
            }
            setSortDir('asc');
            return key;
        });
    }, []);

    const colWidthsRef = useRef(colWidths);
    colWidthsRef.current = colWidths;

    const beginColumnResize = useCallback((e: React.MouseEvent, column: ColWidthKey) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = colWidthsRef.current[column];
        const onMove = (ev: MouseEvent) => {
            const delta = ev.clientX - startX;
            const next = Math.max(MIN_COL_PX, startW + delta);
            setColWidths((w) => ({ ...w, [column]: next }));
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, []);

    const sortedLowStockItems = useMemo(() => {
        const list: InventoryItem[] = [...filteredLowStockItems];
        const mul = sortDir === 'asc' ? 1 : -1;
        list.sort((a, b) => {
            let cmp = 0;
            switch (sortKey) {
                case 'name': {
                    const an = `${a.name}\0${a.sku}`.toLowerCase();
                    const bn = `${b.name}\0${b.sku}`.toLowerCase();
                    cmp = an.localeCompare(bn);
                    break;
                }
                case 'category':
                    cmp = getCategoryDisplayName(a.category).localeCompare(getCategoryDisplayName(b.category));
                    break;
                case 'onHand':
                    cmp = a.onHand - b.onHand;
                    break;
                case 'reorderPoint':
                    cmp = a.reorderPoint - b.reorderPoint;
                    break;
                case 'status': {
                    const rank = (i: InventoryItem) =>
                        i.onHand <= 0 ? 0 : i.onHand <= i.reorderPoint ? 1 : 2;
                    cmp = rank(a) - rank(b);
                    if (cmp === 0) cmp = a.onHand - b.onHand;
                    break;
                }
                default:
                    break;
            }
            if (cmp === 0) cmp = a.name.localeCompare(b.name);
            return cmp * mul;
        });
        return list;
    }, [filteredLowStockItems, sortKey, sortDir, getCategoryDisplayName]);

    const toggleSummaryFilter = useCallback((key: SummaryFilter) => {
        setSummaryFilter((prev) => (prev === key ? 'critical' : key));
    }, []);

    const summaryCards = useMemo(() => {
        const core: {
            key: SummaryFilter;
            label: string;
            value: React.ReactNode;
            icon: React.ReactElement;
            color: string;
            bg: string;
            border?: string;
        }[] = [
            {
                key: 'total_skus',
                label: 'Total SKUs',
                value: items.length,
                icon: ICONS.package,
                color: 'text-indigo-600 dark:text-indigo-400',
                bg: 'bg-indigo-50 dark:bg-indigo-950/40',
            },
            {
                key: 'low_stock',
                label: 'Low Stock',
                value: lowStockItems.length,
                icon: ICONS.trendingDown,
                color: 'text-amber-600 dark:text-amber-400',
                bg: 'bg-amber-50 dark:bg-amber-950/40',
            },
            {
                key: 'out_of_stock',
                label: 'Out of Stock',
                value: items.filter((i) => i.onHand <= 0).length,
                icon: ICONS.xCircle,
                color: 'text-rose-600 dark:text-rose-400',
                bg: 'bg-rose-50 dark:bg-rose-950/40',
            },
            {
                key: 'stock_value',
                label: 'Stock Value',
                value: `${CURRENCY} ${totalInventoryValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
                icon: ICONS.dollarSign,
                color: 'text-emerald-600 dark:text-emerald-400',
                bg: 'bg-emerald-50 dark:bg-emerald-950/40',
            },
        ];
        if (expiryKpi === null) return core;
        return [
            ...core,
            {
                key: 'expired' as const,
                label: 'Expired (on hand)',
                value: (
                    <>
                        {Number(expiryKpi.expired_qty ?? 0).toLocaleString()}{' '}
                        <span className="text-[10px] font-medium opacity-90">units</span>
                    </>
                ),
                icon: ICONS.alertTriangle,
                color: 'text-rose-700 dark:text-rose-300',
                bg: 'bg-rose-50/80 dark:bg-rose-950/35',
                border: 'border-rose-200 dark:border-rose-900/50',
            },
            {
                key: 'expiring_7' as const,
                label: 'Expiring ≤ 7 days',
                value: (
                    <>
                        {Number(expiryKpi.expiring_7_qty ?? 0).toLocaleString()}{' '}
                        <span className="text-[10px] font-medium opacity-90">units</span>
                    </>
                ),
                icon: ICONS.clock,
                color: 'text-amber-800 dark:text-amber-200',
                bg: 'bg-amber-50/80 dark:bg-amber-950/35',
                border: 'border-amber-200 dark:border-amber-900/50',
            },
            {
                key: 'expiring_30' as const,
                label: 'Expiring ≤ 30 days',
                value: (
                    <>
                        {Number(expiryKpi.expiring_30_qty ?? 0).toLocaleString()}{' '}
                        <span className="text-[10px] font-medium opacity-90">units</span>
                    </>
                ),
                icon: ICONS.calendar,
                color: 'text-emerald-800 dark:text-emerald-200',
                bg: 'bg-emerald-50/80 dark:bg-emerald-950/35',
                border: 'border-emerald-200 dark:border-emerald-900/50',
            },
        ];
    }, [items, lowStockItems, totalInventoryValue, expiryKpi]);

    const emptyTableHint = useMemo(() => {
        if (filteredLowStockItems.length > 0) return '';
        if (tableSourceItems.length > 0) return 'No rows match the category filter.';
        switch (summaryFilter) {
            case 'critical':
                return lowStockItems.length > 0 ? 'No critical stock in this category.' : 'No critical stock levels detected.';
            case 'total_skus':
            case 'stock_value':
                return 'No SKUs loaded.';
            case 'low_stock':
                return 'No SKUs are low (in stock but at/below reorder).';
            case 'out_of_stock':
                return 'No SKUs are out of stock.';
            case 'expired':
            case 'expiring_7':
            case 'expiring_30':
                return 'No batch expiry data for this filter.';
            default:
                return 'No rows to show.';
        }
    }, [filteredLowStockItems.length, tableSourceItems.length, summaryFilter, lowStockItems.length]);

    const alertsTableHeading = useMemo(() => {
        switch (summaryFilter) {
            case 'critical':
                return { title: 'Critical Stock Alerts', subtitle: 'At or below reorder point (default view).' };
            case 'total_skus':
                return { title: 'All SKUs', subtitle: 'Full catalog with stock status.' };
            case 'stock_value':
                return { title: 'Stock value (all SKUs)', subtitle: 'Line value = on hand × cost.' };
            case 'low_stock':
                return { title: 'Low stock', subtitle: 'On hand > 0 and at or below reorder.' };
            case 'out_of_stock':
                return { title: 'Out of stock', subtitle: 'Zero on hand.' };
            case 'expired':
                return { title: 'Expired batches (on hand)', subtitle: 'From batch expiry data.' };
            case 'expiring_7':
                return { title: 'Expiring within 7 days', subtitle: 'From batch expiry data.' };
            case 'expiring_30':
                return { title: 'Expiring within 30 days', subtitle: 'From batch expiry data.' };
            default:
                return { title: 'Critical Stock Alerts', subtitle: '' };
        }
    }, [summaryFilter]);

    return (
        <div className="flex flex-col h-full min-h-0 overflow-hidden gap-8 animate-fade-in">
            {/* KPI row — compact, single row; scroll on narrow viewports. Default view = critical (no card selected); click a card to filter; click again to reset. */}
            <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1 flex-shrink-0 [scrollbar-gutter:stable]">
                {summaryCards.map((stat) => {
                    const selected = summaryFilter === stat.key;
                    return (
                        <button
                            type="button"
                            key={stat.key}
                            title={`Filter table: ${stat.label}. ${selected ? 'Click again to show critical alerts only.' : ''}`}
                            onClick={() => toggleSummaryFilter(stat.key)}
                            className={`flex min-w-[5.5rem] max-w-[170px] shrink-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left shadow-sm transition-colors sm:min-w-[7.25rem] ${
                                stat.border ?? 'border-border'
                            } bg-card ${
                                selected
                                    ? 'ring-2 ring-primary-500 ring-offset-1 ring-offset-background dark:ring-offset-slate-900'
                                    : 'hover:bg-muted/50 dark:hover:bg-muted/30'
                            } ${summaryFilter === 'critical' && !selected ? 'opacity-95' : ''}`}
                        >
                            <div
                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${stat.bg} ${stat.color}`}
                            >
                                {React.cloneElement(stat.icon as React.ReactElement<any>, { width: 16, height: 16 })}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[9px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground line-clamp-2">
                                    {stat.label}
                                </p>
                                <p className="truncate text-xs font-semibold tabular-nums text-foreground sm:text-sm">{stat.value}</p>
                            </div>
                        </button>
                    );
                })}
            </div>

            {expiryRows.length > 0 && (
                <Card className="border-none shadow-sm p-0 overflow-hidden flex-shrink-0">
                    <div className="border-b border-border px-6 py-4">
                        <h3 className="font-bold text-foreground">Expiry monitoring (batches)</h3>
                        <p className="text-sm text-muted-foreground">Nearest dated stock with remaining quantity (up to 400 lines).</p>
                    </div>
                    <div className="max-h-64 overflow-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-muted/60 text-xs uppercase text-muted-foreground sticky top-0">
                                <tr>
                                    <th className="px-4 py-2">Product</th>
                                    <th className="px-4 py-2">SKU</th>
                                    <th className="px-4 py-2">Warehouse</th>
                                    <th className="px-4 py-2">Batch</th>
                                    <th className="px-4 py-2">Expiry</th>
                                    <th className="px-4 py-2 text-right">Qty</th>
                                </tr>
                            </thead>
                            <tbody>
                                {expiryRows.map((r) => {
                                    const exp = r.expiry_date ? String(r.expiry_date).slice(0, 10) : '';
                                    const d = exp ? new Date(exp + 'T12:00:00') : null;
                                    const today = new Date();
                                    today.setHours(0, 0, 0, 0);
                                    const cls =
                                        d && d < today
                                            ? 'bg-rose-500/10'
                                            : d &&
                                                d.getTime() - today.getTime() <= 7 * 86400000
                                              ? 'bg-amber-500/10'
                                              : '';
                                    return (
                                        <tr key={r.id} className={`border-b border-border ${cls}`}>
                                            <td className="px-4 py-2 font-medium">{r.product_name}</td>
                                            <td className="px-4 py-2 text-muted-foreground">{r.sku}</td>
                                            <td className="px-4 py-2">{r.warehouse_name}</td>
                                            <td className="px-4 py-2 font-mono text-xs">{r.batch_no}</td>
                                            <td className="px-4 py-2 tabular-nums">{exp || '—'}</td>
                                            <td className="px-4 py-2 text-right tabular-nums">
                                                {Number(r.quantity_remaining ?? 0).toLocaleString()}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0 overflow-hidden">
                {/* Low Stock Table */}
                <Card className="lg:col-span-2 border-none shadow-sm overflow-hidden flex flex-col min-h-0">
                    <div className="p-6 border-b border-border flex flex-wrap justify-between items-center gap-4 flex-shrink-0">
                        <div>
                            <h3 className="font-bold text-foreground">{alertsTableHeading.title}</h3>
                            {alertsTableHeading.subtitle ? (
                                <p className="mt-0.5 text-xs text-muted-foreground">{alertsTableHeading.subtitle}</p>
                            ) : null}
                        </div>
                        <div className="flex items-center gap-3">
                            <label htmlFor="critical-alerts-category" className="text-xs font-bold text-muted-foreground whitespace-nowrap">
                                Category:
                            </label>
                            <select
                                id="critical-alerts-category"
                                value={selectedCategoryId}
                                onChange={(e) => setSelectedCategoryId(e.target.value)}
                                className="block rounded-lg border border-border bg-card py-2 pl-3 pr-8 text-sm font-medium text-foreground shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 min-w-[160px] dark:border-slate-600"
                            >
                                <option value="">All categories</option>
                                <option value="General">General</option>
                                {categories.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                            <span className="px-2 py-1 bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300 text-xs font-semibold rounded uppercase">Immediate Action Needed</span>
                        </div>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto custom-scrollbar" style={{ scrollbarGutter: 'stable' }}>
                        <table className="w-full table-fixed text-left">
                            <thead className="bg-muted/80 text-xs font-semibold uppercase text-muted-foreground sticky top-0 z-10">
                                <tr>
                                    <th
                                        style={{ width: colWidths.item, minWidth: MIN_COL_PX }}
                                        className="relative px-6 py-4 bg-muted/80 group align-bottom"
                                        {...(sortKey === 'name' ? { 'aria-sort': sortDir === 'asc' ? ('ascending' as const) : ('descending' as const) } : {})}
                                    >
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-1.5 text-left hover:text-muted-foreground"
                                            onClick={() => toggleSort('name')}
                                        >
                                            Item Name / SKU
                                            <SortGlyph active={sortKey === 'name'} dir={sortDir} />
                                        </button>
                                        <div
                                            className="absolute right-0 top-0 z-20 h-full w-2 cursor-col-resize hover:bg-indigo-400/30 dark:hover:bg-indigo-400/20"
                                            onMouseDown={(e) => beginColumnResize(e, 'item')}
                                            title="Drag to resize"
                                            role="separator"
                                            aria-orientation="vertical"
                                        />
                                    </th>
                                    <th
                                        style={{ width: colWidths.category, minWidth: MIN_COL_PX }}
                                        className="relative px-6 py-4 bg-muted/80 group align-bottom"
                                        {...(sortKey === 'category' ? { 'aria-sort': sortDir === 'asc' ? ('ascending' as const) : ('descending' as const) } : {})}
                                    >
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-1.5 text-left hover:text-muted-foreground"
                                            onClick={() => toggleSort('category')}
                                        >
                                            Category
                                            <SortGlyph active={sortKey === 'category'} dir={sortDir} />
                                        </button>
                                        <div
                                            className="absolute right-0 top-0 z-20 h-full w-2 cursor-col-resize hover:bg-indigo-400/30 dark:hover:bg-indigo-400/20"
                                            onMouseDown={(e) => beginColumnResize(e, 'category')}
                                            title="Drag to resize"
                                            role="separator"
                                            aria-orientation="vertical"
                                        />
                                    </th>
                                    <th
                                        style={{ width: colWidths.onHand, minWidth: MIN_COL_PX }}
                                        className="relative px-6 py-4 bg-muted/80 group align-bottom"
                                        {...(sortKey === 'onHand' ? { 'aria-sort': sortDir === 'asc' ? ('ascending' as const) : ('descending' as const) } : {})}
                                    >
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-1.5 text-left hover:text-muted-foreground"
                                            onClick={() => toggleSort('onHand')}
                                        >
                                            On Hand
                                            <SortGlyph active={sortKey === 'onHand'} dir={sortDir} />
                                        </button>
                                        <div
                                            className="absolute right-0 top-0 z-20 h-full w-2 cursor-col-resize hover:bg-indigo-400/30 dark:hover:bg-indigo-400/20"
                                            onMouseDown={(e) => beginColumnResize(e, 'onHand')}
                                            title="Drag to resize"
                                            role="separator"
                                            aria-orientation="vertical"
                                        />
                                    </th>
                                    <th
                                        style={{ width: colWidths.reorder, minWidth: MIN_COL_PX }}
                                        className="relative px-6 py-4 bg-muted/80 group align-bottom"
                                        {...(sortKey === 'reorderPoint' ? { 'aria-sort': sortDir === 'asc' ? ('ascending' as const) : ('descending' as const) } : {})}
                                    >
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-1.5 text-left hover:text-muted-foreground"
                                            onClick={() => toggleSort('reorderPoint')}
                                        >
                                            Reorder Point
                                            <SortGlyph active={sortKey === 'reorderPoint'} dir={sortDir} />
                                        </button>
                                        <div
                                            className="absolute right-0 top-0 z-20 h-full w-2 cursor-col-resize hover:bg-indigo-400/30 dark:hover:bg-indigo-400/20"
                                            onMouseDown={(e) => beginColumnResize(e, 'reorder')}
                                            title="Drag to resize"
                                            role="separator"
                                            aria-orientation="vertical"
                                        />
                                    </th>
                                    <th
                                        style={{ width: colWidths.status, minWidth: MIN_COL_PX }}
                                        className="relative px-6 py-4 bg-muted/80 align-bottom"
                                        {...(sortKey === 'status' ? { 'aria-sort': sortDir === 'asc' ? ('ascending' as const) : ('descending' as const) } : {})}
                                    >
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-1.5 text-left hover:text-muted-foreground"
                                            onClick={() => toggleSort('status')}
                                        >
                                            Status
                                            <SortGlyph active={sortKey === 'status'} dir={sortDir} />
                                        </button>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filteredLowStockItems.length > 0 ? sortedLowStockItems.map(item => (
                                    <tr key={item.id} className="hover:bg-muted/50 transition-colors">
                                        <td className="min-w-0 px-6 py-4">
                                            <div className="truncate font-bold text-foreground text-sm" title={item.name}>{item.name}</div>
                                            <div className="truncate text-xs text-muted-foreground font-mono italic" title={item.sku}>{item.sku}</div>
                                        </td>
                                        <td className="min-w-0 px-6 py-4">
                                            <span className="text-sm font-medium text-muted-foreground">{getCategoryDisplayName(item.category)}</span>
                                        </td>
                                        <td className="min-w-0 px-6 py-4 text-sm font-semibold font-mono">{item.onHand} {item.unit}</td>
                                        <td className="min-w-0 px-6 py-4 text-sm font-medium text-muted-foreground font-mono">{item.reorderPoint}</td>
                                        <td className="min-w-0 px-6 py-4">
                                            <span
                                                className={`px-2 py-1 rounded text-xs font-bold ${
                                                    item.onHand <= 0
                                                        ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300'
                                                        : item.onHand <= item.reorderPoint
                                                          ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300'
                                                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                                }`}
                                            >
                                                {item.onHand <= 0
                                                    ? 'OUT OF STOCK'
                                                    : item.onHand <= item.reorderPoint
                                                      ? 'LOW STOCK'
                                                      : 'IN STOCK'}
                                            </span>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground italic text-sm">
                                            {emptyTableHint}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>

                {/* Warehouse Snapshot */}
                <Card className="border-none shadow-sm p-6 space-y-6 flex-shrink-0 lg:flex-shrink">
                    <h3 className="font-bold text-foreground">Warehouse Utilization</h3>
                    <div className="space-y-6">
                        {warehouseUtilization.length > 0 ? warehouseUtilization.map((wh) => (
                            <div key={wh.id} className="space-y-2">
                                <div className="flex justify-between text-xs font-bold">
                                    <span className="text-muted-foreground">{wh.name}</span>
                                    <span className="text-muted-foreground">{wh.pct}% of stock</span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-1000 ${wh.color}`}
                                        style={{ width: `${Math.min(100, wh.pct)}%` }}
                                    />
                                </div>
                            </div>
                        )) : (
                            <p className="text-sm text-muted-foreground italic">No warehouses. Add branches to see inventory by location.</p>
                        )}
                    </div>

                    <div className="pt-6 border-t border-border">
                        <button
                            type="button"
                            onClick={() => setHeatmapOpen(true)}
                            className="w-full py-3 bg-card border border-border text-muted-foreground rounded-xl text-xs font-bold hover:bg-muted/50 hover:border-indigo-200 dark:hover:border-indigo-500/40 hover:text-indigo-700 dark:hover:text-indigo-300 transition-all flex items-center justify-center gap-2"
                        >
                            {ICONS.trendingUp} View Detailed Heatmap
                        </button>
                    </div>
                </Card>
            </div>

            <WarehouseHeatmapModal
                isOpen={heatmapOpen}
                onClose={() => setHeatmapOpen(false)}
                items={items}
                warehouses={warehouses}
                categories={categories}
            />
        </div>
    );
};

export default InventoryDashboard;
