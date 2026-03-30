import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
import { useInventory } from '../../../context/InventoryContext';
import { ICONS, CURRENCY } from '../../../constants';
import Card from '../../ui/Card';
import { getShopCategoriesOfflineFirst } from '../../../services/categoriesOfflineCache';
import type { InventoryItem } from '../../../types/inventory';
import WarehouseHeatmapModal from './WarehouseHeatmapModal';

const BAR_COLORS = ['bg-indigo-600', 'bg-emerald-500', 'bg-amber-500'];

type CriticalSortKey = 'name' | 'category' | 'onHand' | 'reorderPoint' | 'status';

type ColWidthKey = 'item' | 'category' | 'onHand' | 'reorder' | 'status';

const MIN_COL_PX = 72;
const DEFAULT_COL_WIDTHS: Record<ColWidthKey, number> = {
    item: 220,
    category: 140,
    onHand: 100,
    reorder: 120,
    status: 128,
};

function SortGlyph({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
    if (!active) return <ArrowUpDown className="w-3.5 h-3.5 shrink-0 opacity-40" strokeWidth={2} aria-hidden />;
    return dir === 'asc' ? (
        <ChevronUp className="w-3.5 h-3.5 shrink-0 text-indigo-600" strokeWidth={2} aria-hidden />
    ) : (
        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-indigo-600" strokeWidth={2} aria-hidden />
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

    // Real branch/warehouse inventory: units per warehouse and % of total stock
    const warehouseUtilization = React.useMemo(() => {
        const totalUnits = items.reduce((sum, i) => sum + i.onHand, 0);
        return warehouses.map((wh, i) => {
            const unitsAtWh = items.reduce((sum, item) => sum + (item.warehouseStock?.[wh.id] ?? 0), 0);
            const pct = totalUnits > 0 ? Math.round((unitsAtWh / totalUnits) * 100) : 0;
            return { id: wh.id, name: wh.name, units: unitsAtWh, pct, color: BAR_COLORS[i % BAR_COLORS.length] };
        });
    }, [warehouses, items]);

    const filteredLowStockItems = useMemo(() => {
        if (!selectedCategoryId) return lowStockItems;
        const selectedCat = categories.find(c => c.id === selectedCategoryId);
        return lowStockItems.filter(item =>
            item.category === selectedCategoryId ||
            (selectedCat && selectedCat.name === item.category)
        );
    }, [lowStockItems, selectedCategoryId, categories]);

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
                    const av = a.onHand <= 0 ? 0 : 1;
                    const bv = b.onHand <= 0 ? 0 : 1;
                    cmp = av - bv;
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

    const stats = [
        { label: 'Total SKUs', value: items.length, icon: ICONS.package, color: 'text-indigo-600', bg: 'bg-indigo-50' },
        { label: 'Low Stock', value: lowStockItems.length, icon: ICONS.trendingDown, color: 'text-amber-600', bg: 'bg-amber-50' },
        { label: 'Out of Stock', value: items.filter(i => i.onHand <= 0).length, icon: ICONS.xCircle, color: 'text-rose-600', bg: 'bg-rose-50' },
        { label: 'Stock Value', value: `${CURRENCY} ${totalInventoryValue.toLocaleString()}`, icon: ICONS.dollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    ];

    return (
        <div className="flex flex-col h-full min-h-0 overflow-hidden gap-8 animate-fade-in">
            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 flex-shrink-0">
                {stats.map((stat, i) => (
                    <Card key={i} className="p-6 border-none shadow-sm flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-2xl ${stat.bg} ${stat.color} flex items-center justify-center`}>
                            {React.cloneElement(stat.icon as React.ReactElement<any>, { width: 28, height: 28 })}
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest text-slate-400">{stat.label}</p>
                            <p className="text-2xl font-black text-slate-800 tracking-tight">{stat.value}</p>
                        </div>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0 overflow-hidden">
                {/* Low Stock Table */}
                <Card className="lg:col-span-2 border-none shadow-sm overflow-hidden flex flex-col min-h-0">
                    <div className="p-6 border-b border-slate-100 flex flex-wrap justify-between items-center gap-4 flex-shrink-0">
                        <h3 className="font-bold text-slate-800">Critical Stock Alerts</h3>
                        <div className="flex items-center gap-3">
                            <label htmlFor="critical-alerts-category" className="text-xs font-bold text-slate-600 whitespace-nowrap">
                                Category:
                            </label>
                            <select
                                id="critical-alerts-category"
                                value={selectedCategoryId}
                                onChange={(e) => setSelectedCategoryId(e.target.value)}
                                className="block rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-slate-800 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 min-w-[160px]"
                            >
                                <option value="">All categories</option>
                                <option value="General">General</option>
                                {categories.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                            <span className="px-2 py-1 bg-rose-100 text-rose-600 text-[10px] font-black rounded uppercase">Immediate Action Needed</span>
                        </div>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto custom-scrollbar" style={{ scrollbarGutter: 'stable' }}>
                        <table className="w-full table-fixed text-left">
                            <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 sticky top-0 z-10">
                                <tr>
                                    <th
                                        style={{ width: colWidths.item, minWidth: MIN_COL_PX }}
                                        className="relative px-6 py-4 bg-slate-50 group align-bottom"
                                        {...(sortKey === 'name' ? { 'aria-sort': sortDir === 'asc' ? ('ascending' as const) : ('descending' as const) } : {})}
                                    >
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-1.5 text-left hover:text-slate-600"
                                            onClick={() => toggleSort('name')}
                                        >
                                            Item Name / SKU
                                            <SortGlyph active={sortKey === 'name'} dir={sortDir} />
                                        </button>
                                        <div
                                            className="absolute right-0 top-0 z-20 h-full w-2 cursor-col-resize hover:bg-indigo-400/30"
                                            onMouseDown={(e) => beginColumnResize(e, 'item')}
                                            title="Drag to resize"
                                            role="separator"
                                            aria-orientation="vertical"
                                        />
                                    </th>
                                    <th
                                        style={{ width: colWidths.category, minWidth: MIN_COL_PX }}
                                        className="relative px-6 py-4 bg-slate-50 group align-bottom"
                                        {...(sortKey === 'category' ? { 'aria-sort': sortDir === 'asc' ? ('ascending' as const) : ('descending' as const) } : {})}
                                    >
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-1.5 text-left hover:text-slate-600"
                                            onClick={() => toggleSort('category')}
                                        >
                                            Category
                                            <SortGlyph active={sortKey === 'category'} dir={sortDir} />
                                        </button>
                                        <div
                                            className="absolute right-0 top-0 z-20 h-full w-2 cursor-col-resize hover:bg-indigo-400/30"
                                            onMouseDown={(e) => beginColumnResize(e, 'category')}
                                            title="Drag to resize"
                                            role="separator"
                                            aria-orientation="vertical"
                                        />
                                    </th>
                                    <th
                                        style={{ width: colWidths.onHand, minWidth: MIN_COL_PX }}
                                        className="relative px-6 py-4 bg-slate-50 group align-bottom"
                                        {...(sortKey === 'onHand' ? { 'aria-sort': sortDir === 'asc' ? ('ascending' as const) : ('descending' as const) } : {})}
                                    >
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-1.5 text-left hover:text-slate-600"
                                            onClick={() => toggleSort('onHand')}
                                        >
                                            On Hand
                                            <SortGlyph active={sortKey === 'onHand'} dir={sortDir} />
                                        </button>
                                        <div
                                            className="absolute right-0 top-0 z-20 h-full w-2 cursor-col-resize hover:bg-indigo-400/30"
                                            onMouseDown={(e) => beginColumnResize(e, 'onHand')}
                                            title="Drag to resize"
                                            role="separator"
                                            aria-orientation="vertical"
                                        />
                                    </th>
                                    <th
                                        style={{ width: colWidths.reorder, minWidth: MIN_COL_PX }}
                                        className="relative px-6 py-4 bg-slate-50 group align-bottom"
                                        {...(sortKey === 'reorderPoint' ? { 'aria-sort': sortDir === 'asc' ? ('ascending' as const) : ('descending' as const) } : {})}
                                    >
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-1.5 text-left hover:text-slate-600"
                                            onClick={() => toggleSort('reorderPoint')}
                                        >
                                            Reorder Point
                                            <SortGlyph active={sortKey === 'reorderPoint'} dir={sortDir} />
                                        </button>
                                        <div
                                            className="absolute right-0 top-0 z-20 h-full w-2 cursor-col-resize hover:bg-indigo-400/30"
                                            onMouseDown={(e) => beginColumnResize(e, 'reorder')}
                                            title="Drag to resize"
                                            role="separator"
                                            aria-orientation="vertical"
                                        />
                                    </th>
                                    <th
                                        style={{ width: colWidths.status, minWidth: MIN_COL_PX }}
                                        className="relative px-6 py-4 bg-slate-50 align-bottom"
                                        {...(sortKey === 'status' ? { 'aria-sort': sortDir === 'asc' ? ('ascending' as const) : ('descending' as const) } : {})}
                                    >
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-1.5 text-left hover:text-slate-600"
                                            onClick={() => toggleSort('status')}
                                        >
                                            Status
                                            <SortGlyph active={sortKey === 'status'} dir={sortDir} />
                                        </button>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredLowStockItems.length > 0 ? sortedLowStockItems.map(item => (
                                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="min-w-0 px-6 py-4">
                                            <div className="truncate font-bold text-slate-800 text-sm" title={item.name}>{item.name}</div>
                                            <div className="truncate text-[10px] text-slate-400 font-mono italic" title={item.sku}>{item.sku}</div>
                                        </td>
                                        <td className="min-w-0 px-6 py-4">
                                            <span className="text-sm font-medium text-slate-600">{getCategoryDisplayName(item.category)}</span>
                                        </td>
                                        <td className="min-w-0 px-6 py-4 text-sm font-black font-mono">{item.onHand} {item.unit}</td>
                                        <td className="min-w-0 px-6 py-4 text-sm font-medium text-slate-500 font-mono">{item.reorderPoint}</td>
                                        <td className="min-w-0 px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-[10px] font-bold ${item.onHand <= 0 ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
                                                }`}>
                                                {item.onHand <= 0 ? 'OUT OF STOCK' : 'LOW STOCK'}
                                            </span>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic text-sm">
                                            {lowStockItems.length > 0 ? 'No critical stock in this category.' : 'No critical stock levels detected.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>

                {/* Warehouse Snapshot */}
                <Card className="border-none shadow-sm p-6 space-y-6 flex-shrink-0 lg:flex-shrink">
                    <h3 className="font-bold text-slate-800">Warehouse Utilization</h3>
                    <div className="space-y-6">
                        {warehouseUtilization.length > 0 ? warehouseUtilization.map((wh) => (
                            <div key={wh.id} className="space-y-2">
                                <div className="flex justify-between text-xs font-bold">
                                    <span className="text-slate-600">{wh.name}</span>
                                    <span className="text-slate-400">{wh.pct}% of stock</span>
                                </div>
                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-1000 ${wh.color}`}
                                        style={{ width: `${Math.min(100, wh.pct)}%` }}
                                    />
                                </div>
                            </div>
                        )) : (
                            <p className="text-sm text-slate-400 italic">No warehouses. Add branches to see inventory by location.</p>
                        )}
                    </div>

                    <div className="pt-6 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={() => setHeatmapOpen(true)}
                            className="w-full py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 hover:border-indigo-200 hover:text-indigo-700 transition-all flex items-center justify-center gap-2"
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
