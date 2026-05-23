import React from 'react';
import type { UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { SkuCard, SkuLabel, SkuToggle } from './SkuCard';
import type { SkuFormSchema } from '../schema';
import type { InventoryItem } from '../../../../../types/inventory';
import { stockHealth } from '../utils';

interface Props {
    watch: UseFormWatch<SkuFormSchema>;
    setValue: UseFormSetValue<SkuFormSchema>;
    editingItem: InventoryItem | null;
}

const healthStyles = {
    healthy: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    low: 'bg-amber-100 text-amber-900 border-amber-200',
    out: 'bg-rose-100 text-rose-800 border-rose-200'
};

const healthLabels = { healthy: 'Healthy', low: 'Low stock', out: 'Out of stock' };

export function InventoryCard({ watch, setValue, editingItem }: Props) {
    const salesDeactivated = watch('salesDeactivated');
    const trackInventory = watch('trackInventory');
    const reorderPoint = watch('reorderPoint');

    const available = editingItem?.available ?? editingItem?.onHand ?? 0;
    const reserved = editingItem?.reserved ?? 0;
    const incoming = editingItem?.inTransit ?? 0;
    const health = stockHealth(available, reorderPoint);

    return (
        <SkuCard id="section-inventory" title="Inventory" subtitle="Availability, stock levels, and reorder">
            <div className="space-y-4">
                <SkuToggle
                    checked={!salesDeactivated}
                    onChange={(v) => setValue('salesDeactivated', !v, { shouldDirty: true })}
                    label="Available for sale"
                    description="When off, SKU is hidden from POS and mobile shop"
                />
                <SkuToggle
                    checked={trackInventory}
                    onChange={(v) => setValue('trackInventory', v, { shouldDirty: true })}
                    label="Track inventory"
                    description="Monitor stock levels and reorder alerts"
                />

                <div className="flex items-center gap-2">
                    <span
                        className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${healthStyles[health]}`}
                    >
                        {healthLabels[health]}
                    </span>
                    {health === 'low' ? (
                        <span className="text-xs text-amber-800">At or below reorder point</span>
                    ) : null}
                </div>

                <div>
                    <SkuLabel>Reorder point</SkuLabel>
                    <input
                        type="number"
                        min={0}
                        value={reorderPoint}
                        onChange={(e) =>
                            setValue('reorderPoint', Math.max(0, Number(e.target.value) || 0), {
                                shouldDirty: true
                            })
                        }
                        className="block w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm"
                    />
                </div>

                {editingItem ? (
                    <div className="grid grid-cols-3 gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                        <div>
                            <p className="text-xs font-semibold uppercase text-slate-500">On hand</p>
                            <p className="text-lg font-bold text-slate-900">{editingItem.onHand}</p>
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase text-slate-500">Reserved</p>
                            <p className="text-lg font-bold text-slate-900">{reserved}</p>
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase text-slate-500">Incoming</p>
                            <p className="text-lg font-bold text-slate-900">{incoming}</p>
                        </div>
                        <p className="col-span-3 text-xs text-slate-500">
                            Adjust quantities in Stock Master or procurement.
                        </p>
                    </div>
                ) : (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                        Stock starts at 0 for new SKUs. Receive inventory via purchase bills.
                    </p>
                )}
            </div>
        </SkuCard>
    );
}
