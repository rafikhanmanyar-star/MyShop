
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInventory } from '../../../context/InventoryContext';
import { ICONS } from '../../../constants';
import type { StockMovement } from '../../../types/inventory';

const LEDGER_PRIMARY = '#0047AB';
const LEDGER_SURFACE = '#F8F9FA';
const LEDGER_BORDER = '#E0E0E0';
const PAGE_SIZE = 25;

type LedgerTab = 'all' | 'sales' | 'purchases' | 'mobile';

function iconSm(node: React.ReactNode) {
    return (
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-current [&>svg]:h-full [&>svg]:w-full">
            {node}
        </span>
    );
}

function movementAffectsOnHand(type: string): boolean {
    const t = (type || '').toLowerCase();
    return t !== 'reserve' && t !== 'releasereserve';
}

function buildBeforeAfterByMovementId(
    movements: StockMovement[],
    items: { id: string; warehouseStock: Record<string, number> }[]
): Map<string, { before: number; after: number }> {
    const stockFor = (itemId: string, warehouseId: string) => {
        const it = items.find((i) => i.id === itemId);
        return it?.warehouseStock?.[warehouseId] ?? 0;
    };

    const byKey = new Map<string, StockMovement[]>();
    for (const m of movements) {
        if (!movementAffectsOnHand(m.type)) continue;
        const k = `${m.itemId}\x00${m.warehouseId}`;
        if (!byKey.has(k)) byKey.set(k, []);
        byKey.get(k)!.push(m);
    }

    const out = new Map<string, { before: number; after: number }>();
    for (const [, list] of byKey) {
        const sorted = [...list].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        if (sorted.length === 0) continue;
        const { itemId, warehouseId } = sorted[0];
        let running = stockFor(itemId, warehouseId);
        for (const m of sorted) {
            const after = running;
            const before = after - m.quantity;
            out.set(m.id, { before, after });
            running = before;
        }
    }
    return out;
}

function eventBadge(type: string): { label: string; className: string } {
    switch (type) {
        case 'Sale':
            return { label: 'SALE', className: 'bg-red-100 text-red-600' };
        case 'Purchase':
            return { label: 'PURCHASE', className: 'bg-blue-100 text-[#0047AB]' };
        case 'MobileSale':
            return { label: 'MOBILE SALE', className: 'bg-purple-100 text-purple-700' };
        default:
            return {
                label: type.replace(/([A-Z])/g, ' $1').trim().toUpperCase() || 'EVENT',
                className: 'bg-gray-100 text-gray-600',
            };
    }
}

function matchesLedgerTab(m: StockMovement, tab: LedgerTab): boolean {
    switch (tab) {
        case 'sales':
            return m.type === 'Sale';
        case 'purchases':
            return m.type === 'Purchase';
        case 'mobile':
            return m.type === 'MobileSale';
        default:
            return true;
    }
}

function escapeCsvCell(v: string): string {
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
}

function formatRefDisplay(ref: string): string {
    if (!ref || ref === 'N/A') return '—';
    const trimmed = ref.trim();
    if (trimmed.startsWith('#')) return trimmed;
    return `#${trimmed}`;
}

