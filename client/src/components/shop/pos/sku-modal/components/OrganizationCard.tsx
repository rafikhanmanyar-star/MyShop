import React, { useMemo } from 'react';
import type { UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { SkuCard, SkuLabel } from './SkuCard';
import SkuSearchableCombo from '../SkuSearchableCombo';
import type { SkuFormSchema } from '../schema';
import type { ShopBrand, ShopProductCategory } from '../../../../../services/shopApi';
import type { SkuComboOption } from '../types';
import { UNIT_OPTIONS } from '../utils';

interface Props {
    watch: UseFormWatch<SkuFormSchema>;
    setValue: UseFormSetValue<SkuFormSchema>;
    shopCategories: ShopProductCategory[];
    shopBrands: ShopBrand[];
    brandCreating: boolean;
    onBrandChange: (value: string) => void;
    onSelectBrand: (b: ShopBrand) => void;
    onCreateBrand: () => void;
    brandExactMatch: ShopBrand | undefined;
}

export function OrganizationCard({
    watch,
    setValue,
    shopCategories,
    shopBrands,
    brandCreating,
    onBrandChange,
    onSelectBrand,
    onCreateBrand,
    brandExactMatch
}: Props) {
    const category = watch('category');
    const subcategoryId = watch('subcategoryId');
    const brand = watch('brand');
    const brandId = watch('brandId');
    const unit = watch('unit');
    const tags = watch('tags');
    const collection = watch('collection');

    const rootCategories = useMemo(
        () =>
            [...shopCategories.filter((c) => !c.parent_id)].sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
            ),
        [shopCategories]
    );

    const subcategoriesForParent = useMemo(() => {
        if (category === 'General') return [];
        return [...shopCategories.filter((c) => c.parent_id === category)].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        );
    }, [shopCategories, category]);

    const mainCategoryComboOptions: SkuComboOption[] = useMemo(
        () => [
            { value: 'General', label: 'General (uncategorized)' },
            ...rootCategories.map((c) => ({ value: c.id, label: c.name }))
        ],
        [rootCategories]
    );

    const subCategoryComboOptions: SkuComboOption[] = useMemo(() => {
        if (subcategoriesForParent.length === 0) return [];
        return [
            { value: '', label: 'Main category only' },
            ...subcategoriesForParent.map((c) => ({ value: c.id, label: c.name }))
        ];
    }, [subcategoriesForParent]);

    const subcategorySelectDisabled =
        category === 'General' || subcategoriesForParent.length === 0;

    const subcategoryDisabledDisplay =
        category === 'General'
            ? 'Select a main category first…'
            : subcategoriesForParent.length === 0
              ? '— No subcategories'
              : '';

    const brandSuggestions = useMemo(() => {
        const q = brand.trim().toLowerCase();
        const list = [...shopBrands].sort((a, b) => a.name.localeCompare(b.name));
        if (!q) return list.slice(0, 12);
        return list.filter((b) => b.name.toLowerCase().includes(q)).slice(0, 15);
    }, [brand, shopBrands]);

    const unitInPreset = UNIT_OPTIONS.some((o) => o.value === unit);

    const addTag = (raw: string) => {
        const t = raw.trim();
        if (!t || tags.includes(t)) return;
        setValue('tags', [...tags, t], { shouldDirty: true });
    };

    return (
        <SkuCard id="section-organization" title="Organization" subtitle="Categories, brand, and catalog grouping">
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <SkuLabel htmlFor="sku-main-category">Category</SkuLabel>
                        <SkuSearchableCombo
                            id="sku-main-category"
                            value={category}
                            options={mainCategoryComboOptions}
                            searchPlaceholder="Search categories…"
                            onValueChange={(next) => {
                                setValue('category', next, { shouldDirty: true });
                                setValue('subcategoryId', '', { shouldDirty: true });
                            }}
                        />
                    </div>
                    <div>
                        <SkuLabel htmlFor="sku-subcategory">Subcategory</SkuLabel>
                        <SkuSearchableCombo
                            id="sku-subcategory"
                            disabled={subcategorySelectDisabled}
                            disabledDisplay={subcategoryDisabledDisplay}
                            value={subcategoryId}
                            options={subCategoryComboOptions}
                            searchPlaceholder="Search subcategories…"
                            onValueChange={(next) => setValue('subcategoryId', next, { shouldDirty: true })}
                        />
                    </div>
                </div>

                <div>
                    <SkuLabel>Brand</SkuLabel>
                    <input
                        type="text"
                        autoComplete="off"
                        placeholder="Search or type brand name…"
                        value={brand}
                        onChange={(e) => onBrandChange(e.target.value)}
                        className="block w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                    />
                    {brandId ? (
                        <span className="mt-1 block text-xs font-medium text-violet-600">Linked to brand list</span>
                    ) : null}
                    {brand.trim() && !brandExactMatch && !brandId ? (
                        <button
                            type="button"
                            disabled={brandCreating}
                            onClick={onCreateBrand}
                            className="mt-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
                        >
                            {brandCreating ? 'Adding…' : `Add “${brand.trim()}” as new brand`}
                        </button>
                    ) : null}
                    {brandSuggestions.length > 0 ? (
                        <div className="mt-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                            {brandSuggestions.map((b) => (
                                <button
                                    key={b.id}
                                    type="button"
                                    onClick={() => onSelectBrand(b)}
                                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                                        brandId === b.id
                                            ? 'border-violet-300 bg-violet-100 text-violet-900'
                                            : 'border-slate-200 bg-white text-slate-700 hover:border-violet-200'
                                    }`}
                                >
                                    {b.name}
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>

                <div>
                    <SkuLabel htmlFor="sku-tags">Tags</SkuLabel>
                    <input
                        id="sku-tags"
                        type="text"
                        placeholder="Type and press Enter"
                        className="block w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                addTag((e.target as HTMLInputElement).value);
                                (e.target as HTMLInputElement).value = '';
                            }
                        }}
                    />
                    {tags.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {tags.map((t) => (
                                <span
                                    key={t}
                                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                                >
                                    {t}
                                    <button
                                        type="button"
                                        className="text-slate-400 hover:text-rose-600"
                                        onClick={() =>
                                            setValue(
                                                'tags',
                                                tags.filter((x) => x !== t),
                                                { shouldDirty: true }
                                            )
                                        }
                                    >
                                        ×
                                    </button>
                                </span>
                            ))}
                        </div>
                    ) : null}
                </div>

                <div>
                    <SkuLabel htmlFor="sku-collection">Collection</SkuLabel>
                    <input
                        id="sku-collection"
                        type="text"
                        value={collection}
                        onChange={(e) => setValue('collection', e.target.value, { shouldDirty: true })}
                        placeholder="e.g. Summer 2026 (display only)"
                        className="block w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm"
                    />
                </div>

                <div>
                    <SkuLabel htmlFor="sku-unit">Unit of measure</SkuLabel>
                    <select
                        id="sku-unit"
                        className="block w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm"
                        value={unitInPreset ? unit : '__custom__'}
                        onChange={(e) => {
                            const v = e.target.value;
                            if (v === '__custom__') setValue('unit', '', { shouldDirty: true });
                            else setValue('unit', v, { shouldDirty: true });
                        }}
                    >
                        {UNIT_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                        <option value="__custom__">Custom…</option>
                    </select>
                    {!unitInPreset ? (
                        <input
                            value={unit}
                            onChange={(e) => setValue('unit', e.target.value, { shouldDirty: true })}
                            placeholder="e.g. case (12)"
                            className="mt-2 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                    ) : null}
                </div>
            </div>
        </SkuCard>
    );
}
