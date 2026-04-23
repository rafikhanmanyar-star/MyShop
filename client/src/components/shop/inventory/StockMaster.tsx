
import React, { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
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

const ROW_H = 72;
const LIST_OVERSCAN = 10;

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

    const sortedItems = useMemo(() => {
        if (!sortKey) return filteredItems;
        const next = [...filteredItems];
        next.sort((a, b) => compareStockMasterRows(a, b, sortKey, sortDir));
        return next;
    }, [filteredItems, sortKey, sortDir]);

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
                className: `shrink-0 ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-muted-foreground opacity-60'}`,
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
            const item = sortedItems[index];
            if (!item) return null;
            const sel = selectedItem?.id === item.id;
            return (
                <div
                    style={style}
                    className={`flex items-stretch border-b border-border cursor-pointer transition-colors ${
                        sel
                            ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200 dark:bg-indigo-950/40 dark:ring-indigo-500/40'
                            : 'hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30'
                    }`}
                    onClick={() => setSelectedItem(item)}
                >
                    <div className="flex-1 min-w-0 px-6 py-2 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center overflow-hidden border border-border shrink-0">
                            {item.imageUrl ? (
                                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                                React.cloneElement(ICONS.image as React.ReactElement, { size: 20, className: 'text-slate-300 dark:text-slate-500' })
                            )}
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="font-bold text-foreground text-sm truncate">{item.name}</span>
                                {item.salesDeactivated && (
                                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-100">
                                        Sales off
                                    </span>
                                )}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono italic truncate">SKU: {item.sku}</div>
                            {item.nearestExpiry && isExpiringWithinDays(item, 30) && (
                                <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 mt-0.5">
                                    Expires {item.nearestExpiry}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="w-[140px] shrink-0 px-4 py-2 flex items-center whitespace-nowrap">
                        {item.barcode ? (
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg w-fit border border-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800/60">
                                <span className="text-xs font-mono font-bold">{item.barcode}</span>
                            </div>
                        ) : (
                            <span className="text-slate-300 dark:text-slate-500 text-xs italic">No Barcode</span>
                        )}
                    </div>
                    <div className="w-[88px] shrink-0 px-4 py-2 flex items-center text-sm font-semibold font-mono text-foreground">{item.onHand}</div>
                    <div className="w-[120px] shrink-0 px-4 py-2 flex items-center">
                        <span
                            className={`px-2 py-0.5 rounded text-xs font-bold ${
                                item.available > 10
                                    ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300'
                                    : 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300'
                            }`}
                        >
                            {item.available} {item.unit}
                        </span>
                    </div>
                    <div className="w-[88px] shrink-0 px-4 py-2 flex items-center text-sm font-bold text-muted-foreground font-mono">{item.inTransit}</div>
                    <div className="w-[120px] shrink-0 px-4 py-2 flex items-center text-sm font-semibold text-foreground font-mono">
                        {retailStockValue(item).toLocaleString()}
                    </div>
                    <div className="w-12 shrink-0 flex items-center justify-end pr-4">{ICONS.chevronRight}</div>
                </div>
            );
        },
        [sortedItems, selectedItem?.id]
    );

    return (
        <div className="flex gap-6 h-full max-h-full min-h-0 overflow-hidden relative">
            {/* Left: Item List - shrinks when detail panel is open */}
            <div className={`flex-1 min-w-0 flex flex-col gap-6 transition-[flex] duration-200 flex-shrink min-h-0`}>
                <div className="flex flex-wrap items-center gap-4 flex-shrink-0">
                    <div className="relative group flex-1 min-w-[200px] max-w-md">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                            {ICONS.search}
                        </div>
                        <input
                            type="text"
                            className="block w-full pl-10 pr-3 py-3 border border-border rounded-xl leading-5 bg-card text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm dark:border-slate-600"
                            placeholder="Search SKU, Name or Barcode..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <label htmlFor="stock-master-category" className="text-sm font-bold text-muted-foreground whitespace-nowrap">
                            Category:
                        </label>
                        <select
                            id="stock-master-category"
                            value={selectedCategoryId}
                            onChange={(e) => setSelectedCategoryId(e.target.value)}
                            className="block rounded-xl border border-border bg-card py-3 pl-4 pr-10 text-sm font-medium text-foreground shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 min-w-[180px] dark:border-slate-600"
                        >
                            <option value="">All categories</option>
                            <option value="General">General</option>
                            {categories.map((c: any) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-wrap gap-2 flex-shrink-0">
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
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                                    stockFilter === f.id
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'bg-card text-muted-foreground border-border hover:border-indigo-300'
                                }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>

                <Card className="border-none shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                        <div className="bg-muted/80 text-xs font-semibold uppercase text-muted-foreground flex shrink-0 border-b border-border">
                            <div className="flex-1 min-w-0 px-6 py-2">
                                <button
                                    type="button"
                                    onClick={() => toggleSort('name')}
                                    className="flex items-center gap-1.5 text-left font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md py-1 -my-1"
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
                            <div className="w-[140px] shrink-0 px-4 py-2 flex items-center">
                                <button
                                    type="button"
                                    onClick={() => toggleSort('barcode')}
                                    className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md py-1 -my-1"
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
                            <div className="w-[88px] shrink-0 px-4 py-2 flex items-center">
                                <button
                                    type="button"
                                    onClick={() => toggleSort('onHand')}
                                    className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md py-1 -my-1"
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
                            <div className="w-[120px] shrink-0 px-4 py-2 flex items-center">
                                <button
                                    type="button"
                                    onClick={() => toggleSort('available')}
                                    className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md py-1 -my-1"
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
                            <div className="w-[88px] shrink-0 px-4 py-2 flex items-center">
                                <button
                                    type="button"
                                    onClick={() => toggleSort('inTransit')}
                                    className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md py-1 -my-1"
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
                            <div className="w-[120px] shrink-0 px-4 py-2 flex items-center">
                                <button
                                    type="button"
                                    onClick={() => toggleSort('valueRetail')}
                                    className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md py-1 -my-1"
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
                            <div className="w-12 shrink-0" />
                        </div>
                        <div ref={listScrollRef} className="flex-1 min-h-0 overflow-x-auto custom-scrollbar" style={{ scrollbarGutter: 'stable' }}>
                            {sortedItems.length === 0 ? (
                                <div className="px-6 py-12 text-center text-muted-foreground text-sm italic">No matching SKUs.</div>
                            ) : (
                                <FixedSizeList
                                    height={listDims.h}
                                    width={listDims.w}
                                    itemCount={sortedItems.length}
                                    itemSize={ROW_H}
                                    overscanCount={LIST_OVERSCAN}
                                >
                                    {renderRow}
                                </FixedSizeList>
                            )}
                        </div>
                    </div>
                </Card>
            </div>

            {/* Right: Item Drill-down Side Panel - fixed width, no overlap */}
            {selectedItem && (
                <div className="flex-shrink-0 w-[420px] min-w-[360px] min-h-0 flex flex-col animate-slide-in-right">
                    <Card className="h-full min-h-0 border-none shadow-xl flex flex-col p-8 gap-8 overflow-y-auto bg-card border-l border-indigo-100 dark:border-slate-700 rounded-none rounded-l-3xl">
                        <div className="space-y-3">
                            <div className="flex justify-between items-start gap-3">
                                <div className="min-w-0">
                                    <h2 className="text-xl font-semibold text-foreground">{selectedItem.name}</h2>
                                    <p className="text-xs font-semibold uppercase text-indigo-500 dark:text-indigo-400 tracking-widest mt-1">SKU ID: {selectedItem.sku}</p>
                                    {selectedItem.barcode && (
                                        <p className="text-xs font-semibold uppercase text-emerald-600 dark:text-emerald-400 tracking-widest mt-0.5">📊 BARCODE: {selectedItem.barcode}</p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedItem(null)}
                                    className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground shrink-0"
                                >
                                    {ICONS.x}
                                </button>
                            </div>
                            {selectedItem.salesDeactivated && (
                                <div className="rounded-xl border-2 border-amber-400 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:bg-amber-950/30 dark:border-amber-600 dark:text-amber-100">
                                    <p className="font-semibold">Hidden from POS &amp; mobile checkout</p>
                                    <p className="text-xs mt-1 opacity-90 leading-snug">
                                        This SKU is still in inventory. Open <strong>Edit SKU (full form)</strong> below and turn on &quot;Available for
                                        sale&quot;, or use the <strong>Sales off</strong> filter in the list to find similar products.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setIsSkuEditorOpen(true)}
                                        className="mt-2 w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-emerald-700"
                                    >
                                        Reactivate for sales
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Product Image Preview */}
                        <div className="w-full aspect-video rounded-3xl bg-muted/80 border border-border overflow-hidden flex items-center justify-center text-slate-200 dark:text-slate-600 shadow-inner">
                            {selectedItem.imageUrl ? (
                                <img src={selectedItem.imageUrl} alt={selectedItem.name} className="w-full h-full object-cover" />
                            ) : (
                                React.cloneElement(ICONS.image as React.ReactElement, { size: 64 })
                            )}
                        </div>

                        {/* Stock Distribution Matrix */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Inventory Distribution</h3>
                            <div className="grid grid-cols-1 gap-3">
                                {warehouses.map(wh => (
                                    <div key={wh.id} className="flex items-center justify-between p-4 bg-muted/80 rounded-2xl border border-border group hover:border-indigo-200 dark:hover:border-indigo-500/40 transition-all">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-card flex items-center justify-center text-muted-foreground shadow-sm border border-border group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                                {ICONS.building}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-foreground">{wh.name}</p>
                                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-tight">{wh.code}</p>
                                            </div>
                                        </div>
                                        <div className="text-xl font-semibold text-foreground font-mono">
                                            {selectedItem.warehouseStock[wh.id] || 0}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Financial Metrics */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-100 dark:shadow-indigo-900/40">
                                <p className="text-xs font-bold uppercase opacity-80">Retail Price</p>
                                <p className="text-xl font-semibold font-mono mt-1">{CURRENCY} {selectedItem.retailPrice}</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-100 dark:bg-slate-800 dark:shadow-black/40">
                                <p className="text-xs font-bold uppercase opacity-80">Cost Price</p>
                                <p className="text-xl font-semibold font-mono mt-1">{CURRENCY} {selectedItem.costPrice}</p>
                            </div>
                        </div>

                        {/* Inventory Controls */}
                        <div className="space-y-4 mt-auto">
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setIsTransferModalOpen(true)}
                                    className="flex-1 py-4 bg-card border-2 border-border text-foreground rounded-2xl font-semibold text-xs hover:border-indigo-600 hover:text-indigo-600 dark:hover:border-indigo-400 dark:hover:text-indigo-400 transition-all uppercase tracking-widest shadow-sm"
                                >
                                    Transfer
                                </button>
                                <button
                                    onClick={() => setIsAdjustModalOpen(true)}
                                    className="flex-1 py-4 bg-card border-2 border-border text-foreground rounded-2xl font-semibold text-xs hover:border-indigo-600 hover:text-indigo-600 dark:hover:border-indigo-400 dark:hover:text-indigo-400 transition-all uppercase tracking-widest shadow-sm"
                                >
                                    Adjust
                                </button>
                            </div>
                            <button
                                onClick={() => setIsSkuEditorOpen(true)}
                                className="w-full py-4 bg-indigo-50 text-indigo-600 rounded-2xl font-semibold text-xs hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/60 dark:border-indigo-800/50 transition-all uppercase tracking-widest shadow-sm border border-indigo-100 dark:border-indigo-800/50 mb-3"
                            >
                                Edit SKU (full form)
                            </button>
                            <button
                                onClick={() => setIsHistoryModalOpen(true)}
                                className="w-full py-4 bg-muted/80 text-muted-foreground rounded-2xl font-semibold text-xs uppercase tracking-[0.2em] border border-dashed border-border hover:bg-muted transition-all"
                            >
                                View Full Card History
                            </button>
                            {!selectedItem.id.startsWith('pending-') && (
                                <button
                                    type="button"
                                    onClick={handleDeleteSku}
                                    disabled={deleting}
                                    className="w-full py-4 bg-red-50 text-red-600 rounded-2xl font-semibold text-xs uppercase tracking-widest border border-red-200 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800/60 dark:hover:bg-red-950/60 transition-all disabled:opacity-50"
                                >
                                    {deleting ? 'Deleting...' : 'Delete SKU'}
                                </button>
                            )}
                        </div>
                    </Card>
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
                title={`Adjust Stock - ${selectedItem?.name}`}
            >
                <div className="space-y-4">
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
                    <div className="grid grid-cols-2 gap-4">
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
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="secondary" onClick={() => setIsAdjustModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleAdjust} disabled={!adjustData.warehouseId || !adjustData.quantity}>
                            Confirm Adjustment
                        </Button>
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
