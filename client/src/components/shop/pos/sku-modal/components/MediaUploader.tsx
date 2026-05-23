import React from 'react';
import { SkuCard } from './SkuCard';
import { ICONS } from '../../../../../constants';

interface Props {
    imagePreview: string | null;
    onImageSelect: (file: File) => void;
}

export function MediaUploader({ imagePreview, onImageSelect }: Props) {
    return (
        <SkuCard id="section-media" title="Media" subtitle="Product gallery and attachments">
            <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file?.type.startsWith('image/')) onImageSelect(file);
                }}
                className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center transition-colors hover:border-violet-300"
            >
                {imagePreview ? (
                    <img
                        src={imagePreview}
                        alt=""
                        className="mx-auto max-h-40 rounded-xl object-contain"
                    />
                ) : (
                    <div className="text-slate-400">
                        {React.cloneElement(ICONS.image as React.ReactElement, { size: 40 })}
                        <p className="mt-2 text-sm font-medium">Drag images here</p>
                    </div>
                )}
                <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    id="sku-media-gallery"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onImageSelect(f);
                    }}
                />
                <label
                    htmlFor="sku-media-gallery"
                    className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
                >
                    {React.cloneElement(ICONS.upload as React.ReactElement, { size: 16 })}
                    Add media
                </label>
                <p className="mt-3 text-xs text-slate-400">
                    Video and PDF attachments — coming soon. Primary image syncs to catalog.
                </p>
            </div>
        </SkuCard>
    );
}
