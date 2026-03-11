import React, { useState, useEffect, useMemo } from 'react';
import { useInventory } from '../../../context/InventoryContext';
import { ICONS, CURRENCY } from '../../../constants';
import Card from '../../ui/Card';
import { shopApi } from '../../../services/shopApi';
import { getShopCategoriesOfflineFirst } from '../../../services/categoriesOfflineCache';

const BAR_COLORS = ['bg-indigo-600', 'bg-emerald-500', 'bg-amber-500'];

const InventoryDashboard: React.FC = () => {
    const { items, lowStockItems, totalInventoryValue, warehouses } = useInventory();
    const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');

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

    const getCategoryDisplayName = (itemCategory: string | undefined) => {
        if (!itemCategory) return 'General';
        const cat = categories.find(c => c.id === itemCategory || c.name === itemCategory);
        return cat ? cat.name : itemCategory;
    };

    const stats = [
        { label: 'Total SKUs', value: items.length, icon: ICONS.package, color: 'text-indigo-600', bg: 'bg-indigo-50' },
        { label: 'Low Stock', value: lowStockItems.length, icon: ICONS.trendingDown, color: 'text-amber-600', bg: 'bg-amber-50' },
        { label: 'Out of Stock', value: items.filter(i => i.onHand <= 0).length, icon: ICONS.xCircle, color: 'text-rose-600', bg: 'bg-rose-50' },
        { label: 'Stock Value', value: `${CURRENCY} ${totalInventoryValue.toLocaleString()}`, icon: ICONS.dollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    ];

    return (
        <div className="space-y-8 animate-fade-in">
            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Low Stock Table */}
                <Card className="lg:col-span-2 border-none shadow-sm overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-slate-100 flex flex-wrap justify-between items-center gap-4">
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
                    <div className="flex-1 overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400">
                                <tr>
                                    <th className="px-6 py-4">Item Name / SKU</th>
                                    <th className="px-6 py-4">Category</th>
                                    <th className="px-6 py-4">On Hand</th>
                                    <th className="px-6 py-4">Reorder Point</th>
                                    <th className="px-6 py-4">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredLowStockItems.length > 0 ? filteredLowStockItems.map(item => (
                                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-slate-800 text-sm">{item.name}</div>
                                            <div className="text-[10px] text-slate-400 font-mono italic">{item.sku}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-sm font-medium text-slate-600">{getCategoryDisplayName(item.category)}</span>
                                        </td>
                                        <td className="px-6 py-4 text-sm font-black font-mono">{item.onHand} {item.unit}</td>
                                        <td className="px-6 py-4 text-sm font-medium text-slate-500 font-mono">{item.reorderPoint}</td>
                                        <td className="px-6 py-4">
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
                <Card className="border-none shadow-sm p-6 space-y-6">
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
                        <button className="w-full py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2">
                            {ICONS.trendingUp} View Detailed Heatmap
                        </button>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default InventoryDashboard;
