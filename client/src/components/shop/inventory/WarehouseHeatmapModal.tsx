import React, { useMemo, useCallback } from 'react';
import Modal from '../../ui/Modal';
import type { InventoryItem, Warehouse } from '../../../types/inventory';
import { useTheme } from '../../../context/ThemeContext';

const MAX_CATEGORY_COLUMNS = 18;

type WarehouseHeatmapModalProps = {
    isOpen: boolean;
    onClose: () => void;
    items: InventoryItem[];
    warehouses: Warehouse[];
    categories: { id: string; name: string }[];
};

function cellBackground(units: number, maxUnits: number, isDark: boolean): React.CSSProperties {
    if (maxUnits <= 0 || units <= 0) {
        return { backgroundColor: isDark ? 'rgb(30 41 59)' : 'rgb(248 250 252)' };
    }
    const t = Math.min(1, units / maxUnits);
    const alpha = isDark ? 0.18 + t * 0.45 : 0.12 + t * 0.55;
    return { backgroundColor: `rgba(99, 102, 241, ${alpha})` };
}

const WarehouseHeatmapModal: React.FC<WarehouseHeatmapModalProps> = ({
    isOpen,
    onClose,
    items,
    warehouses,
    categories,
}) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const resolveCategoryName = useCallback(
        (itemCategory: string | undefined) => {
            if (!itemCategory) return 'General';
            const cat = categories.find((c) => c.id === itemCategory || c.name === itemCategory);
            return cat ? cat.name : itemCategory;
        },
        [categories]
    );

    const { columnCategories, rows, maxCell, grandTotal, columnTotals, categoriesTruncated, hasWarehouseBreakdown } =
        useMemo(() => {
            const catTotals = new Map<string, number>();
            for (const item of items) {
                const name = resolveCategoryName(item.category);
                let u = 0;
                for (const wh of warehouses) {
                    u += item.warehouseStock?.[wh.id] ?? 0;
                }
                if (u === 0) u = item.onHand;
                catTotals.set(name, (catTotals.get(name) ?? 0) + u);
            }
            const ranked = [...catTotals.entries()].sort((a, b) => b[1] - a[1]);
            const sortedCats = ranked.map(([k]) => k).slice(0, MAX_CATEGORY_COLUMNS);
            const categoriesTruncated = ranked.length > MAX_CATEGORY_COLUMNS;

            let max = 0;
            const rowData: {
                warehouse: Warehouse;
                cells: number[];
                rowTotal: number;
            }[] = [];

            const singleWh = warehouses.length === 1 ? warehouses[0] : null;

            for (const wh of warehouses) {
                const cells: number[] = [];
                let rowTotal = 0;
                for (const cat of sortedCats) {
                    let sum = 0;
                    for (const item of items) {
                        if (resolveCategoryName(item.category) !== cat) continue;
                        let u = item.warehouseStock?.[wh.id] ?? 0;
                        if (
                            u === 0 &&
                            singleWh &&
                            wh.id === singleWh.id &&
                            !Object.values(item.warehouseStock || {}).some((q) => q > 0)
                        ) {
                            u = item.onHand;
                        }
                        sum += u;
                    }
                    cells.push(sum);
                    rowTotal += sum;
                    max = Math.max(max, sum);
                }
                rowData.push({ warehouse: wh, cells, rowTotal });
            }

            const colTotals = sortedCats.map((_, colIdx) =>
                rowData.reduce((acc, r) => acc + r.cells[colIdx], 0)
            );
            const grand = colTotals.reduce((a, b) => a + b, 0);
            const hasWarehouseBreakdown = rowData.some((r) => r.rowTotal > 0);

            return {
                columnCategories: sortedCats,
                rows: rowData,
                maxCell: max,
                columnTotals: colTotals,
                grandTotal: grand,
                categoriesTruncated,
                hasWarehouseBreakdown,
            };
        }, [items, warehouses, resolveCategoryName]);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Warehouse stock heatmap"
            size="full"
            className="max-w-[min(96vw,1200px)]"
        >
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Units per branch by product category (from per-warehouse stock). Darker cells hold more units in
                    that location.
                </p>
                {warehouses.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">Add warehouses or branches to see the heatmap.</p>
                ) : items.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No inventory items to display.</p>
                ) : columnCategories.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No category breakdown available.</p>
                ) : (
                    <>
                    {!hasWarehouseBreakdown && items.some((i) => i.onHand > 0) && warehouses.length !== 1 && (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
                            Per-branch quantities are not recorded for your products yet, so all cells show 0. Stock
                            movements that assign units to warehouses will fill this heatmap.
                        </p>
                    )}
                    <div className="overflow-x-auto rounded-xl border border-border">
                        <table className="w-full min-w-[640px] text-left text-xs">
                            <thead>
                                <tr className="border-b border-border bg-muted/80 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    <th className="sticky left-0 z-[1] min-w-[140px] bg-muted/80 px-3 py-3 text-foreground">
                                        Warehouse
                                    </th>
                                    {columnCategories.map((cat) => (
                                        <th key={cat} className="min-w-[72px] px-2 py-3 text-center">
                                            <span className="line-clamp-2" title={cat}>
                                                {cat}
                                            </span>
                                        </th>
                                    ))}
                                    <th className="min-w-[72px] bg-muted px-2 py-3 text-center text-foreground">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {rows.map((r) => (
                                    <tr key={r.warehouse.id}>
                                        <td className="sticky left-0 z-[1] bg-card px-3 py-2 font-bold text-foreground shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)] dark:shadow-[2px_0_6px_-2px_rgba(0,0,0,0.25)]">
                                            {r.warehouse.name}
                                        </td>
                                        {r.cells.map((units, i) => (
                                            <td
                                                key={`${r.warehouse.id}-${columnCategories[i]}`}
                                                className="px-1 py-1 text-center font-mono text-xs font-semibold text-foreground"
                                                style={cellBackground(units, maxCell, isDark)}
                                                title={`${r.warehouse.name} · ${columnCategories[i]}: ${units} units`}
                                            >
                                                {units}
                                            </td>
                                        ))}
                                        <td className="bg-muted/80 px-2 py-2 text-center font-mono text-xs font-semibold text-foreground">
                                            {r.rowTotal}
                                        </td>
                                    </tr>
                                ))}
                                <tr className="border-t-2 border-border bg-muted/80 font-semibold">
                                    <td className="sticky left-0 z-[1] bg-muted/80 px-3 py-2 text-foreground">Total</td>
                                    {columnTotals.map((t, i) => (
                                        <td key={`col-total-${i}`} className="px-2 py-2 text-center font-mono text-xs">
                                            {t}
                                        </td>
                                    ))}
                                    <td className="bg-muted px-2 py-2 text-center font-mono text-xs text-indigo-700 dark:text-indigo-400">
                                        {grandTotal}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    </>
                )}
                {categoriesTruncated && (
                    <p className="text-xs text-muted-foreground">
                        Showing top {MAX_CATEGORY_COLUMNS} categories by total units. Refine products or categories for
                        more detail.
                    </p>
                )}
            </div>
        </Modal>
    );
};

export default WarehouseHeatmapModal;