const StockMovements: React.FC = () => {
    const { movements, warehouses, items, loadMovements } = useInventory();

    const [ledgerTab, setLedgerTab] = useState<LedgerTab>('all');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');
    const [datePanelOpen, setDatePanelOpen] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [warehouseFilterId, setWarehouseFilterId] = useState<string>('');

    const datePanelRef = useRef<HTMLDivElement>(null);
    const filtersPanelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadMovements();
    }, [loadMovements]);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            const t = e.target as Node;
            if (datePanelOpen && datePanelRef.current && !datePanelRef.current.contains(t)) {
                setDatePanelOpen(false);
            }
            if (filtersOpen && filtersPanelRef.current && !filtersPanelRef.current.contains(t)) {
                setFiltersOpen(false);
            }
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [datePanelOpen, filtersOpen]);

    const beforeAfterMap = useMemo(
        () => buildBeforeAfterByMovementId(movements, items),
        [movements, items]
    );

    const itemById = useMemo(() => {
        const m = new Map<string, (typeof items)[0]>();
        for (const it of items) m.set(it.id, it);
        return m;
    }, [items]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const fromMs = dateFrom
            ? new Date(`${dateFrom}T00:00:00.000`).getTime()
            : null;
        const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

        return movements.filter((m) => {
            if (!matchesLedgerTab(m, ledgerTab)) return false;
            if (warehouseFilterId && m.warehouseId !== warehouseFilterId) return false;
            const ts = new Date(m.timestamp).getTime();
            if (fromMs != null && ts < fromMs) return false;
            if (toMs != null && ts > toMs) return false;
            if (!q) return true;
            const sku = (m.sku || itemById.get(m.itemId)?.sku || '').toLowerCase();
            const name = (m.itemName || '').toLowerCase();
            const ref = (m.referenceId || '').toLowerCase();
            return ref.includes(q) || sku.includes(q) || name.includes(q);
        });
    }, [movements, ledgerTab, search, dateFrom, dateTo, warehouseFilterId, itemById]);

    const totalFiltered = filtered.length;

    useEffect(() => {
        setPage(0);
    }, [ledgerTab, search, dateFrom, dateTo, warehouseFilterId, movements.length]);

    useEffect(() => {
        const maxPage = Math.max(0, Math.ceil(totalFiltered / PAGE_SIZE) - 1);
        setPage((p) => Math.min(p, maxPage));
    }, [totalFiltered]);

    useEffect(() => {
        setSelectedIds(new Set());
    }, [ledgerTab, search, dateFrom, dateTo, warehouseFilterId]);
    const pageCount = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
    const safePage = Math.min(page, pageCount - 1);
    const pageRows = useMemo(() => {
        const start = safePage * PAGE_SIZE;
        return filtered.slice(start, start + PAGE_SIZE);
    }, [filtered, safePage]);

    const pageIds = useMemo(() => pageRows.map((r) => r.id), [pageRows]);
    const allPageSelected =
        pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
    const somePageSelected = pageIds.some((id) => selectedIds.has(id)) && !allPageSelected;

    const toggleSelectAllPage = useCallback(() => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (allPageSelected) {
                for (const id of pageIds) next.delete(id);
            } else {
                for (const id of pageIds) next.add(id);
            }
            return next;
        });
    }, [allPageSelected, pageIds]);

    const toggleRow = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const exportRows = useCallback(
        (rows: StockMovement[]) => {
            const header = [
                'Timestamp',
                'Item',
                'SKU',
                'Event',
                'Warehouse',
                'Qty change',
                'Before',
                'After',
                'Reference',
            ];
            const lines = rows.map((m) => {
                const wh = warehouses.find((w) => w.id === m.warehouseId)?.code || '';
                const sku = m.sku || itemById.get(m.itemId)?.sku || '';
                const bal = beforeAfterMap.get(m.id);
                let before = '';
                let after = '';
                if (bal != null) {
                    before = String(Math.round(bal.before));
                    after = String(Math.round(bal.after));
                } else if (movementAffectsOnHand(m.type)) {
                    before = String(Math.round(m.beforeQty));
                    after = String(Math.round(m.afterQty));
                }
                const cells = [
                    new Date(m.timestamp).toISOString(),
                    m.itemName,
                    sku,
                    m.type,
                    wh,
                    String(m.quantity),
                    before,
                    after,
                    m.referenceId || '',
                ];
                return cells.map((c) => escapeCsvCell(String(c))).join(',');
            });
            const csv = '\uFEFF' + [header.join(','), ...lines].join('\r\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `inventory-movements-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        },
        [beforeAfterMap, itemById, warehouses]
    );

    const onExportClick = useCallback(() => {
        const selectedList = filtered.filter((m) => selectedIds.has(m.id));
        if (selectedList.length > 0) {
            exportRows(selectedList);
            return;
        }
        exportRows(filtered);
    }, [exportRows, filtered, selectedIds]);

    const clearDateRange = useCallback(() => {
        setDateFrom('');
        setDateTo('');
    }, []);

    const tabBtn = (id: LedgerTab, label: string) => {
        const active = ledgerTab === id;
        return (
            <button
                type="button"
                key={id}
                onClick={() => setLedgerTab(id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    active
                        ? 'text-white shadow-sm'
                        : 'bg-[#ECEFF1] text-gray-700 hover:bg-[#E0E0E0]'
                }`}
                style={active ? { backgroundColor: LEDGER_PRIMARY } : undefined}
            >
                {label}
            </button>
        );
    };

    const pillBalances = (m: StockMovement) => {
        const bal = beforeAfterMap.get(m.id);
        if (bal) {
            return {
                before: Math.round(bal.before),
                after: Math.round(bal.after),
            };
        }
        if (movementAffectsOnHand(m.type) && (m.beforeQty !== 0 || m.afterQty !== 0)) {
            return { before: Math.round(m.beforeQty), after: Math.round(m.afterQty) };
        }
        return null;
    };

    const showingFrom = totalFiltered === 0 ? 0 : safePage * PAGE_SIZE + 1;
    const showingTo = totalFiltered === 0 ? 0 : Math.min(totalFiltered, (safePage + 1) * PAGE_SIZE);

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white px-4 animate-fade-in dark:bg-slate-900">
            <div className="flex-shrink-0 pb-4 pt-1">
                <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                    Immutable Transaction Ledger
                </h1>
                <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
                    Track all stock movements with full traceability across your global infrastructure.
                </p>
            </div>

            <div className="mb-4 flex flex-shrink-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    {tabBtn('all', 'All')}
                    {tabBtn('sales', 'Sales')}
                    {tabBtn('purchases', 'Purchases')}
                    {tabBtn('mobile', 'Mobile Sales')}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <div
                        className="relative flex min-w-0 flex-1 items-center rounded-xl border bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
                        style={{ borderColor: LEDGER_BORDER }}
                    >
                        {iconSm(ICONS.search)}
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search reference or SKU..."
                            className="ml-2 min-w-0 flex-1 border-0 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 dark:text-white"
                        />
                    </div>

                    <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                        <div className="relative" ref={datePanelRef}>
                            <button
                                type="button"
                                onClick={() => {
                                    setDatePanelOpen((o) => !o);
                                    setFiltersOpen(false);
                                }}
                                className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-200 dark:hover:bg-slate-700"
                                style={{ borderColor: LEDGER_BORDER }}
                            >
                                {iconSm(ICONS.calendar)}
                                Date Range
                            </button>
                            {datePanelOpen && (
                                <div
                                    className="absolute right-0 z-30 mt-2 w-72 rounded-xl border bg-white p-4 shadow-lg dark:border-slate-600 dark:bg-slate-800"
                                    style={{ borderColor: LEDGER_BORDER }}
                                >
                                    <div className="space-y-3 text-sm">
                                        <label className="block">
                                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                From
                                            </span>
                                            <input
                                                type="date"
                                                value={dateFrom}
                                                onChange={(e) => setDateFrom(e.target.value)}
                                                className="w-full rounded-lg border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900"
                                                style={{ borderColor: LEDGER_BORDER }}
                                            />
                                        </label>
                                        <label className="block">
                                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                To
                                            </span>
                                            <input
                                                type="date"
                                                value={dateTo}
                                                onChange={(e) => setDateTo(e.target.value)}
                                                className="w-full rounded-lg border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900"
                                                style={{ borderColor: LEDGER_BORDER }}
                                            />
                                        </label>
                                        <div className="flex justify-end gap-2 pt-1">
                                            <button
                                                type="button"
                                                onClick={clearDateRange}
                                                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700"
                                            >
                                                Clear
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDatePanelOpen(false)}
                                                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                                                style={{ backgroundColor: LEDGER_PRIMARY }}
                                            >
                                                Apply
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="relative" ref={filtersPanelRef}>
                            <button
                                type="button"
                                onClick={() => {
                                    setFiltersOpen((o) => !o);
                                    setDatePanelOpen(false);
                                }}
                                className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-200 dark:hover:bg-slate-700"
                                style={{ borderColor: LEDGER_BORDER }}
                            >
                                {iconSm(ICONS.filter)}
                                Filters
                            </button>
                            {filtersOpen && (
                                <div
                                    className="absolute right-0 z-30 mt-2 w-72 rounded-xl border bg-white p-4 shadow-lg dark:border-slate-600 dark:bg-slate-800"
                                    style={{ borderColor: LEDGER_BORDER }}
                                >
                                    <label className="block text-sm">
                                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            Warehouse
                                        </span>
                                        <select
                                            value={warehouseFilterId}
                                            onChange={(e) => setWarehouseFilterId(e.target.value)}
                                            className="w-full rounded-lg border px-2 py-2 dark:border-slate-600 dark:bg-slate-900"
                                            style={{ borderColor: LEDGER_BORDER }}
                                        >
                                            <option value="">All warehouses</option>
                                            {warehouses.map((w) => (
                                                <option key={w.id} value={w.id}>
                                                    {w.code} — {w.name}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setWarehouseFilterId('');
                                            setFiltersOpen(false);
                                        }}
                                        className="mt-3 w-full rounded-lg border py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-gray-200 dark:hover:bg-slate-700"
                                        style={{ borderColor: LEDGER_BORDER }}
                                    >
                                        Clear warehouse filter
                                    </button>
                                </div>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={onExportClick}
                            className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-200 dark:hover:bg-slate-700"
                            style={{ borderColor: LEDGER_BORDER }}
                        >
                            {iconSm(ICONS.download)}
                            Export
                        </button>
                    </div>
                </div>
            </div>

            <div
                className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border dark:border-slate-600"
                style={{ backgroundColor: LEDGER_SURFACE, borderColor: LEDGER_BORDER }}
            >
                <div
                    className="min-h-0 flex-1 overflow-auto"
                    style={{ scrollbarGutter: 'stable' }}
                >
                    <table className="w-full min-w-[900px] text-left">
                        <thead>
                            <tr
                                className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                                style={{ backgroundColor: LEDGER_SURFACE }}
                            >
                                <th className="sticky top-0 z-10 w-10 px-3 py-3" style={{ backgroundColor: LEDGER_SURFACE }}>
                                    <input
                                        type="checkbox"
                                        checked={allPageSelected}
                                        ref={(el) => {
                                            if (el) el.indeterminate = somePageSelected;
                                        }}
                                        onChange={toggleSelectAllPage}
                                        className="h-4 w-4 rounded border-gray-300"
                                        style={{ accentColor: LEDGER_PRIMARY }}
                                        aria-label="Select all on page"
                                    />
                                </th>
                                <th className="sticky top-0 z-10 px-3 py-3" style={{ backgroundColor: LEDGER_SURFACE }}>
                                    Timestamp
                                </th>
                                <th className="sticky top-0 z-10 px-3 py-3" style={{ backgroundColor: LEDGER_SURFACE }}>
                                    Item details
                                </th>
                                <th className="sticky top-0 z-10 px-3 py-3" style={{ backgroundColor: LEDGER_SURFACE }}>
                                    Event type
                                </th>
                                <th className="sticky top-0 z-10 px-3 py-3" style={{ backgroundColor: LEDGER_SURFACE }}>
                                    Warehouse
                                </th>
                                <th className="sticky top-0 z-10 px-3 py-3 text-center" style={{ backgroundColor: LEDGER_SURFACE }}>
                                    Qty change
                                </th>
                                <th className="sticky top-0 z-10 px-3 py-3" style={{ backgroundColor: LEDGER_SURFACE }}>
                                    Before / After
                                </th>
                                <th className="sticky top-0 z-10 px-3 py-3" style={{ backgroundColor: LEDGER_SURFACE }}>
                                    Reference
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y bg-white dark:divide-slate-700 dark:bg-slate-900">
                            {pageRows.length > 0 ? (
                                pageRows.map((move) => {
                                    const whCode =
                                        warehouses.find((w) => w.id === move.warehouseId)?.code || '—';
                                    const item = itemById.get(move.itemId);
                                    const sku = move.sku || item?.sku || '';
                                    const thumb = item?.imageUrl;
                                    const badge = eventBadge(move.type);
                                    const balances = pillBalances(move);
                                    const pos = move.quantity > 0;
                                    const neg = move.quantity < 0;
                                    return (
                                        <tr
                                            key={move.id}
                                            className="transition-colors hover:bg-gray-50/80 dark:hover:bg-slate-800/80"
                                        >
                                            <td className="px-3 py-3 align-middle">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(move.id)}
                                                    onChange={() => toggleRow(move.id)}
                                                    className="h-4 w-4 rounded border-gray-300"
                                                    style={{ accentColor: LEDGER_PRIMARY }}
                                                    aria-label={`Select movement ${move.id}`}
                                                />
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-3 align-middle">
                                                <div className="text-sm font-bold text-gray-900 dark:text-white">
                                                    {new Date(move.timestamp).toLocaleDateString('en-US', {
                                                        month: 'short',
                                                        day: 'numeric',
                                                        year: 'numeric',
                                                    })}
                                                </div>
                                                <div className="font-mono text-xs text-gray-500 dark:text-gray-400">
                                                    {new Date(move.timestamp).toLocaleTimeString(undefined, {
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                        second: '2-digit',
                                                        hour12: false,
                                                    })}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 align-middle">
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg border bg-gray-100 dark:border-slate-600 dark:bg-slate-800"
                                                        style={{ borderColor: LEDGER_BORDER }}
                                                    >
                                                        {thumb ? (
                                                            <img
                                                                src={thumb}
                                                                alt=""
                                                                className="h-full w-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">
                                                                SKU
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="truncate text-sm font-bold text-gray-900 dark:text-white">
                                                            {move.itemName}
                                                        </div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                                            {sku ? `SKU: ${sku}` : `ID: ${move.itemId.slice(0, 8)}…`}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 align-middle">
                                                <span
                                                    className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide ${badge.className}`}
                                                >
                                                    {badge.label}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 align-middle">
                                                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
                                                    {iconSm(ICONS.building)}
                                                    <span>{whCode}</span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-center align-middle">
                                                <span
                                                    className={`text-sm font-bold tabular-nums ${
                                                        neg
                                                            ? 'text-red-600'
                                                            : pos
                                                              ? 'text-[#0047AB]'
                                                              : 'text-gray-600'
                                                    }`}
                                                >
                                                    {move.quantity > 0 ? '+' : ''}
                                                    {move.quantity}
                                                </span>
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-3 align-middle">
                                                {balances ? (
                                                    <div className="flex items-center gap-2">
                                                        <span
                                                            className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-200"
                                                            style={{ backgroundColor: '#ECEFF1' }}
                                                        >
                                                            {balances.before}
                                                        </span>
                                                        <span className="text-gray-300 dark:text-gray-600">→</span>
                                                        <span
                                                            className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-200"
                                                            style={{ backgroundColor: '#ECEFF1' }}
                                                        >
                                                            {balances.after}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-gray-400">—</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 align-middle">
                                                <button
                                                    type="button"
                                                    className="text-left text-sm font-semibold hover:underline"
                                                    style={{ color: LEDGER_PRIMARY }}
                                                    title="Copy reference"
                                                    onClick={() => {
                                                        const ref = move.referenceId || '';
                                                        if (ref && ref !== 'N/A' && navigator.clipboard?.writeText) {
                                                            void navigator.clipboard.writeText(ref);
                                                        }
                                                    }}
                                                >
                                                    {formatRefDisplay(move.referenceId)}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td
                                        colSpan={8}
                                        className="px-6 py-20 text-center text-sm italic text-gray-500 dark:text-gray-400"
                                    >
                                        No stock movements match your filters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div
                    className="flex flex-shrink-0 items-center justify-between border-t px-4 py-3 dark:border-slate-700"
                    style={{ borderColor: LEDGER_BORDER, backgroundColor: LEDGER_SURFACE }}
                >
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Showing {showingFrom}-{showingTo} of {totalFiltered.toLocaleString()} movements
                    </p>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            disabled={safePage <= 0}
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                            className="rounded-lg p-2 text-gray-600 hover:bg-white disabled:opacity-40 dark:text-gray-300 dark:hover:bg-slate-800"
                            aria-label="Previous page"
                        >
                            {iconSm(ICONS.chevronLeft)}
                        </button>
                        <button
                            type="button"
                            disabled={safePage >= pageCount - 1}
                            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                            className="rounded-lg p-2 text-gray-600 hover:bg-white disabled:opacity-40 dark:text-gray-300 dark:hover:bg-slate-800"
                            aria-label="Next page"
                        >
                            {iconSm(ICONS.chevronRight)}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StockMovements;
