
import React, { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import {
    ArrowLeftRight,
    ChevronLeft,
    ChevronRight,
    Copy,
    History,
    Pencil,
    SlidersHorizontal,
    Trash2,
    Warehouse,
    X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useInventory } from '../../../context/InventoryContext';
import { CURRENCY, ICONS } from '../../../constants';
import Card from '../../ui/Card';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';
import Button from '../../ui/Button';
import Select from '../../ui/Select';
import { shopApi } from '../../../services/shopApi';
import { getShopCategoriesOfflineFirst } from '../../../services/categoriesOfflineCache';
import type { InventoryItem, StockMovement } from '../../../types/inventory';
import AddOrEditSkuModal from '../pos/AddOrEditSkuModal';
import { showAppToast } from '../../../utils/appToast';

const ROW_H = 84;
const LIST_OVERSCAN = 10;
const PAGE_SIZE = 15;

function isExpiringWithinDays(item: InventoryItem, days: number): boolean {
    if (!item.nearestExpiry) return false;
    const d = new Date(item.nearestExpiry + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const until = new Date(today);
    until.setDate(until.getDate() + days);
    return d >= today && d <= until;
}

type StockMasterSortKey = 'name' | 'barcode' | 'onHand' | 'available' | 'inTransit' | 'valueRetail';

function retailStockValue(item: InventoryItem): number {
    return (Number(item.onHand) || 0) * (Number(item.retailPrice) || 0);
}

/** Match reference: green healthy, orange low, red out — uses `available` vs reorder. */
function availableQtyClass(item: InventoryItem): string {
    const av = Number(item.available) || 0;
    if (av <= 0) return 'text-[#D32F2F] dark:text-[#ff6b6b]';
    const rp = Number(item.reorderPoint) || 0;
    if (rp > 0 && av <= rp) return 'text-[#F57C00] dark:text-[#ffb74d]';
    return 'text-emerald-600 dark:text-emerald-400';
}

function compareStockMasterRows(a: InventoryItem, b: InventoryItem, key: StockMasterSortKey, dir: 'asc' | 'desc'): number {
    const mult = dir === 'asc' ? 1 : -1;
    switch (key) {
        case 'name': {
            const c = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
            if (c !== 0) return mult * c;
            return mult * a.sku.localeCompare(b.sku, undefined, { sensitivity: 'base' });
        }
        case 'barcode': {
            const as = a.barcode?.trim() ?? '';
            const bs = b.barcode?.trim() ?? '';
            if (!as && !bs) return 0;
            if (!as) return 1;
            if (!bs) return -1;
            return mult * as.localeCompare(bs, undefined, { numeric: true, sensitivity: 'base' });
        }
        case 'onHand':
            return mult * ((Number(a.onHand) || 0) - (Number(b.onHand) || 0));
        case 'available':
            return mult * ((Number(a.available) || 0) - (Number(b.available) || 0));
        case 'inTransit':
            return mult * ((Number(a.inTransit) || 0) - (Number(b.inTransit) || 0));
        case 'valueRetail':
            return mult * (retailStockValue(a) - retailStockValue(b));
        default:
            return 0;
    }
}

const StockMaster: React.FC = () => {
    const navigate = useNavigate();
    const { items, warehouses, updateStock, requestTransfer, deleteItem } = useInventory();
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [stockFilter, setStockFilter] = useState<'all' | 'in' | 'low' | 'out' | 'expiring' | 'sales_off'>('all');
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
    const [selectedItem, setSelectedItem] = useState<any>(null);

    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isSkuEditorOpen, setIsSkuEditorOpen] = useState(false);
    const [historyMovements, setHistoryMovements] = useState<StockMovement[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [categories, setCategories] = useState<any[]>([]);

    React.useEffect(() => {
        const fetchCategories = async () => {
            try {
                const res = await getShopCategoriesOfflineFirst();
                setCategories(res);
            } catch (err) {
                console.error('Failed to fetch categories:', err);
            }
        };
        fetchCategories();
    }, []);

    useEffect(() => {
        const t = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
        return () => window.clearTimeout(t);
    }, [searchQuery]);

    useEffect(() => {
        if (!isHistoryModalOpen || !selectedItem?.id || String(selectedItem.id).startsWith('pending-')) {
            setHistoryMovements([]);
            return;
        }
        let cancelled = false;
        setHistoryLoading(true);
        shopApi
            .getMovements(selectedItem.id)
            .then((rows) => {
                if (cancelled) return;
                setHistoryMovements(
                    (rows || []).map((m: any) => ({
                        id: m.id,
                        itemId: m.product_id,
                        itemName: m.product_name || 'Unknown Item',
                        type: m.type,
                        quantity: parseFloat(m.quantity),
                        beforeQty: 0,
                        afterQty: 0,
                        warehouseId: m.warehouse_id,
                        referenceId: m.reference_id || 'N/A',
                        timestamp: m.created_at,
                        userId: m.user_id || 'system',
                        notes: m.reason,
                    }))
                );
            })
            .catch(() => {
                if (!cancelled) setHistoryMovements([]);
            })
            .finally(() => {
                if (!cancelled) setHistoryLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isHistoryModalOpen, selectedItem?.id]);

    React.useEffect(() => {
        if (!selectedItem?.id) return;
        const next = items.find((i) => i.id === selectedItem.id);
        if (next) setSelectedItem(next);
    }, [items, selectedItem?.id]);
    const [deleting, setDeleting] = useState(false);

    const copySkuField = useCallback((label: string, value: string) => {
        const v = value.trim();
        if (!v) {
            showAppToast('Nothing to copy.', 'error');
            return;
        }
        void navigator.clipboard.writeText(v).then(
            () => showAppToast(`${label} copied.`, 'success'),
            () => showAppToast('Could not copy to clipboard.', 'error')
        );
    }, []);

    const handleDeleteSku = async () => {
        if (!selectedItem || selectedItem.id.startsWith('pending-')) return;
        const confirmed = window.confirm(
            `Are you sure you want to delete "${selectedItem.name}" (SKU: ${selectedItem.sku})? This cannot be undone.`
        );
        if (!confirmed) return;
        setDeleting(true);
        try {
            await deleteItem(selectedItem.id);
            setSelectedItem(null);
        } catch (e: any) {
            alert(e?.message ?? 'This SKU has been used in transactions. Please delete the transactions first if you want to delete the SKU.');
        } finally {
            setDeleting(false);
        }
    };

    const getMovementStyle = (type: string) => {
        switch (type) {
            case 'Sale': return 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300';
            case 'Purchase': return 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300';
            case 'Transfer': return 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300';
            case 'Adjustment': return 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300';
            default: return 'bg-muted text-muted-foreground';
        }
    };

    const [transferData, setTransferData] = useState({
        sourceWarehouseId: '',
        destinationWarehouseId: '',
        quantity: 0,
        notes: ''
    });

    const [adjustData, setAdjustData] = useState({
        warehouseId: '',
        type: 'Increase' as 'Increase' | 'Decrease',
        quantity: 0,
        reason: ''
    });

    const handleTransfer = () => {
        if (!selectedItem) return;
        requestTransfer({
            sourceWarehouseId: transferData.sourceWarehouseId,
            destinationWarehouseId: transferData.destinationWarehouseId,
            items: [{
                itemId: selectedItem.id,
                quantity: Number(transferData.quantity),
                sku: selectedItem.sku,
                name: selectedItem.name
            }],
            requestedBy: 'admin-1', // Mock user
            notes: transferData.notes
        });
        setIsTransferModalOpen(false);
        setTransferData({ sourceWarehouseId: '', destinationWarehouseId: '', quantity: 0, notes: '' });
    };

    const handleAdjust = () => {
        if (!selectedItem) return;
        // Generate a random ID for reference
        const referenceId = `ADJ-${Date.now()}`;
        updateStock(
            selectedItem.id,
            adjustData.warehouseId,
            adjustData.type === 'Increase' ? Number(adjustData.quantity) : -Number(adjustData.quantity),
            'Adjustment',
            referenceId,
            adjustData.reason
        );
        setIsAdjustModalOpen(false);
        setAdjustData({ warehouseId: '', type: 'Increase', quantity: 0, reason: '' });
    };

    const filteredItems = useMemo(() => {
        const query = debouncedSearch.toLowerCase();
        return items.filter((item) => {
            const matchesSearch =
                !query ||
                item.name.toLowerCase().includes(query) ||
                item.sku.toLowerCase().includes(query) ||
                (item.barcode && item.barcode.toLowerCase().includes(query));
            const selectedCat = selectedCategoryId
                ? categories.find((c: any) => c.id === selectedCategoryId)
                : null;
            const matchesCategory =
                !selectedCategoryId ||
                item.category === selectedCategoryId ||
                (selectedCat && selectedCat.name === item.category);
            if (!matchesSearch || !matchesCategory) return false;
            if (stockFilter === 'in') return item.onHand > 0;
            if (stockFilter === 'out') return item.onHand <= 0;
            if (stockFilter === 'low') return item.onHand <= item.reorderPoint;
            if (stockFilter === 'expiring') return isExpiringWithinDays(item, 30);
            if (stockFilter === 'sales_off') return item.salesDeactivated === true;
            return true;
        });
    }, [items, debouncedSearch, selectedCategoryId, categories, stockFilter]);

    const [sortKey, setSortKey] = useState<StockMasterSortKey | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [page, setPage] = useState(1);

    const sortedItems = useMemo(() => {
        if (!sortKey) return filteredItems;
        const next = [...filteredItems];
        next.sort((a, b) => compareStockMasterRows(a, b, sortKey, sortDir));
        return next;
    }, [filteredItems, sortKey, sortDir]);

    const totalCount = sortedItems.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    const effectivePage = Math.min(page, totalPages);

    useEffect(() => {
        setPage(1);
    }, [debouncedSearch, selectedCategoryId, stockFilter]);

    useEffect(() => {
        setPage((p) => Math.min(p, totalPages));
    }, [totalPages]);

    const paginatedItems = useMemo(() => {
        const start = (effectivePage - 1) * PAGE_SIZE;
        return sortedItems.slice(start, start + PAGE_SIZE);
    }, [sortedItems, effectivePage]);

    const rangeLabel = useMemo(() => {
        if (totalCount === 0) return 'Showing 0 of 0 items';
        const from = (effectivePage - 1) * PAGE_SIZE + 1;
        const to = Math.min(effectivePage * PAGE_SIZE, totalCount);
        return `Showing ${from.toLocaleString()}-${to.toLocaleString()} of ${totalCount.toLocaleString()} items`;
    }, [totalCount, effectivePage]);

    const toggleSort = useCallback((key: StockMasterSortKey) => {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    }, [sortKey]);

    const sortGlyph = useCallback(
        (key: StockMasterSortKey) => {
            const active = sortKey === key;
            const Icon = (active ? (sortDir === 'asc' ? ICONS.arrowUp : ICONS.arrowDown) : ICONS.arrowUpDown) as React.ReactElement;
            return React.cloneElement(Icon, {
                width: 14,
                height: 14,
                className: `shrink-0 ${active ? 'text-[#0047AB] dark:text-[#5b8cff]' : 'text-gray-400 opacity-70 dark:text-gray-500'}`,
                'aria-hidden': true,
            });
        },
        [sortKey, sortDir]
    );

    const listScrollRef = useRef<HTMLDivElement>(null);
    const [listDims, setListDims] = useState({ w: 800, h: 400 });

    useLayoutEffect(() => {
        const el = listScrollRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => {
            setListDims({ w: Math.max(320, el.clientWidth), h: Math.max(120, el.clientHeight) });
        });
        ro.observe(el);
        setListDims({ w: Math.max(320, el.clientWidth), h: Math.max(120, el.clientHeight) });
        return () => ro.disconnect();
    }, []);

    const renderRow = useCallback(
        ({ index, style }: ListChildComponentProps) => {
            const item = paginatedItems[index];
            if (!item) return null;
            const sel = selectedItem?.id === item.id;
            return (
                <div
                    style={style}
                    className={`flex items-stretch cursor-pointer border-b border-[#E5E7EB] transition-colors dark:border-slate-700 ${
                        sel
                            ? 'bg-[#0047AB]/8 ring-1 ring-inset ring-[#0047AB]/20 dark:bg-[#0047AB]/15 dark:ring-[#5b8cff]/30'
                            : 'bg-white hover:bg-gray-50/90 dark:bg-slate-900/30 dark:hover:bg-slate-800/50'
                    }`}
                    onClick={() => setSelectedItem(item)}
                >
                    <div className="flex min-w-0 flex-1 items-center gap-3 px-6 py-3">
                        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md border border-[#E5E7EB] bg-gray-50 dark:border-slate-600 dark:bg-slate-800">
                            {item.imageUrl ? (
                                <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-gray-300 dark:text-gray-600 [&>svg]:h-5 [&>svg]:w-5">
                                    {ICONS.package}
                                </div>
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-sm font-bold text-gray-900 dark:text-gray-100" title={item.name}>
                                    {item.name}
                                </span>
                                {item.salesDeactivated ? (
                                    <span className="shrink-0 rounded border border-[#E5E7EB] bg-gray-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-600 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-300">
                                        Sales off
                                    </span>
                                ) : null}
                            </div>
                            <div className="truncate font-mono text-xs text-gray-500 dark:text-gray-400" title={item.sku}>
                                SKU: {item.sku}
                            </div>
                            {stockFilter === 'expiring' && item.nearestExpiry && isExpiringWithinDays(item, 30) ? (
                                <div className="mt-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">Expires {item.nearestExpiry}</div>
                            ) : null}
                        </div>
                    </div>
                    <div className="flex w-[140px] shrink-0 items-center px-4 py-3">
                        {item.barcode?.trim() ? (
                            <span className="truncate font-mono text-sm font-medium text-gray-800 dark:text-gray-200" title={item.barcode}>
                                {item.barcode}
                            </span>
                        ) : (
                            <span className="text-xs italic text-gray-400 dark:text-gray-500">—</span>
                        )}
                    </div>
                    <div className="flex w-[88px] shrink-0 items-center px-4 py-3 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                        {(Number(item.onHand) || 0).toLocaleString()}
                    </div>
                    <div
                        className={`flex w-[120px] shrink-0 items-center px-4 py-3 text-sm font-bold tabular-nums ${availableQtyClass(item)}`}
                    >
                        {(Number(item.available) || 0).toLocaleString()}
                    </div>
                    <div className="flex w-[88px] shrink-0 items-center px-4 py-3 text-sm font-semibold tabular-nums text-gray-600 dark:text-gray-300">
                        {(Number(item.inTransit) || 0).toLocaleString()}
                    </div>
                    <div className="flex w-[128px] shrink-0 items-center px-4 py-3 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                        {CURRENCY} {retailStockValue(item).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                    <div className="flex w-12 shrink-0 items-center justify-end pr-5 text-gray-400 dark:text-gray-500 [&>svg]:h-[18px] [&>svg]:w-[18px]">
                        {ICONS.chevronRight}
                    </div>
                </div>
            );
        },
        [paginatedItems, selectedItem?.id, stockFilter]
    );

    return (
        <div className="relative flex h-full max-h-full min-h-0 gap-6 overflow-hidden">
            {/* Left: filters + table — shrinks when detail panel is open */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-shrink flex-col gap-4 transition-[flex] duration-200">
                <div className="flex flex-shrink-0 flex-col gap-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="relative min-w-0 flex-1">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 dark:text-gray-500 [&>svg]:h-[18px] [&>svg]:w-[18px]">
                                {ICONS.search}
                            </div>
                            <input
                                type="text"
                                className="block w-full rounded-lg border border-[#E5E7EB] bg-white py-3 pl-10 pr-3 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-[#0047AB] focus:outline-none focus:ring-2 focus:ring-[#0047AB]/25 dark:border-slate-600 dark:bg-slate-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                                placeholder="Search SKU, Name or Barcode..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                aria-label="Search inventory"
                            />
                        </div>
                        <div className="flex shrink-0 items-center gap-2 sm:pl-1">
                            <label htmlFor="stock-master-category" className="whitespace-nowrap text-sm font-medium text-gray-600 dark:text-gray-400">
                                Category:
                            </label>
                            <select
                                id="stock-master-category"
                                value={selectedCategoryId}
                                onChange={(e) => setSelectedCategoryId(e.target.value)}
                                className="min-w-[180px] rounded-lg border border-[#E5E7EB] bg-white py-2.5 pl-3 pr-8 text-sm font-medium text-gray-900 shadow-sm focus:border-[#0047AB] focus:outline-none focus:ring-2 focus:ring-[#0047AB]/25 dark:border-slate-600 dark:bg-slate-900 dark:text-gray-100"
                            >
                                <option value="">All categories</option>
                                <option value="General">General</option>
                                {categories.map((c: any) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {(
                            [
                                { id: 'all' as const, label: 'All' },
                                { id: 'in' as const, label: 'In stock' },
                                { id: 'low' as const, label: 'Low stock' },
                                { id: 'out' as const, label: 'Out of stock' },
                                { id: 'expiring' as const, label: 'Expiring (30d)' },
                                { id: 'sales_off' as const, label: 'Sales off' },
                            ] as const
                        ).map((f) => (
                            <button
                                key={f.id}
                                type="button"
                                onClick={() => setStockFilter(f.id)}
                                className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${
                                    stockFilter === f.id
                                        ? 'border-[#0047AB] bg-[#0047AB] text-white dark:border-[#5b8cff] dark:bg-[#5b8cff]'
                                        : 'border-[#E5E7EB] bg-white text-gray-700 hover:border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:text-gray-200 dark:hover:border-slate-500'
                                }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>

                <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#E5E7EB] bg-white p-0 shadow-sm dark:border-slate-700 dark:bg-slate-900/40">
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <div className="flex shrink-0 border-b border-[#E5E7EB] bg-gray-50/90 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-slate-700 dark:bg-slate-800/80 dark:text-gray-400">
                            <div className="min-w-0 flex-1 px-6 py-3.5">
                                <button
                                    type="button"
                                    onClick={() => toggleSort('name')}
                                    className="flex items-center gap-1.5 rounded-md py-0.5 text-left font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB]/40 dark:text-gray-400 dark:hover:text-gray-200"
                                    aria-label={
                                        sortKey === 'name'
                                            ? `Sort by name, ${sortDir === 'asc' ? 'ascending' : 'descending'}, click to reverse`
                                            : 'Sort by name'
                                    }
                                >
                                    Item Details
                                    {sortGlyph('name')}
                                </button>
                            </div>
                            <div className="flex w-[140px] shrink-0 items-center px-4 py-3.5">
                                <button
                                    type="button"
                                    onClick={() => toggleSort('barcode')}
                                    className="flex items-center gap-1.5 rounded-md py-0.5 font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB]/40 dark:text-gray-400 dark:hover:text-gray-200"
                                    aria-label={
                                        sortKey === 'barcode'
                                            ? `Sort by barcode, ${sortDir === 'asc' ? 'ascending' : 'descending'}, click to reverse`
                                            : 'Sort by barcode'
                                    }
                                >
                                    Barcode
                                    {sortGlyph('barcode')}
                                </button>
                            </div>
                            <div className="flex w-[88px] shrink-0 items-center px-4 py-3.5">
                                <button
                                    type="button"
                                    onClick={() => toggleSort('onHand')}
                                    className="flex items-center gap-1.5 rounded-md py-0.5 font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB]/40 dark:text-gray-400 dark:hover:text-gray-200"
                                    aria-label={
                                        sortKey === 'onHand'
                                            ? `Sort by on hand quantity, ${sortDir === 'asc' ? 'ascending' : 'descending'}, click to reverse`
                                            : 'Sort by on hand quantity'
                                    }
                                >
                                    On Hand
                                    {sortGlyph('onHand')}
                                </button>
                            </div>
                            <div className="flex w-[120px] shrink-0 items-center px-4 py-3.5">
                                <button
                                    type="button"
                                    onClick={() => toggleSort('available')}
                                    className="flex items-center gap-1.5 rounded-md py-0.5 font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB]/40 dark:text-gray-400 dark:hover:text-gray-200"
                                    aria-label={
                                        sortKey === 'available'
                                            ? `Sort by available quantity, ${sortDir === 'asc' ? 'ascending' : 'descending'}, click to reverse`
                                            : 'Sort by available quantity'
                                    }
                                >
                                    Available
                                    {sortGlyph('available')}
                                </button>
                            </div>
                            <div className="flex w-[88px] shrink-0 items-center px-4 py-3.5">
                                <button
                                    type="button"
                                    onClick={() => toggleSort('inTransit')}
                                    className="flex items-center gap-1.5 rounded-md py-0.5 font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB]/40 dark:text-gray-400 dark:hover:text-gray-200"
                                    aria-label={
                                        sortKey === 'inTransit'
                                            ? `Sort by in transit quantity, ${sortDir === 'asc' ? 'ascending' : 'descending'}, click to reverse`
                                            : 'Sort by in transit quantity'
                                    }
                                >
                                    In Transit
                                    {sortGlyph('inTransit')}
                                </button>
                            </div>
                            <div className="flex w-[128px] shrink-0 items-center px-4 py-3.5">
                                <button
                                    type="button"
                                    onClick={() => toggleSort('valueRetail')}
                                    className="flex items-center gap-1.5 rounded-md py-0.5 font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB]/40 dark:text-gray-400 dark:hover:text-gray-200"
                                    aria-label={
                                        sortKey === 'valueRetail'
                                            ? `Sort by retail stock value, ${sortDir === 'asc' ? 'ascending' : 'descending'}, click to reverse`
                                            : 'Sort by retail stock value'
                                    }
                                >
                                    Value (Retail)
                                    {sortGlyph('valueRetail')}
                                </button>
                            </div>
                            <div className="w-12 shrink-0" aria-hidden />
                        </div>
                        <div
                            ref={listScrollRef}
                            className="custom-scrollbar min-h-0 flex-1 overflow-x-auto overflow-y-hidden bg-white dark:bg-slate-900/20"
                            style={{ scrollbarGutter: 'stable' }}
                        >
                            {sortedItems.length === 0 ? (
                                <div className="px-6 py-14 text-center text-sm italic text-gray-500 dark:text-gray-400">No matching SKUs.</div>
                            ) : (
                                <FixedSizeList
                                    height={listDims.h}
                                    width={listDims.w}
                                    itemCount={paginatedItems.length}
                                    itemSize={ROW_H}
                                    overscanCount={LIST_OVERSCAN}
                                >
                                    {renderRow}
                                </FixedSizeList>
                            )}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#E5E7EB] bg-white px-5 py-3.5 dark:border-slate-700 dark:bg-slate-900/30">
                            <p className="text-sm text-gray-600 dark:text-gray-400">{rangeLabel}</p>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setPage(Math.max(1, effectivePage - 1))}
                                    disabled={effectivePage <= 1}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#E5E7EB] bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-200 dark:hover:bg-slate-700"
                                    aria-label="Previous page"
                                >
                                    <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPage(Math.min(totalPages, effectivePage + 1))}
                                    disabled={effectivePage >= totalPages}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#E5E7EB] bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-200 dark:hover:bg-slate-700"
                                    aria-label="Next page"
                                >
                                    <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
                                </button>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Right: SKU detail drawer (reference: hero + id cards + financial + warehouses + actions) */}
            {selectedItem && (
                <div className="animate-slide-in-right flex h-full min-h-0 w-[420px] min-w-[360px] max-w-[440px] shrink-0 flex-col shadow-[-12px_0_40px_-12px_rgba(15,23,42,0.12)] dark:shadow-[-12px_0_40px_-12px_rgba(0,0,0,0.45)]">
                    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-l-2xl border border-[#E5E7EB] border-r-0 bg-white dark:border-slate-700 dark:bg-slate-900">
                        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
                            {/* Hero image + title */}
                            <div className="relative aspect-[5/4] min-h-[200px] w-full overflow-hidden bg-gray-100 dark:bg-slate-800">
                                {selectedItem.imageUrl ? (
                                    <img src={selectedItem.imageUrl} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-gray-300 dark:text-gray-600 [&>svg]:h-16 [&>svg]:w-16">
                                        {ICONS.package}
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" aria-hidden />
                                <button
                                    type="button"
                                    onClick={() => setSelectedItem(null)}
                                    className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-gray-700 shadow-md ring-1 ring-black/5 transition-colors hover:bg-white dark:bg-slate-800/95 dark:text-gray-100 dark:ring-white/10"
                                    aria-label="Close panel"
                                >
                                    <X className="h-5 w-5" strokeWidth={2} />
                                </button>
                                <div className="absolute bottom-0 left-0 right-0 p-4 pt-12">
                                    <span
                                        className={`mb-2 inline-block rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white ${
                                            selectedItem.salesDeactivated
                                                ? 'bg-slate-600'
                                                : selectedItem.onHand <= 0
                                                  ? 'bg-[#D32F2F]'
                                                  : 'bg-[#0047AB]'
                                        }`}
                                    >
                                        {selectedItem.salesDeactivated
                                            ? 'SALES OFF'
                                            : selectedItem.onHand <= 0
                                              ? 'OUT OF STOCK'
                                              : 'ACTIVE STOCK'}
                                    </span>
                                    <h2 className="text-xl font-bold leading-tight text-white drop-shadow-sm sm:text-2xl">{selectedItem.name}</h2>
                                </div>
                            </div>

                            <div className="space-y-5 px-5 pb-6 pt-5">
                                {selectedItem.salesDeactivated ? (
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/35 dark:text-amber-100">
                                        <p className="font-semibold">Hidden from POS and mobile checkout</p>
                                        <p className="mt-1 text-xs leading-snug opacity-90">
                                            Use <strong>Edit SKU (full form)</strong> to turn on &quot;Available for sale&quot;, or filter by{' '}
                                            <strong>Sales off</strong> in the list.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setIsSkuEditorOpen(true)}
                                            className="mt-2 w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-emerald-700"
                                        >
                                            Reactivate for sales
                                        </button>
                                    </div>
                                ) : null}

                                {/* SKU ID + Barcode */}
                                <div className="space-y-2">
                                    <div className="flex items-start justify-between gap-3 rounded-xl bg-[#F3F4F6] px-3.5 py-3 dark:bg-slate-800/90">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">SKU ID</p>
                                            <p className="mt-1 break-all font-semibold text-gray-900 dark:text-gray-100">{selectedItem.sku}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => copySkuField('SKU ID', selectedItem.sku)}
                                            className="shrink-0 rounded-lg p-2 text-gray-500 transition-colors hover:bg-white hover:text-[#0047AB] dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-[#5b8cff]"
                                            aria-label="Copy SKU ID"
                                        >
                                            <Copy className="h-4 w-4" strokeWidth={2} />
                                        </button>
                                    </div>
                                    <div className="flex items-start justify-between gap-3 rounded-xl bg-[#F3F4F6] px-3.5 py-3 dark:bg-slate-800/90">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Barcode</p>
                                            <p className="mt-1 font-semibold text-gray-900 dark:text-gray-100">
                                                {selectedItem.barcode?.trim() ? selectedItem.barcode : '—'}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => copySkuField('Barcode', selectedItem.barcode ?? '')}
                                            disabled={!selectedItem.barcode?.trim()}
                                            className="shrink-0 rounded-lg p-2 text-gray-500 transition-colors hover:bg-white hover:text-[#0047AB] disabled:pointer-events-none disabled:opacity-35 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-[#5b8cff]"
                                            aria-label="Copy barcode"
                                        >
                                            <Copy className="h-4 w-4" strokeWidth={2} />
                                        </button>
                                    </div>
                                </div>

                                {/* Financial snapshot */}
                                <div>
                                    <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                                        Financial snapshot
                                    </p>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="rounded-xl bg-sky-100/90 px-3 py-3 shadow-sm dark:bg-sky-950/50 dark:ring-1 dark:ring-sky-800/40">
                                            <p className="text-[10px] font-bold uppercase tracking-wide text-sky-900/80 dark:text-sky-200/80">
                                                Retail price
                                            </p>
                                            <p className="mt-1.5 text-lg font-bold tabular-nums text-sky-950 dark:text-sky-50">
                                                {CURRENCY} {Number(selectedItem.retailPrice ?? 0).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="rounded-xl bg-[#F3F4F6] px-3 py-3 shadow-sm dark:bg-slate-800/90 dark:ring-1 dark:ring-slate-700">
                                            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-600 dark:text-gray-400">Unit cost</p>
                                            <p className="mt-1.5 text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">
                                                {CURRENCY} {Number(selectedItem.costPrice ?? 0).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Warehouse distribution */}
                                <div>
                                    <div className="mb-3 flex items-center justify-between gap-2">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                                            Warehouse distribution
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => navigate('/multi-store')}
                                            className="text-xs font-semibold text-[#0047AB] hover:underline dark:text-[#5b8cff]"
                                        >
                                            Manage sites
                                        </button>
                                    </div>
                                    <ul className="space-y-2">
                                        {warehouses.map((wh) => (
                                            <li
                                                key={wh.id}
                                                className="flex items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/50"
                                            >
                                                <div className="flex min-w-0 items-center gap-2.5">
                                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F3F4F6] text-gray-600 dark:bg-slate-700 dark:text-gray-300">
                                                        <Warehouse className="h-4 w-4" strokeWidth={2} aria-hidden />
                                                    </span>
                                                    <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{wh.name}</span>
                                                </div>
                                                <span className="shrink-0 text-base font-bold tabular-nums text-gray-900 dark:text-gray-100">
                                                    {selectedItem.warehouseStock[wh.id] ?? 0}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                {/* Actions */}
                                <div className="space-y-3 border-t border-[#E5E7EB] pt-5 dark:border-slate-700">
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setIsTransferModalOpen(true)}
                                            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0a1628] py-3.5 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-[#132337] dark:bg-[#0f172a] dark:hover:bg-[#1e293b]"
                                        >
                                            <ArrowLeftRight className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                                            Transfer
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setIsAdjustModalOpen(true)}
                                            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F3F4F6] py-3.5 text-xs font-bold uppercase tracking-wide text-gray-800 shadow-sm transition-colors hover:bg-gray-200 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100 dark:hover:bg-slate-700"
                                        >
                                            <SlidersHorizontal className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                                            Adjust
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsSkuEditorOpen(true)}
                                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white py-3.5 text-xs font-bold uppercase tracking-wide text-gray-800 shadow-sm transition-colors hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-900 dark:text-gray-100 dark:hover:bg-slate-800"
                                    >
                                        <Pencil className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                                        Edit SKU (full form)
                                    </button>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setIsHistoryModalOpen(true)}
                                            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white py-3.5 text-xs font-bold uppercase tracking-wide text-gray-800 shadow-sm transition-colors hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-900 dark:text-gray-100 dark:hover:bg-slate-800"
                                        >
                                            <History className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                                            View history
                                        </button>
                                        {!selectedItem.id.startsWith('pending-') ? (
                                            <button
                                                type="button"
                                                onClick={handleDeleteSku}
                                                disabled={deleting}
                                                className="flex h-[46px] w-12 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 shadow-sm transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/60"
                                                aria-label="Delete SKU"
                                            >
                                                <Trash2 className="h-4 w-4" strokeWidth={2} />
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* History Modal */}
            <Modal
                isOpen={isHistoryModalOpen}
                onClose={() => setIsHistoryModalOpen(false)}
                title={`Stock Card - ${selectedItem?.name}`}
                size="lg"
            >
                <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-xs font-semibold uppercase text-muted-foreground tracking-widest">Bin Card History</p>
                            <h4 className="text-sm font-bold text-muted-foreground mt-1">Audit Trail for {selectedItem?.sku}</h4>
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-semibold uppercase text-muted-foreground tracking-widest">Current Balance</p>
                            <p className="text-lg font-semibold text-indigo-600 dark:text-indigo-400 font-mono italic">{selectedItem?.onHand} {selectedItem?.unit}</p>
                        </div>
                    </div>

                    <div className="border border-border rounded-2xl overflow-hidden shadow-sm">
                        <table className="w-full text-left">
                            <thead className="bg-muted/80 text-xs font-semibold uppercase text-muted-foreground">
                                <tr>
                                    <th className="px-6 py-4">Date</th>
                                    <th className="px-6 py-4">Event</th>
                                    <th className="px-6 py-4">Warehouse</th>
                                    <th className="px-6 py-4 text-center">Qty</th>
                                    <th className="px-6 py-4 text-right">Reference</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {historyLoading ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground text-sm">
                                            Loading history…
                                        </td>
                                    </tr>
                                ) : historyMovements.length > 0 ? historyMovements.map(move => (
                                    <tr key={move.id} className="hover:bg-muted/50/50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-xs font-bold text-foreground">
                                                {new Date(move.timestamp).toLocaleDateString()}
                                            </div>
                                            <div className="text-xs text-muted-foreground font-mono">
                                                {new Date(move.timestamp).toLocaleTimeString()}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-xs font-semibold uppercase tracking-wider ${getMovementStyle(move.type)}`}>
                                                {move.type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-xs font-bold text-muted-foreground">
                                            {warehouses.find(w => w.id === move.warehouseId)?.name || '---'}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`text-sm font-semibold font-mono ${move.quantity > 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                                                {move.quantity > 0 ? '+' : ''}{move.quantity}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-xs font-mono font-bold bg-muted text-muted-foreground p-1 rounded uppercase">
                                                {move.referenceId.slice(0, 8)}
                                            </span>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground italic text-sm">
                                            No historical transactions found for this item.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Modal>

            {/* Transfer Modal */}
            <Modal
                isOpen={isTransferModalOpen}
                onClose={() => setIsTransferModalOpen(false)}
                title={`Transfer Stock - ${selectedItem?.name}`}
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Select
                            label="Source Warehouse"
                            value={transferData.sourceWarehouseId}
                            onChange={(e) => setTransferData({ ...transferData, sourceWarehouseId: e.target.value })}
                        >
                            <option value="">Select Source</option>
                            {warehouses.map(wh => (
                                <option key={wh.id} value={wh.id}>{wh.name}</option>
                            ))}
                        </Select>
                        <Select
                            label="Destination Warehouse"
                            value={transferData.destinationWarehouseId}
                            onChange={(e) => setTransferData({ ...transferData, destinationWarehouseId: e.target.value })}
                        >
                            <option value="">Select Destination</option>
                            {warehouses.map(wh => (
                                <option key={wh.id} value={wh.id}>{wh.name}</option>
                            ))}
                        </Select>
                    </div>
                    <Input
                        label="Quantity"
                        type="number"
                        value={transferData.quantity}
                        onChange={(e) => setTransferData({ ...transferData, quantity: Number(e.target.value) })}
                    />
                    <Input
                        label="Notes"
                        placeholder="Reason for transfer..."
                        value={transferData.notes}
                        onChange={(e) => setTransferData({ ...transferData, notes: e.target.value })}
                    />
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="secondary" onClick={() => setIsTransferModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleTransfer} disabled={!transferData.sourceWarehouseId || !transferData.destinationWarehouseId || !transferData.quantity}>
                            Confirm Transfer
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Adjustment Modal */}
            <Modal
                isOpen={isAdjustModalOpen}
                onClose={() => setIsAdjustModalOpen(false)}
                title={selectedItem ? `Adjust Stock — ${selectedItem.name}` : 'Adjust Stock'}
                size="lg"
            >
                <div className="space-y-5">
                    {selectedItem && (
                        <div className="rounded-2xl border border-border bg-gradient-to-b from-muted/70 to-muted/35 dark:from-muted/30 dark:to-muted/15 p-4 sm:p-5 shadow-sm">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 sm:mb-4">
                                Current SKU
                            </p>
                            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6 lg:gap-x-4 lg:gap-y-4">
                                <div className="min-w-0 col-span-2 lg:col-span-2">
                                    <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                        Name
                                    </div>
                                    <div
                                        className="text-sm font-bold text-foreground leading-snug line-clamp-2"
                                        title={selectedItem.name}
                                    >
                                        {selectedItem.name}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground font-mono mt-1 truncate" title={selectedItem.sku}>
                                        SKU: {selectedItem.sku}
                                    </div>
                                </div>
                                <div className="min-w-0 col-span-1">
                                    <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                        Barcode
                                    </div>
                                    {selectedItem.barcode?.trim() ? (
                                        <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800/60 max-w-full">
                                            <span className="text-xs font-mono font-bold truncate">{selectedItem.barcode}</span>
                                        </div>
                                    ) : (
                                        <span className="text-xs italic text-muted-foreground">No barcode</span>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                        On hand
                                    </div>
                                    <div className="text-lg font-semibold font-mono tabular-nums text-foreground">
                                        {Number(selectedItem.onHand) || 0}
                                        <span className="text-xs font-sans font-medium text-muted-foreground ml-1">
                                            {selectedItem.unit}
                                        </span>
                                    </div>
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                        Available
                                    </div>
                                    <span
                                        className={`inline-flex px-2 py-1 rounded-lg text-sm font-bold font-mono tabular-nums ${
                                            Number(selectedItem.available) > 10
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                                : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                                        }`}
                                    >
                                        {Number(selectedItem.available) || 0}
                                        <span className="text-xs font-sans font-semibold ml-1 opacity-90">{selectedItem.unit}</span>
                                    </span>
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                        In transit
                                    </div>
                                    <div className="text-lg font-semibold font-mono tabular-nums text-muted-foreground">
                                        {Number(selectedItem.inTransit) || 0}
                                        <span className="text-xs font-sans font-medium text-muted-foreground/80 ml-1">
                                            {selectedItem.unit}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Adjustment details
                        </p>
                        <Select
                            label="Warehouse"
                            value={adjustData.warehouseId}
                            onChange={(e) => setAdjustData({ ...adjustData, warehouseId: e.target.value })}
                        >
                            <option value="">Select Warehouse</option>
                            {warehouses.map(wh => (
                                <option key={wh.id} value={wh.id}>{wh.name}</option>
                            ))}
                        </Select>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Select
                                label="Adjustment Type"
                                value={adjustData.type}
                                onChange={(e) => setAdjustData({ ...adjustData, type: e.target.value as any })}
                            >
                                <option value="Increase">Increase (+)</option>
                                <option value="Decrease">Decrease (-)</option>
                            </Select>
                            <Input
                                label="Quantity"
                                type="number"
                                min={0}
                                value={adjustData.quantity}
                                onChange={(e) => setAdjustData({ ...adjustData, quantity: Number(e.target.value) })}
                            />
                        </div>
                        <Input
                            label="Reason"
                            placeholder="Broken, Found, Gift, etc."
                            value={adjustData.reason}
                            onChange={(e) => setAdjustData({ ...adjustData, reason: e.target.value })}
                        />
                        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-1">
                            <Button variant="secondary" onClick={() => setIsAdjustModalOpen(false)} className="w-full sm:w-auto">
                                Cancel
                            </Button>
                            <Button
                                onClick={handleAdjust}
                                disabled={!adjustData.warehouseId || !adjustData.quantity}
                                className="w-full sm:w-auto"
                            >
                                Confirm Adjustment
                            </Button>
                        </div>
                    </div>
                </div>
            </Modal>

            <AddOrEditSkuModal
                isOpen={isSkuEditorOpen && !!selectedItem}
                onClose={() => setIsSkuEditorOpen(false)}
                initialEditingItem={selectedItem}
                onItemReady={(item) => {
                    setSelectedItem(item);
                    setIsSkuEditorOpen(false);
                }}
            />
        </div>
    );
};

export default StockMaster;
