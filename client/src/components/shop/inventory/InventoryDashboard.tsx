import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ArrowUpDown, CalendarX, ChevronDown, ChevronUp, CircleSlash, Clock, Pencil, Timer } from 'lucide-react';
import { useInventory } from '../../../context/InventoryContext';
import { ICONS, CURRENCY } from '../../../constants';
import Card from '../../ui/Card';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import { getShopCategoriesOfflineFirst } from '../../../services/categoriesOfflineCache';
import { shopApi } from '../../../services/shopApi';
import type { InventoryItem } from '../../../types/inventory';
import WarehouseHeatmapModal from './WarehouseHeatmapModal';
import { showAppToast } from '../../../utils/appToast';
import { userMessageForApiError } from '../../../utils/apiConnectivity';

/** Warehouse utilization bar: primary blue palette + red when share is dominant (reference UI). */
function utilizationBarStyle(pct: number, index: number): { bar: string; sub?: string } {
    if (pct >= 85) {
        return { bar: 'bg-[#D32F2F]', sub: 'Critical capacity reached' };
    }
    const blues = ['bg-[#0047AB]', 'bg-[#2563EB]', 'bg-[#60A5FA]', 'bg-[#475569]'];
    return { bar: blues[index % blues.length] };
}

function formatCompactCurrency(value: number, symbol: string): string {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${symbol} ${(value / 1_000_000).toFixed(1)}M`.replace(/\.0M$/, 'M');
    if (abs >= 1_000) return `${symbol} ${(value / 1_000).toFixed(1)}K`.replace(/\.0K$/, 'K');
    return `${symbol} ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

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
    item: 280,
    category: 140,
    onHand: 100,
    reorder: 120,
    status: 128,
};

