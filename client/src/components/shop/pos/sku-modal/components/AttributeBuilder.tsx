import React from 'react';
import type { UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { SkuCard, SkuLabel } from './SkuCard';
import type { SkuFormSchema } from '../schema';
import { WEIGHT_UNIT_PRESETS } from '../utils';

interface Props {
    watch: UseFormWatch<SkuFormSchema>;
    setValue: UseFormSetValue<SkuFormSchema>;
}

export function AttributeBuilder({ watch, setValue }: Props) {
    const rows = watch('customAttrRows');
    const size = watch('size');
    const color = watch('color');
    const material = watch('material');
    const weight = watch('weight');
    const weightUnit = watch('weightUnit');
    const originCountry = watch('originCountry');

    return (
        <SkuCard id="section-attributes" title="Variants & Attributes" subtitle="Size, color, weight, and custom fields">
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <SkuLabel>Size</SkuLabel>
                        <input
                            value={size}
                            onChange={(e) => setValue('size', e.target.value, { shouldDirty: true })}
                            placeholder="e.g. 500ml, Large"
                            className="block w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm"
                        />
                    </div>
                    <div>
                        <SkuLabel>Color</SkuLabel>
                        <input
                            value={color}
                            onChange={(e) => setValue('color', e.target.value, { shouldDirty: true })}
                            className="block w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm"
                        />
                    </div>
                    <div>
                        <SkuLabel>Material</SkuLabel>
                        <input
                            value={material}
                            onChange={(e) => setValue('material', e.target.value, { shouldDirty: true })}
                            className="block w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm"
                        />
                    </div>
                    <div>
                        <SkuLabel>Country of origin</SkuLabel>
                        <input
                            value={originCountry}
                            onChange={(e) => setValue('originCountry', e.target.value, { shouldDirty: true })}
                            placeholder="e.g. Pakistan"
                            className="block w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm"
                        />
                    </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <SkuLabel>Weight</SkuLabel>
                        <input
                            value={weight}
                            onChange={(e) => setValue('weight', e.target.value, { shouldDirty: true })}
                            placeholder="e.g. 500"
                            className="block w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm"
                        />
                    </div>
                    <div>
                        <SkuLabel>Weight unit</SkuLabel>
                        <select
                            value={weightUnit}
                            onChange={(e) => setValue('weightUnit', e.target.value, { shouldDirty: true })}
                            className="block w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm"
                        >
                            {WEIGHT_UNIT_PRESETS.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="border-t border-slate-100 pt-4">
                    <p className="mb-3 text-xs text-slate-500">Custom key-value attributes</p>
                    {rows.map((row, idx) => (
                        <div key={idx} className="mb-2 flex flex-wrap items-end gap-2">
                            <input
                                value={row.key}
                                onChange={(e) => {
                                    const next = [...rows];
                                    next[idx] = { ...row, key: e.target.value };
                                    setValue('customAttrRows', next, { shouldDirty: true });
                                }}
                                placeholder="Key"
                                className="min-w-[100px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            />
                            <input
                                value={row.value}
                                onChange={(e) => {
                                    const next = [...rows];
                                    next[idx] = { ...row, value: e.target.value };
                                    setValue('customAttrRows', next, { shouldDirty: true });
                                }}
                                placeholder="Value"
                                className="min-w-[100px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            />
                            <button
                                type="button"
                                className="text-xs font-semibold text-rose-600"
                                onClick={() =>
                                    setValue(
                                        'customAttrRows',
                                        rows.filter((_, i) => i !== idx),
                                        { shouldDirty: true }
                                    )
                                }
                            >
                                Remove
                            </button>
                        </div>
                    ))}
                    <button
                        type="button"
                        className="text-sm font-semibold text-violet-700 hover:text-violet-900"
                        onClick={() =>
                            setValue('customAttrRows', [...rows, { key: '', value: '' }], {
                                shouldDirty: true
                            })
                        }
                    >
                        + Add attribute
                    </button>
                </div>
            </div>
        </SkuCard>
    );
}
