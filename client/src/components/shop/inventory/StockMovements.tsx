
import React, { useEffect } from 'react';
import { useInventory } from '../../../context/InventoryContext';
import { ICONS } from '../../../constants';
import Card from '../../ui/Card';

const StockMovements: React.FC = () => {
    const { movements, warehouses, loadMovements } = useInventory();

    useEffect(() => {
        loadMovements();
    }, [loadMovements]);

    const getMovementStyle = (type: string) => {
        switch (type) {
            case 'Sale': return 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300';
            case 'Purchase': return 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300';
            case 'Transfer': return 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300';
            case 'Adjustment': return 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300';
            default: return 'bg-muted text-muted-foreground';
        }
    };

    return (
        <div className="flex flex-col h-full min-h-0 overflow-hidden animate-fade-in">
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
                <h3 className="text-lg font-semibold text-foreground tracking-tight">Immutable Transaction Ledger</h3>
                <div className="flex gap-2">
                    <button className="px-4 py-2 bg-card border border-border rounded-xl text-xs font-bold text-muted-foreground hover:bg-muted/50 dark:border-slate-600 transition-all flex items-center gap-2">
                        {ICONS.calendar} Date Filter
                    </button>
                    <button className="px-4 py-2 bg-card border border-border rounded-xl text-xs font-bold text-muted-foreground hover:bg-muted/50 dark:border-slate-600 transition-all flex items-center gap-2">
                        {ICONS.fileText} Export Trace Log
                    </button>
                </div>
            </div>

            <Card className="border-none shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto custom-scrollbar" style={{ scrollbarGutter: 'stable' }}>
                    <table className="w-full text-left">
                        <thead className="bg-muted/80 text-xs font-semibold uppercase text-muted-foreground sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-4 bg-muted/80">Timestamp</th>
                                <th className="px-6 py-4 bg-muted/80">Item Detail</th>
                                <th className="px-6 py-4 bg-muted/80">Event Type</th>
                                <th className="px-6 py-4 bg-muted/80">Warehouse</th>
                                <th className="px-6 py-4 text-center bg-muted/80">Change</th>
                                <th className="px-6 py-4 bg-muted/80">Before / After</th>
                                <th className="px-6 py-4 bg-muted/80">Reference</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {movements.length > 0 ? movements.map(move => (
                                <tr key={move.id} className="hover:bg-muted/50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-xs font-bold text-foreground">
                                            {new Date(move.timestamp).toLocaleDateString()}
                                        </div>
                                        <div className="text-xs text-muted-foreground font-mono">
                                            {new Date(move.timestamp).toLocaleTimeString()}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-bold text-foreground">{move.itemName}</div>
                                        <div className="text-xs text-muted-foreground">ID: {move.itemId.slice(0, 8)}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-xs font-semibold uppercase tracking-wider ${getMovementStyle(move.type)}`}>
                                            {move.type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-xs font-bold text-muted-foreground">
                                        {warehouses.find(w => w.id === move.warehouseId)?.code || '---'}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`text-sm font-semibold font-mono ${move.quantity > 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                                            {move.quantity > 0 ? '+' : ''}{move.quantity}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="text-muted-foreground text-xs font-mono">{move.beforeQty}</span>
                                        <span className="mx-2 text-slate-300 dark:text-slate-600">→</span>
                                        <span className="text-foreground text-sm font-semibold font-mono">{move.afterQty}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-mono font-bold bg-muted text-muted-foreground p-1 rounded uppercase">
                                                {move.referenceId.slice(0, 10)}
                                            </span>
                                            {move.notes && <div className="text-xs text-muted-foreground italic truncate max-w-[100px]">{move.notes}</div>}
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={7} className="px-6 py-20 text-center text-muted-foreground italic">
                                        No stock movements recorded in this period.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default StockMovements;
