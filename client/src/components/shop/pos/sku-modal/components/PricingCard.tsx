import React from 'react';
import type { UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { motion } from 'framer-motion';
import { SkuCard, SkuLabel } from './SkuCard';
import type { SkuFormSchema } from '../schema';
import { CURRENCY } from '../../../../../constants';
import { grossMarginPercent, parseNonNegativeNumber, profitPerItem } from '../utils';

interface Props {
    watch: UseFormWatch<SkuFormSchema>;
    setValue: UseFormSetValue<SkuFormSchema>;
}

export function PricingCard({ watch, setValue }: Props) {
    const costPrice = watch('costPrice');
    const retailPrice = watch('retailPrice');
    const wholesalePrice = watch('wholesalePrice');
    const taxRate = watch('taxRate');
    const retailPriceMode = watch('retailPriceMode');
    const retailMarkupPercent = watch('retailMarkupPercent');

    const margin = grossMarginPercent(retailPrice, costPrice);
    const profit = profitPerItem(retailPrice, costPrice);
    const marginHealthy = margin !== null && margin >= 15;
    const marginLow = margin !== null && margin < 5 && retailPrice > 0;

    return (
        <SkuCard id="section-pricing" title="Pricing" subtitle="Cost, retail, tax, and margin">
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                        <SkuLabel>Cost price ({CURRENCY})</SkuLabel>
                        <input
                            type="number"
                            min={0}
                            step="any"
                            value={costPrice}
                            onChange={(e) => {
                                const cost = parseNonNegativeNumber(e.target.value);
                                const next: Partial<SkuFormSchema> = { costPrice: cost };
                                if (retailPriceMode === 'percentage') {
                                    next.retailPrice =
                                        Math.round(cost * (1 + retailMarkupPercent / 100) * 100) / 100;
                                }
                                setValue('costPrice', cost, { shouldDirty: true });
                                if (next.retailPrice !== undefined) {
                                    setValue('retailPrice', next.retailPrice, { shouldDirty: true });
                                }
                            }}
                            className="block w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm"
                        />
                    </div>
                    <div>
                        <SkuLabel>Retail price ({CURRENCY})</SkuLabel>
                        <div className="flex gap-2">
                            {retailPriceMode === 'fixed' ? (
                                <input
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={retailPrice}
                                    onChange={(e) =>
                                        setValue('retailPrice', parseNonNegativeNumber(e.target.value), {
                                            shouldDirty: true
                                        })
                                    }
                                    className="block w-full flex-1 rounded-xl border border-slate-200 py-2.5 px-3 text-sm"
                                />
                            ) : (
                                <div className="flex flex-1 items-center gap-2">
                                    <input
                                        type="number"
                                        min={0}
                                        value={retailMarkupPercent}
                                        onChange={(e) => {
                                            const pct = parseNonNegativeNumber(e.target.value);
                                            const retail =
                                                Math.round(costPrice * (1 + pct / 100) * 100) / 100;
                                            setValue('retailMarkupPercent', pct, { shouldDirty: true });
                                            setValue('retailPrice', retail, { shouldDirty: true });
                                        }}
                                        className="w-20 rounded-xl border border-slate-200 py-2.5 px-3 text-sm"
                                    />
                                    <span className="text-sm text-slate-500">% markup</span>
                                    <span className="ml-auto text-sm font-semibold text-slate-800">
                                        = {retailPrice.toFixed(2)}
                                    </span>
                                </div>
                            )}
                        </div>
                        <div
                            className="mt-2 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5"
                            role="group"
                        >
                            <button
                                type="button"
                                onClick={() => setValue('retailPriceMode', 'fixed', { shouldDirty: true })}
                                className={`rounded-md px-3 py-1 text-xs font-semibold ${
                                    retailPriceMode === 'fixed'
                                        ? 'bg-violet-600 text-white'
                                        : 'text-slate-600'
                                }`}
                            >
                                Fixed
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const pct =
                                        costPrice > 0
                                            ? Math.round(((retailPrice - costPrice) / costPrice) * 100)
                                            : 0;
                                    setValue('retailPriceMode', 'percentage', { shouldDirty: true });
                                    setValue('retailMarkupPercent', Math.max(0, pct), { shouldDirty: true });
                                }}
                                className={`rounded-md px-3 py-1 text-xs font-semibold ${
                                    retailPriceMode === 'percentage'
                                        ? 'bg-violet-600 text-white'
                                        : 'text-slate-600'
                                }`}
                            >
                                Markup %
                            </button>
                        </div>
                    </div>
                    <div>
                        <SkuLabel>Wholesale ({CURRENCY})</SkuLabel>
                        <input
                            type="number"
                            min={0}
                            step="any"
                            value={wholesalePrice}
                            onChange={(e) =>
                                setValue('wholesalePrice', parseNonNegativeNumber(e.target.value), {
                                    shouldDirty: true
                                })
                            }
                            className="block w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm"
                        />
                        <p className="mt-1 text-xs text-slate-400">Reference only — not synced to server yet</p>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <SkuLabel>Tax rate (%)</SkuLabel>
                        <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            value={taxRate}
                            onChange={(e) =>
                                setValue('taxRate', parseNonNegativeNumber(e.target.value), {
                                    shouldDirty: true
                                })
                            }
                            className="block w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm"
                        />
                    </div>
                    <motion.div
                        layout
                        className={`flex flex-col justify-center rounded-xl border px-4 py-3 ${
                            marginLow
                                ? 'border-rose-200 bg-rose-50'
                                : marginHealthy
                                  ? 'border-emerald-200 bg-emerald-50'
                                  : 'border-amber-200 bg-amber-50'
                        }`}
                    >
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Margin
                        </span>
                        <span
                            className={`text-2xl font-bold ${
                                marginLow
                                    ? 'text-rose-700'
                                    : marginHealthy
                                      ? 'text-emerald-700'
                                      : 'text-amber-700'
                            }`}
                        >
                            {margin !== null ? `${margin.toFixed(1)}%` : '—'}
                        </span>
                        <p className="mt-1 text-sm text-slate-700">
                            You earn <strong>{CURRENCY} {profit.toFixed(2)}</strong> profit per item
                        </p>
                    </motion.div>
                </div>
            </div>
        </SkuCard>
    );
}
