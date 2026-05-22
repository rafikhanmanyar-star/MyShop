import React from 'react';
import { motion } from 'framer-motion';
import { CURRENCY, ICONS } from '../../../../../constants';
import type { UseFormWatch } from 'react-hook-form';
import type { SkuFormSchema } from '../schema';
import type { InventoryItem } from '../../../../../types/inventory';
import { grossMarginPercent, stockHealth } from '../utils';

interface Props {
    watch: UseFormWatch<SkuFormSchema>;
    imagePreview: string | null;
    editingItem: InventoryItem | null;
    categoryLabel: string;
    onSaveDraft: () => void;
    onSaveAndNew?: () => void;
    onSaveContinue?: () => void;
    onArchive?: () => void;
    isEditing: boolean;
}

function MobilePreview({
    name,
    price,
    description,
    imagePreview,
    available
}: {
    name: string;
    price: number;
    description: string;
    imagePreview: string | null;
    available: boolean;
}) {
    return (
        <div className="mx-auto w-[200px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
            <div className="bg-slate-900 px-3 py-1.5 text-center text-[10px] font-medium text-white">
                Mobile preview
            </div>
            <div className="aspect-square bg-gradient-to-b from-slate-50 to-slate-100">
                {imagePreview ? (
                    <img src={imagePreview} alt="" className="h-full w-full object-contain p-2" />
                ) : (
                    <div className="flex h-full items-center justify-center text-slate-300">
                        {React.cloneElement(ICONS.package as React.ReactElement, { size: 36 })}
                    </div>
                )}
            </div>
            <div className="p-3">
                <p className="line-clamp-2 text-sm font-semibold text-slate-900">{name || 'Product name'}</p>
                <p className="mt-1 text-base font-bold text-violet-700">
                    {CURRENCY} {price.toFixed(2)}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                    {description || 'No description'}
                </p>
                <span
                    className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        available
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-600'
                    }`}
                >
                    {available ? 'In stock' : 'Unavailable'}
                </span>
            </div>
        </div>
    );
}

export function SummarySidebar({
    watch,
    imagePreview,
    editingItem,
    categoryLabel,
    onSaveDraft,
    onSaveAndNew,
    onSaveContinue,
    onArchive,
    isEditing
}: Props) {
    const name = watch('name');
    const sku = watch('sku');
    const retailPrice = watch('retailPrice');
    const costPrice = watch('costPrice');
    const reorderPoint = watch('reorderPoint');
    const salesDeactivated = watch('salesDeactivated');
    const mobileDescription = watch('mobileDescription');

    const margin = grossMarginPercent(retailPrice, costPrice);
    const available = editingItem?.available ?? 0;
    const health = stockHealth(available, reorderPoint);

    return (
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <motion.div
                layout
                className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"
            >
                <h3 className="text-sm font-semibold text-slate-900">Summary</h3>
                <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">SKU</dt>
                        <dd className="font-mono font-medium text-slate-800">{sku || '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">Retail</dt>
                        <dd className="font-semibold text-slate-900">
                            {CURRENCY} {retailPrice.toFixed(2)}
                        </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">Margin</dt>
                        <dd
                            className={`font-semibold ${
                                margin !== null && margin < 5
                                    ? 'text-rose-600'
                                    : margin !== null && margin >= 15
                                      ? 'text-emerald-600'
                                      : 'text-amber-600'
                            }`}
                        >
                            {margin !== null ? `${margin.toFixed(1)}%` : '—'}
                        </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">Stock</dt>
                        <dd className="capitalize font-medium text-slate-800">{health}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">Category</dt>
                        <dd className="truncate text-right font-medium text-slate-800">{categoryLabel}</dd>
                    </div>
                </dl>
            </motion.div>

            <MobilePreview
                name={name}
                price={retailPrice}
                description={mobileDescription}
                imagePreview={imagePreview}
                available={!salesDeactivated}
            />

            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Quick actions
                </h3>
                <div className="mt-2 flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={onSaveDraft}
                        className="rounded-xl border border-slate-200 bg-white py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                        Save draft
                    </button>
                    {!isEditing && onSaveAndNew ? (
                        <button
                            type="button"
                            onClick={onSaveAndNew}
                            className="rounded-xl border border-violet-200 bg-violet-50 py-2 text-sm font-medium text-violet-800 hover:bg-violet-100"
                        >
                            Save & new
                        </button>
                    ) : null}
                    {isEditing && onSaveContinue ? (
                        <button
                            type="button"
                            onClick={onSaveContinue}
                            className="rounded-xl border border-slate-200 bg-white py-2 text-sm font-medium text-slate-700"
                        >
                            Save & continue editing
                        </button>
                    ) : null}
                    {isEditing && onArchive ? (
                        <button
                            type="button"
                            onClick={onArchive}
                            className="rounded-xl py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
                        >
                            Archive SKU
                        </button>
                    ) : null}
                </div>
            </div>
        </aside>
    );
}