function SortGlyph({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
    if (!active) return <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-40 dark:opacity-50" strokeWidth={2} aria-hidden />;
    return dir === 'asc' ? (
        <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[#0047AB] dark:text-[#5b8cff]" strokeWidth={2} aria-hidden />
    ) : (
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#0047AB] dark:text-[#5b8cff]" strokeWidth={2} aria-hidden />
    );
}

type ExpiryRow = {
    id: string;
    product_id?: string;
    product_name?: string;
    sku?: string;
    warehouse_name?: string;
    batch_no?: string;
    expiry_date?: string | null;
    quantity_remaining?: number | string;
};

const InventoryDashboard: React.FC = () => {
    const { items, lowStockItems, totalInventoryValue, warehouses, refreshItems } = useInventory();
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
    const [expiryRows, setExpiryRows] = useState<ExpiryRow[]>([]);
    const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>('critical');
    const [batchExpiryModal, setBatchExpiryModal] = useState<ExpiryRow | null>(null);
    const [batchExpiryDraft, setBatchExpiryDraft] = useState('');
    const [batchExpirySaving, setBatchExpirySaving] = useState(false);
    const [expiryViewAll, setExpiryViewAll] = useState(false);
    const expirySectionRef = useRef<HTMLDivElement>(null);
    const [utilSnapshotAt, setUtilSnapshotAt] = useState(() => Date.now());
    const [utilTimeTicker, setUtilTimeTicker] = useState(0);

    useEffect(() => {
        setUtilSnapshotAt(Date.now());
    }, [items.length, warehouses.length]);

    useEffect(() => {
        const id = window.setInterval(() => setUtilTimeTicker((n) => n + 1), 60000);
        return () => window.clearInterval(id);
    }, []);

    const utilSnapshotLabel = useMemo(() => {
        const m = Math.floor((Date.now() - utilSnapshotAt) / 60000);
        if (m < 1) return 'Just now';
        if (m === 1) return '1 min ago';
        return `${m} mins ago`;
    }, [utilSnapshotAt, utilTimeTicker]);

    const loadExpirySummary = useCallback(() => {
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
        loadExpirySummary();
    }, [loadExpirySummary]);

    /** Share of on-hand units by warehouse (shown as utilization-style bars in the reference UI). */
    const warehouseUtilization = React.useMemo(() => {
        const totalUnits = items.reduce((sum, i) => sum + i.onHand, 0);
        const rows = warehouses.map((wh) => {
            const unitsAtWh = items.reduce((sum, item) => sum + (item.warehouseStock?.[wh.id] ?? 0), 0);
            const pct = totalUnits > 0 ? Math.round((unitsAtWh / totalUnits) * 100) : 0;
            return { id: wh.id, name: wh.name, units: unitsAtWh, pct };
        });
        const sorted = [...rows].sort((a, b) => b.pct - a.pct);
        return sorted.map((row, i) => {
            const { bar, sub } = utilizationBarStyle(row.pct, i);
            return { ...row, barClass: bar, sub };
        });
    }, [warehouses, items]);

    const itemImageById = useMemo(() => {
        const m = new Map<string, string | undefined>();
        for (const i of items) m.set(i.id, i.imageUrl);
        return m;
    }, [items]);

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

    const openBatchExpiryEdit = useCallback((r: ExpiryRow) => {
        const exp = r.expiry_date ? String(r.expiry_date).slice(0, 10) : '';
        setBatchExpiryDraft(exp);
        setBatchExpiryModal(r);
    }, []);

    const saveBatchExpiry = useCallback(async () => {
        if (!batchExpiryModal?.id) return;
        const trimmed = batchExpiryDraft.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            showAppToast('Enter a valid date (YYYY-MM-DD).', 'error');
            return;
        }
        setBatchExpirySaving(true);
        try {
            await shopApi.updateInventoryBatchExpiry(batchExpiryModal.id, { expiryDate: trimmed });
            showAppToast('Batch expiry updated.', 'success');
            setBatchExpiryModal(null);
            loadExpirySummary();
            await refreshItems();
        } catch (e: unknown) {
            showAppToast(userMessageForApiError(e, 'Could not update batch expiry.'), 'error');
        } finally {
            setBatchExpirySaving(false);
        }
    }, [batchExpiryModal, batchExpiryDraft, loadExpirySummary, refreshItems]);

    const summaryCards = useMemo(() => {
        const lowCount = items.filter((i) => i.onHand > 0 && i.onHand <= i.reorderPoint).length;
        const outCount = items.filter((i) => i.onHand <= 0).length;
        const ex = expiryKpi ?? {};
        type CardDef = {
            key: SummaryFilter;
            label: string;
            value: React.ReactNode;
            icon: React.ReactNode;
            iconWrap: string;
            valueClass: string;
            border?: string;
        };
        const stockValueDisplay = formatCompactCurrency(totalInventoryValue, CURRENCY);
        const cards: CardDef[] = [
            {
                key: 'total_skus',
                label: 'Total SKUs',
                value: items.length.toLocaleString(),
                icon: ICONS.folder,
                iconWrap: 'bg-[#0047AB]/10 text-[#0047AB]',
                valueClass: 'text-[#0047AB]',
            },
            {
                key: 'low_stock',
                label: 'Low Stock',
                value: lowCount.toLocaleString(),
                icon: ICONS.alertTriangle,
                iconWrap: 'bg-[#F57C00]/12 text-[#F57C00]',
                valueClass: 'text-[#F57C00]',
            },
            {
                key: 'out_of_stock',
                label: 'Out of Stock',
                value: outCount.toLocaleString(),
                icon: <CircleSlash className="h-4 w-4" strokeWidth={2} aria-hidden />,
                iconWrap: 'bg-[#D32F2F]/10 text-[#D32F2F]',
                valueClass: 'text-[#D32F2F]',
            },
            {
                key: 'stock_value',
                label: 'Stock Value',
                value: stockValueDisplay,
                icon: ICONS.dollarSign,
                iconWrap: 'bg-[#0047AB]/10 text-[#0047AB]',
                valueClass: 'text-[#0047AB]',
            },
            {
                key: 'expired',
                label: 'Expired',
                value: Number(ex.expired_qty ?? 0).toLocaleString(),
                icon: <CalendarX className="h-4 w-4" strokeWidth={2} aria-hidden />,
                iconWrap: 'bg-[#D32F2F]/10 text-[#D32F2F]',
                valueClass: 'text-[#D32F2F]',
                border: 'border-[#E5E7EB]',
            },
            {
                key: 'expiring_7',
                label: 'Expiring ≤ 7 Days',
                value: Number(ex.expiring_7_qty ?? 0).toLocaleString(),
                icon: <Timer className="h-4 w-4" strokeWidth={2} aria-hidden />,
                iconWrap: 'bg-[#F57C00]/12 text-[#F57C00]',
                valueClass: 'text-[#F57C00]',
                border: 'border-[#E5E7EB]',
            },
            {
                key: 'expiring_30',
                label: 'Expiring ≤ 30 Days',
                value: Number(ex.expiring_30_qty ?? 0).toLocaleString(),
                icon: ICONS.calendar,
                iconWrap: 'bg-[#0047AB]/10 text-[#0047AB]',
                valueClass: 'text-[#0047AB]',
                border: 'border-[#E5E7EB]',
            },
        ];
        return cards;
    }, [items, totalInventoryValue, expiryKpi]);

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

    const scrollToExpiry = useCallback(() => {
        expirySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    return (
        <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white p-4 animate-fade-in dark:border-slate-700 dark:bg-slate-900/40 md:p-6">
            {/* KPI row — reference-style metric tiles; click filters the alerts table; click again to reset to critical. */}
            <div className="flex flex-shrink-0 flex-nowrap gap-2 overflow-x-auto pb-1 [scrollbar-gutter:stable]">
                {summaryCards.map((stat) => {
                    const selected = summaryFilter === stat.key;
                    return (
                        <button
                            type="button"
                            key={stat.key}
                            title={`Filter table: ${stat.label}. ${selected ? 'Click again to show critical alerts only.' : ''}`}
                            onClick={() => toggleSummaryFilter(stat.key)}
                            className={`flex min-w-[6.5rem] max-w-[180px] shrink-0 items-center gap-2.5 rounded-lg border bg-white px-2.5 py-2 text-left shadow-sm transition-colors dark:bg-slate-900 sm:min-w-[7.5rem] ${
                                stat.border ?? 'border-[#E5E7EB]'
                            } ${
                                selected
                                    ? 'ring-2 ring-[#0047AB] ring-offset-2 ring-offset-white dark:ring-offset-slate-900'
                                    : 'hover:bg-gray-50 dark:hover:bg-slate-800/80'
                            } ${summaryFilter === 'critical' && !selected ? 'opacity-95' : ''}`}
                        >
                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg [&>svg]:h-4 [&>svg]:w-4 ${stat.iconWrap}`}>
                                {stat.icon}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="line-clamp-2 text-[9px] font-bold uppercase leading-tight tracking-wide text-gray-500 dark:text-gray-400">
                                    {stat.label}
                                </p>
                                <p className={`truncate text-sm font-bold tabular-nums sm:text-base ${stat.valueClass}`}>{stat.value}</p>
                            </div>
                        </button>
                    );
                })}
            </div>

            <div ref={expirySectionRef}>
                <Card className="flex-shrink-0 overflow-hidden border border-[#E5E7EB] p-0 shadow-sm dark:border-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] px-4 py-4 dark:border-slate-700 md:px-6">
                        <div className="flex items-center gap-2">
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0047AB]/10 text-[#0047AB]">
                                <Clock className="h-4 w-4" strokeWidth={2} aria-hidden />
                            </span>
                            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Expiry Monitoring</h3>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setExpiryViewAll((v) => !v);
                                scrollToExpiry();
                                void loadExpirySummary();
                            }}
                            className="text-sm font-semibold text-[#0047AB] hover:underline dark:text-[#5b8cff]"
                        >
                            {expiryViewAll ? 'Show less' : 'View All Records'}
                        </button>
                    </div>
                    <div className={expiryViewAll ? 'max-h-[min(70vh,32rem)] overflow-auto' : 'max-h-64 overflow-auto'}>
                        {expiryRows.length > 0 ? (
                            <table className="w-full text-left text-sm">
                                <thead className="sticky top-0 bg-gray-50 text-xs font-semibold uppercase text-gray-500 dark:bg-slate-800 dark:text-gray-400">
                                    <tr>
                                        <th className="px-4 py-3">Product Name</th>
                                        <th className="px-4 py-3">SKU Code</th>
                                        <th className="px-4 py-3">Warehouse Location</th>
                                        <th className="px-4 py-3">Batch</th>
                                        <th className="px-4 py-3 text-right">Current Stock</th>
                                        <th className="px-4 py-3">Expiry Date</th>
                                        <th className="w-24 px-4 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#E5E7EB] dark:divide-slate-700">
                                    {expiryRows.map((r) => {
                                        const exp = r.expiry_date ? String(r.expiry_date).slice(0, 10) : '';
                                        const d = exp ? new Date(`${exp}T12:00:00`) : null;
                                        const today = new Date();
                                        today.setHours(0, 0, 0, 0);
                                        const cls =
                                            d && d < today
                                                ? 'bg-[#D32F2F]/5'
                                                : d && d.getTime() - today.getTime() <= 7 * 86400000
                                                  ? 'bg-[#F57C00]/8'
                                                  : '';
                                        const expDisplay =
                                            d && !Number.isNaN(d.getTime())
                                                ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                                : '—';
                                        const pid = String(r.product_id ?? '');
                                        const img = pid ? itemImageById.get(pid) : undefined;
                                        return (
                                            <tr key={r.id} className={cls}>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-[#E5E7EB] bg-gray-50 dark:border-slate-600 dark:bg-slate-800">
                                                            {img ? (
                                                                <img src={img} alt="" className="h-full w-full object-cover" />
                                                            ) : (
                                                                <div className="flex h-full w-full items-center justify-center text-gray-300 dark:text-gray-600">
                                                                    {ICONS.package}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <span className="font-medium text-gray-900 dark:text-gray-100">{r.product_name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 font-mono text-gray-600 dark:text-gray-300">{r.sku}</td>
                                                <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{r.warehouse_name}</td>
                                                <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-200">{r.batch_no}</td>
                                                <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">
                                                    {Number(r.quantity_remaining ?? 0).toLocaleString()} <span className="text-xs font-normal text-gray-500">units</span>
                                                </td>
                                                <td className="px-4 py-3 tabular-nums text-gray-800 dark:text-gray-200">{expDisplay}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        type="button"
                                                        title="Edit expiry date"
                                                        onClick={() => openBatchExpiryEdit(r)}
                                                        className="inline-flex items-center justify-center rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-[#0047AB] dark:hover:bg-slate-800"
                                                    >
                                                        <Pencil className="h-4 w-4" aria-hidden />
                                                        <span className="sr-only">Edit expiry</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        ) : (
                            <p className="px-6 py-12 text-center text-sm italic text-gray-500 dark:text-gray-400">
                                No batch expiry rows yet. When batches with expiry dates exist, they will appear here.
                            </p>
                        )}
                    </div>
                </Card>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-hidden lg:grid-cols-3">
                {/* Critical alerts / filtered SKU table */}
                <Card className="flex min-h-0 flex-col overflow-hidden border border-[#E5E7EB] shadow-sm dark:border-slate-700 lg:col-span-2">
                    <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-4 border-b border-[#E5E7EB] p-4 dark:border-slate-700 md:p-6">
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-gray-100">{alertsTableHeading.title}</h3>
                            {alertsTableHeading.subtitle ? (
                                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{alertsTableHeading.subtitle}</p>
                            ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <label htmlFor="critical-alerts-category" className="whitespace-nowrap text-xs font-bold text-gray-500 dark:text-gray-400">
                                Category:
                            </label>
                            <select
                                id="critical-alerts-category"
                                value={selectedCategoryId}
                                onChange={(e) => setSelectedCategoryId(e.target.value)}
                                className="block min-w-[160px] rounded-lg border border-[#E5E7EB] bg-white py-2 pl-3 pr-8 text-sm font-medium text-gray-900 shadow-sm focus:border-[#0047AB] focus:ring-2 focus:ring-[#0047AB]/30 dark:border-slate-600 dark:bg-slate-900 dark:text-gray-100"
                            >
                                <option value="">All categories</option>
                                <option value="General">General</option>
                                {categories.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                            <span className="rounded-full bg-[#D32F2F]/12 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#D32F2F] dark:bg-[#D32F2F]/20 dark:text-[#ff6b6b]">
                                Immediate action needed
                            </span>
                        </div>
                    </div>
                    <div className="custom-scrollbar min-h-0 flex-1 overflow-x-auto overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
                        <table className="w-full table-fixed text-left">
                            <thead className="sticky top-0 z-10 bg-gray-50 text-xs font-semibold uppercase text-gray-500 dark:bg-slate-800 dark:text-gray-400">
                                <tr>
                                    <th
                                        style={{ width: colWidths.item, minWidth: MIN_COL_PX }}
                                        className="group relative bg-gray-50 px-6 py-4 align-bottom dark:bg-slate-800"
                                        {...(sortKey === 'name' ? { 'aria-sort': sortDir === 'asc' ? ('ascending' as const) : ('descending' as const) } : {})}
                                    >
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-1.5 text-left hover:text-gray-700 dark:hover:text-gray-200"
                                            onClick={() => toggleSort('name')}
                                        >
                                            Item Name / SKU
                                            <SortGlyph active={sortKey === 'name'} dir={sortDir} />
                                        </button>
                                        <div
                                            className="absolute right-0 top-0 z-20 h-full w-2 cursor-col-resize hover:bg-[#0047AB]/20"
                                            onMouseDown={(e) => beginColumnResize(e, 'item')}
                                            title="Drag to resize"
                                            role="separator"
                                            aria-orientation="vertical"
                                        />
                                    </th>
                                    <th
                                        style={{ width: colWidths.category, minWidth: MIN_COL_PX }}
                                        className="group relative bg-gray-50 px-6 py-4 align-bottom dark:bg-slate-800"
                                        {...(sortKey === 'category' ? { 'aria-sort': sortDir === 'asc' ? ('ascending' as const) : ('descending' as const) } : {})}
                                    >
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-1.5 text-left hover:text-gray-700 dark:hover:text-gray-200"
                                            onClick={() => toggleSort('category')}
                                        >
                                            Category
                                            <SortGlyph active={sortKey === 'category'} dir={sortDir} />
                                        </button>
                                        <div
                                            className="absolute right-0 top-0 z-20 h-full w-2 cursor-col-resize hover:bg-[#0047AB]/20"
                                            onMouseDown={(e) => beginColumnResize(e, 'category')}
                                            title="Drag to resize"
                                            role="separator"
                                            aria-orientation="vertical"
                                        />
                                    </th>
                                    <th
                                        style={{ width: colWidths.onHand, minWidth: MIN_COL_PX }}
                                        className="group relative bg-gray-50 px-6 py-4 align-bottom dark:bg-slate-800"
                                        {...(sortKey === 'onHand' ? { 'aria-sort': sortDir === 'asc' ? ('ascending' as const) : ('descending' as const) } : {})}
                                    >
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-1.5 text-left hover:text-gray-700 dark:hover:text-gray-200"
                                            onClick={() => toggleSort('onHand')}
                                        >
                                            On Hand
                                            <SortGlyph active={sortKey === 'onHand'} dir={sortDir} />
                                        </button>
                                        <div
                                            className="absolute right-0 top-0 z-20 h-full w-2 cursor-col-resize hover:bg-[#0047AB]/20"
                                            onMouseDown={(e) => beginColumnResize(e, 'onHand')}
                                            title="Drag to resize"
                                            role="separator"
                                            aria-orientation="vertical"
                                        />
                                    </th>
                                    <th
                                        style={{ width: colWidths.reorder, minWidth: MIN_COL_PX }}
                                        className="group relative bg-gray-50 px-6 py-4 align-bottom dark:bg-slate-800"
                                        {...(sortKey === 'reorderPoint' ? { 'aria-sort': sortDir === 'asc' ? ('ascending' as const) : ('descending' as const) } : {})}
                                    >
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-1.5 text-left hover:text-gray-700 dark:hover:text-gray-200"
                                            onClick={() => toggleSort('reorderPoint')}
                                        >
                                            Reorder Point
                                            <SortGlyph active={sortKey === 'reorderPoint'} dir={sortDir} />
                                        </button>
                                        <div
                                            className="absolute right-0 top-0 z-20 h-full w-2 cursor-col-resize hover:bg-[#0047AB]/20"
                                            onMouseDown={(e) => beginColumnResize(e, 'reorder')}
                                            title="Drag to resize"
                                            role="separator"
                                            aria-orientation="vertical"
                                        />
                                    </th>
                                    <th
                                        style={{ width: colWidths.status, minWidth: MIN_COL_PX }}
                                        className="relative bg-gray-50 px-6 py-4 align-bottom dark:bg-slate-800"
                                        {...(sortKey === 'status' ? { 'aria-sort': sortDir === 'asc' ? ('ascending' as const) : ('descending' as const) } : {})}
                                    >
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-1.5 text-left hover:text-gray-700 dark:hover:text-gray-200"
                                            onClick={() => toggleSort('status')}
                                        >
                                            Status
                                            <SortGlyph active={sortKey === 'status'} dir={sortDir} />
                                        </button>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E5E7EB] dark:divide-slate-700">
                                {filteredLowStockItems.length > 0 ? sortedLowStockItems.map(item => (
                                    <tr key={item.id} className="transition-colors hover:bg-gray-50/80 dark:hover:bg-slate-800/50">
                                        <td className="min-w-0 px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md border border-[#E5E7EB] bg-gray-50 dark:border-slate-600 dark:bg-slate-800">
                                                    {item.imageUrl ? (
                                                        <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                                                    ) : (
                                                        <div className="flex h-full w-full items-center justify-center text-gray-300 dark:text-gray-600 [&>svg]:h-5 [&>svg]:w-5">
                                                            {ICONS.package}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm font-bold text-gray-900 dark:text-gray-100" title={item.name}>{item.name}</div>
                                                    <div className="truncate font-mono text-xs italic text-gray-500 dark:text-gray-400" title={item.sku}>{item.sku}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="min-w-0 px-6 py-4">
                                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{getCategoryDisplayName(item.category)}</span>
                                        </td>
                                        <td
                                            className={`min-w-0 px-6 py-4 font-mono text-sm font-bold ${
                                                item.onHand <= 0
                                                    ? 'text-[#D32F2F]'
                                                    : item.onHand <= item.reorderPoint
                                                      ? 'text-[#F57C00]'
                                                      : 'text-gray-900 dark:text-gray-100'
                                            }`}
                                        >
                                            {String(item.onHand).padStart(2, '0')} {item.unit}
                                        </td>
                                        <td className="min-w-0 px-6 py-4 font-mono text-sm font-medium text-gray-600 dark:text-gray-300">{item.reorderPoint}</td>
                                        <td className="min-w-0 px-6 py-4">
                                            <span
                                                className={`rounded px-2 py-1 text-xs font-bold ${
                                                    item.onHand <= 0
                                                        ? 'bg-[#D32F2F] text-white dark:bg-[#D32F2F]'
                                                        : item.onHand <= item.reorderPoint
                                                          ? 'bg-[#F57C00]/20 text-[#E65100] dark:bg-[#F57C00]/25 dark:text-[#ffb74d]'
                                                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
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
                                        <td colSpan={5} className="px-6 py-12 text-center text-sm italic text-gray-500 dark:text-gray-400">
                                            {emptyTableHint}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>

                <Card className="flex flex-shrink-0 flex-col space-y-6 border border-[#E5E7EB] p-6 shadow-sm dark:border-slate-700 lg:flex-shrink">
                    <div className="flex items-center gap-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0047AB]/10 text-[#0047AB] [&>svg]:h-4 [&>svg]:w-4">
                            {ICONS.barChart}
                        </span>
                        <h3 className="font-bold text-gray-900 dark:text-gray-100">Warehouse Utilization</h3>
                    </div>
                    <div className="space-y-5">
                        {warehouseUtilization.length > 0 ? warehouseUtilization.map((wh) => (
                            <div key={wh.id} className="space-y-1.5">
                                <div className="flex justify-between text-xs font-bold">
                                    <span className="text-gray-600 dark:text-gray-300">{wh.name}</span>
                                    <span className="tabular-nums text-gray-800 dark:text-gray-200">{wh.pct}%</span>
                                </div>
                                <div className="h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                                    <div
                                        className={`h-full rounded-full transition-all duration-700 ${wh.barClass}`}
                                        style={{ width: `${Math.min(100, wh.pct)}%` }}
                                    />
                                </div>
                                {wh.sub ? (
                                    <p className="text-[11px] font-medium text-[#D32F2F] dark:text-[#ff6b6b]">{wh.sub}</p>
                                ) : null}
                            </div>
                        )) : (
                            <p className="text-sm italic text-gray-500 dark:text-gray-400">No warehouses. Add branches to see inventory by location.</p>
                        )}
                    </div>

                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Last snapshot: <span className="font-semibold text-gray-700 dark:text-gray-300">{utilSnapshotLabel}</span>
                    </p>

                    <div className="border-t border-[#E5E7EB] pt-4 dark:border-slate-700">
                        <button
                            type="button"
                            onClick={() => setHeatmapOpen(true)}
                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#0047AB]/40 bg-[#0047AB]/8 py-3 text-xs font-bold uppercase tracking-wide text-[#0047AB] transition-all hover:bg-[#0047AB]/15 dark:border-[#5b8cff]/40 dark:bg-[#0047AB]/15 dark:text-[#5b8cff] dark:hover:bg-[#0047AB]/25 [&>svg]:h-4 [&>svg]:w-4"
                        >
                            {ICONS.trendingUp}
                            Optimize space
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

            <Modal
                isOpen={!!batchExpiryModal}
                onClose={() => !batchExpirySaving && setBatchExpiryModal(null)}
                title="Correct batch expiry"
                size="sm"
            >
                {batchExpiryModal ? (
                    <div className="space-y-4">
                        <div className="text-sm text-muted-foreground space-y-1">
                            <p>
                                <span className="font-medium text-foreground">{batchExpiryModal.product_name}</span>
                                <span className="font-mono text-xs ml-2">{batchExpiryModal.sku}</span>
                            </p>
                            <p className="font-mono text-xs break-all">{batchExpiryModal.batch_no}</p>
                            <p>{batchExpiryModal.warehouse_name}</p>
                        </div>
                        <div>
                            <label htmlFor="batch-expiry-date" className="block text-xs font-semibold text-muted-foreground mb-1.5">
                                Expiry date
                            </label>
                            <input
                                id="batch-expiry-date"
                                type="date"
                                value={batchExpiryDraft}
                                onChange={(e) => setBatchExpiryDraft(e.target.value)}
                                disabled={batchExpirySaving}
                                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-slate-600"
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setBatchExpiryModal(null)}
                                disabled={batchExpirySaving}
                            >
                                Cancel
                            </Button>
                            <Button type="button" onClick={() => void saveBatchExpiry()} disabled={batchExpirySaving}>
                                {batchExpirySaving ? 'Saving…' : 'Save'}
                            </Button>
                        </div>
                    </div>
                ) : null}
            </Modal>
        </div>
    );
};

export default InventoryDashboard;
