import React from 'react';
import type { UseFormRegister, FieldErrors, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { SkuCard, SkuLabel } from './SkuCard';
import type { SkuFormSchema } from '../schema';
import { ICONS } from '../../../../../constants';
import { generateSkuCode } from '../utils';

interface Props {
    register: UseFormRegister<SkuFormSchema>;
    errors: FieldErrors<SkuFormSchema>;
    watch: UseFormWatch<SkuFormSchema>;
    setValue: UseFormSetValue<SkuFormSchema>;
    isEditing: boolean;
    imagePreview: string | null;
    onImageSelect: (file: File) => void;
    onImageClear?: () => void;
    skuConflict?: boolean;
    barcodeConflict?: boolean;
    nameConflict?: boolean;
}

export function ProductInfoCard({
    register,
    errors,
    watch,
    setValue,
    isEditing,
    imagePreview,
    onImageSelect,
    onImageClear,
    skuConflict,
    barcodeConflict,
    nameConflict
}: Props) {
    const name = watch('name');
    const description = watch('description');
    const mobileDescription = watch('mobileDescription');

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file?.type.startsWith('image/')) onImageSelect(file);
    };

    return (
        <SkuCard id="section-basic" title="Product Information" subtitle="Identity, codes, and descriptions">
            <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
                <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    className="group relative"
                >
                    <div className="aspect-square overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-violet-50/30 transition-colors group-hover:border-violet-300">
                        {imagePreview ? (
                            <img src={imagePreview} alt="" className="h-full w-full object-contain p-2" />
                        ) : (
                            <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
                                {React.cloneElement(ICONS.image as React.ReactElement, { size: 32 })}
                                <span className="text-xs font-medium">Drop image here</span>
                            </div>
                        )}
                    </div>
                    <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp,image/*"
                        className="hidden"
                        id="sku-product-image"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) onImageSelect(f);
                        }}
                    />
                    <label
                        htmlFor="sku-product-image"
                        className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                        {React.cloneElement(ICONS.upload as React.ReactElement, { size: 16 })}
                        Upload image
                    </label>
                    {imagePreview && onImageClear ? (
                        <button
                            type="button"
                            onClick={onImageClear}
                            className="mt-1 w-full text-xs text-rose-600 hover:text-rose-700"
                        >
                            Remove image
                        </button>
                    ) : null}
                    <p className="mt-2 text-center text-[11px] text-slate-400">1024×1024 · PNG/JPG · max 2MB</p>
                </div>

                <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <SkuLabel htmlFor="sku-code">
                                SKU code
                                {!isEditing ? (
                                    <button
                                        type="button"
                                        className="ml-2 text-xs font-medium normal-case text-violet-600 hover:text-violet-800"
                                        onClick={() => setValue('sku', generateSkuCode(name), { shouldDirty: true })}
                                    >
                                        Auto-generate
                                    </button>
                                ) : null}
                            </SkuLabel>
                            <input
                                id="sku-code"
                                {...register('sku')}
                                readOnly={isEditing}
                                placeholder="e.g. BEV-7UP-1500ML"
                                className={`block w-full rounded-xl border py-2.5 px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 ${
                                    skuConflict
                                        ? 'border-rose-300'
                                        : 'border-slate-200 focus:border-violet-500'
                                } ${isEditing ? 'cursor-not-allowed bg-slate-50' : 'bg-white'}`}
                            />
                            {skuConflict ? (
                                <p className="mt-1 text-xs text-rose-600">SKU already in use</p>
                            ) : null}
                        </div>
                        <div>
                            <SkuLabel htmlFor="sku-barcode">Barcode</SkuLabel>
                            <div className="relative">
                                <input
                                    id="sku-barcode"
                                    {...register('barcode')}
                                    placeholder="Scan or enter"
                                    className={`block w-full rounded-xl border py-2.5 px-3 pr-10 text-sm ${
                                        barcodeConflict ? 'border-rose-300' : 'border-slate-200'
                                    }`}
                                />
                                {barcodeConflict ? (
                                    <p className="mt-1 text-xs text-rose-600">Barcode already in use</p>
                                ) : null}
                                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
                                    {React.cloneElement(ICONS.search as React.ReactElement, { size: 16 })}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div>
                        <SkuLabel htmlFor="sku-name">Product name</SkuLabel>
                        <input
                            id="sku-name"
                            {...register('name')}
                            placeholder="e.g. 7up 1.5 litre"
                            className={`block w-full rounded-xl border py-2.5 px-3 text-sm ${
                                errors.name || nameConflict ? 'border-rose-300' : 'border-slate-200'
                            }`}
                        />
                        {(errors.name?.message || nameConflict) && (
                            <p className="mt-1 text-xs text-rose-600">
                                {errors.name?.message || 'Name already in use'}
                            </p>
                        )}
                    </div>

                    <div>
                        <div className="mb-1 flex items-center justify-between">
                            <SkuLabel htmlFor="sku-description">Description</SkuLabel>
                            <span className="text-xs text-slate-400">{description.length}/500</span>
                        </div>
                        <textarea
                            id="sku-description"
                            {...register('description')}
                            maxLength={500}
                            rows={2}
                            placeholder="Internal notes (optional)"
                            className="block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                        />
                    </div>

                    <div>
                        <div className="mb-1 flex items-center justify-between">
                            <SkuLabel htmlFor="sku-mobile-desc">Mobile app description</SkuLabel>
                            <button
                                type="button"
                                disabled
                                title="Coming soon"
                                className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 opacity-60"
                            >
                                AI Generate
                            </button>
                        </div>
                        <textarea
                            id="sku-mobile-desc"
                            {...register('mobileDescription')}
                            maxLength={500}
                            rows={3}
                            placeholder="Shown to customers in the mobile shop"
                            className="block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                        />
                        <span className="mt-1 block text-xs text-slate-400">
                            {mobileDescription.length}/500 characters
                        </span>
                    </div>
                </div>
            </div>
        </SkuCard>
    );
}
