import React from 'react';
import { motion } from 'framer-motion';
import CachedImage from '../../../../ui/CachedImage';
import Button from '../../../../ui/Button';
import { ICONS } from '../../../../../constants';
import type { InventoryItem } from '../../../../../types/inventory';

interface Props {
    search: string;
    onSearchChange: (v: string) => void;
    results: InventoryItem[];
    onSelect: (item: InventoryItem) => void;
    onBack: () => void;
    onAddNew: () => void;
}

export function SearchScreen({
    search,
    onSearchChange,
    results,
    onSelect,
    onBack,
    onAddNew
}: Props) {
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-400">
                    {React.cloneElement(ICONS.search as React.ReactElement, { size: 20 })}
                </div>
                <input
                    type="text"
                    autoFocus
                    placeholder="Search by SKU, name, or barcode…"
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 py-3 pl-12 pr-4 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                />
            </div>
            <div className="max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-inner">
                {results.length === 0 ? (
                    <div className="p-10 text-center text-sm text-slate-500">No SKUs found.</div>
                ) : (
                    results.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onSelect(item)}
                            className="flex w-full items-center gap-4 border-b border-slate-100 p-4 text-left transition-colors last:border-0 hover:bg-violet-50/50"
                        >
                            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                                {item.imageUrl ? (
                                    <CachedImage path={item.imageUrl} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    <div className="flex h-full items-center justify-center text-slate-400">
                                        {React.cloneElement(ICONS.package as React.ReactElement, { size: 22 })}
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="truncate font-semibold text-slate-900">{item.name}</div>
                                <div className="text-xs text-slate-500">
                                    {item.sku}
                                    {item.barcode ? ` · ${item.barcode}` : ' · No barcode'}
                                </div>
                            </div>
                            {!item.barcode && (
                                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                    Add barcode
                                </span>
                            )}
                            {React.cloneElement(ICONS.chevronRight as React.ReactElement, {
                                size: 18,
                                className: 'shrink-0 text-slate-400'
                            })}
                        </button>
                    ))
                )}
            </div>
            <div className="flex justify-between gap-2">
                <Button variant="secondary" onClick={onBack}>
                    Back
                </Button>
                <Button variant="secondary" onClick={onAddNew}>
                    Add new SKU instead
                </Button>
            </div>
        </motion.div>
    );
}
