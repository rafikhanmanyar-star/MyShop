import React, { useRef, useState } from 'react';
import { shopApi, type HomePromoLinkType, type HomePromoSlide } from '../../services/shopApi';
import { getFullImageUrl } from '../../config/apiUrl';
import {
    HOME_PROMO_MAX_SLIDES,
    HOME_PROMO_INTERVAL_MAX_SEC,
    HOME_PROMO_INTERVAL_MIN_SEC,
    HOME_PROMO_LINK_TYPE_OPTIONS,
    clampHomePromoIntervalSeconds,
} from '../../utils/homePromoLinks';
import Input from '../ui/Input';
import Button from '../ui/Button';

export type HomePromoAdsValue = {
    home_promo_slides?: HomePromoSlide[];
    home_promo_interval_seconds?: number;
};

type Props = {
    value: HomePromoAdsValue;
    onChange: (patch: Partial<HomePromoAdsValue>) => void;
    /** Match Settings → Mobile branding panel (default) or legacy Card layout */
    variant?: 'panel' | 'card';
};

const fieldClass =
    'w-full rounded-xl border border-slate-200 bg-[#F4F4F9] px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-[#004494] focus:ring-2 focus:ring-[#004494]/20 dark:border-slate-600 dark:bg-slate-800/80';

export default function HomePromoAdsEditor({ value, onChange, variant = 'panel' }: Props) {
    const slides: HomePromoSlide[] = value.home_promo_slides ?? [];
    const intervalSec = clampHomePromoIntervalSeconds(value.home_promo_interval_seconds);
    const [promoUploading, setPromoUploading] = useState(false);
    const promoFileRef = useRef<HTMLInputElement>(null);
    const promoPickIndexRef = useRef(0);

    const updateSlide = (index: number, patch: Partial<HomePromoSlide>) => {
        const cur = slides;
        const next = [...cur];
        next[index] = {
            ...(next[index] || { image_url: '', link_type: 'none' as HomePromoLinkType, link_url: null, title: null }),
            ...patch,
        };
        onChange({ home_promo_slides: next });
    };

    const removeSlide = (index: number) => {
        onChange({ home_promo_slides: slides.filter((_, i) => i !== index) });
    };

    const addSlideRow = () => {
        if (slides.length >= HOME_PROMO_MAX_SLIDES) return;
        onChange({
            home_promo_slides: [
                ...slides,
                { image_url: '', link_type: 'none', link_url: null, title: null },
            ],
        });
    };

    const pickPromoImage = (index: number) => {
        promoPickIndexRef.current = index;
        promoFileRef.current?.click();
    };

    const handlePromoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const index = promoPickIndexRef.current;
        try {
            setPromoUploading(true);
            const res = await shopApi.uploadImage(file);
            updateSlide(index, { image_url: res.imageUrl });
        } catch (error) {
            console.error('Promo upload failed', error);
            alert('Failed to upload advertisement image.');
        } finally {
            setPromoUploading(false);
        }
    };

    const wrapClass =
        variant === 'card'
            ? 'p-6'
            : 'rounded-xl border border-slate-200/90 bg-card p-3.5 sm:p-4 shadow-sm dark:border-slate-600 dark:bg-slate-900/90';

    const isPanel = variant === 'panel';

    return (
        <div className={wrapClass}>
            <h3 className={`font-bold text-foreground tracking-tight ${isPanel ? 'text-sm mb-0.5' : 'text-lg mb-2'}`}>
                Home promotional ads
            </h3>
            <p className={`text-muted-foreground ${isPanel ? 'text-xs mb-2.5 leading-snug' : 'text-sm mb-4'}`}>
                Rotating carousel on the mobile home page (replaces Quick Delivery + Recipe ideas). Upload up to{' '}
                {HOME_PROMO_MAX_SLIDES} images — delivery, voice order, offers, recipes, budgets, and more.
            </p>

            <div className={isPanel ? 'mb-3 max-w-[11rem]' : 'mb-6 max-w-xs'}>
                <label htmlFor="home-promo-interval" className="block text-sm font-medium text-foreground mb-1.5">
                    Seconds per slide
                </label>
                <input
                    id="home-promo-interval"
                    type="number"
                    min={HOME_PROMO_INTERVAL_MIN_SEC}
                    max={HOME_PROMO_INTERVAL_MAX_SEC}
                    className={fieldClass}
                    value={intervalSec}
                    onChange={(e) =>
                        onChange({ home_promo_interval_seconds: clampHomePromoIntervalSeconds(e.target.value) })
                    }
                />
                <p className="text-xs text-muted-foreground mt-1">
                    {HOME_PROMO_INTERVAL_MIN_SEC}–{HOME_PROMO_INTERVAL_MAX_SEC} seconds between ads
                </p>
            </div>

            <input
                type="file"
                ref={promoFileRef}
                onChange={handlePromoUpload}
                className="hidden"
                accept="image/*"
                aria-label="Upload promotional ad image"
            />

            <div className={isPanel ? 'space-y-2.5' : 'space-y-4'}>
                {slides.length === 0 ? (
                    <p className={`text-muted-foreground italic ${isPanel ? 'text-xs' : 'text-sm'}`}>
                        No ads yet — add one to replace the default delivery banner on the mobile home page.
                    </p>
                ) : (
                    slides.map((slide, idx) => {
                        const linkType = (slide.link_type || 'none') as HomePromoLinkType;
                        const linkHint = HOME_PROMO_LINK_TYPE_OPTIONS.find((o) => o.value === linkType)?.hint;
                        return (
                            <div
                                key={idx}
                                className={`flex flex-col sm:flex-row border border-slate-200/80 bg-[#F4F4F9]/80 dark:border-slate-600 dark:bg-slate-800/50 ${
                                    isPanel
                                        ? 'gap-2.5 p-2.5 rounded-lg'
                                        : 'gap-4 p-4 rounded-2xl'
                                }`}
                            >
                                <div
                                    className={`w-full aspect-[16/9] rounded-lg bg-card border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center dark:border-slate-600 ${
                                        isPanel ? 'sm:w-28' : 'sm:w-36 rounded-xl'
                                    }`}
                                >
                                    {slide.image_url ? (
                                        <img
                                            src={getFullImageUrl(slide.image_url)}
                                            alt=""
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <span className="text-xs text-muted-foreground px-2 text-center">No image</span>
                                    )}
                                </div>
                                <div className="flex-1 space-y-3 min-w-0">
                                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                        Ad {idx + 1}
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {variant === 'card' ? (
                                            <>
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="sm"
                                                    disabled={promoUploading}
                                                    onClick={() => pickPromoImage(idx)}
                                                >
                                                    {promoUploading ? 'Uploading…' : slide.image_url ? 'Replace image' : 'Upload image'}
                                                </Button>
                                                <Button type="button" variant="outline" size="sm" onClick={() => removeSlide(idx)}>
                                                    Remove
                                                </Button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    type="button"
                                                    disabled={promoUploading}
                                                    onClick={() => pickPromoImage(idx)}
                                                    className="rounded-xl border-2 border-[#004494] bg-card px-4 py-2 text-sm font-semibold text-[#004494] hover:bg-[#004494]/5 disabled:opacity-50"
                                                >
                                                    {promoUploading ? 'Uploading…' : slide.image_url ? 'Replace image' : 'Upload image'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => removeSlide(idx)}
                                                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-slate-100 dark:border-slate-600"
                                                >
                                                    Remove
                                                </button>
                                            </>
                                        )}
                                    </div>
                                    {variant === 'card' ? (
                                        <>
                                            <Input
                                                label="Label (optional)"
                                                placeholder="e.g. Recipe ideas"
                                                value={slide.title || ''}
                                                onChange={(e) => updateSlide(idx, { title: e.target.value.trim() || null })}
                                            />
                                            <Input
                                                label="Image URL (optional)"
                                                placeholder="/uploads/..."
                                                value={slide.image_url || ''}
                                                onChange={(e) => updateSlide(idx, { image_url: e.target.value })}
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <div>
                                                <label className="block text-sm font-medium text-foreground mb-1.5">
                                                    Label (optional)
                                                </label>
                                                <input
                                                    className={fieldClass}
                                                    placeholder="e.g. Recipe ideas"
                                                    value={slide.title || ''}
                                                    onChange={(e) => updateSlide(idx, { title: e.target.value.trim() || null })}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-foreground mb-1.5">
                                                    Image URL (optional)
                                                </label>
                                                <input
                                                    className={fieldClass}
                                                    placeholder="/uploads/..."
                                                    value={slide.image_url || ''}
                                                    onChange={(e) => updateSlide(idx, { image_url: e.target.value })}
                                                />
                                            </div>
                                        </>
                                    )}
                                    <div>
                                        <label
                                            htmlFor={`home-promo-link-type-${idx}`}
                                            className="block text-sm font-medium text-foreground mb-1.5"
                                        >
                                            When customer taps
                                        </label>
                                        <select
                                            id={`home-promo-link-type-${idx}`}
                                            className={fieldClass}
                                            value={linkType}
                                            onChange={(e) => {
                                                const v = e.target.value as HomePromoLinkType;
                                                updateSlide(idx, {
                                                    link_type: v,
                                                    link_url: v === 'custom' ? slide.link_url ?? '' : null,
                                                });
                                            }}
                                        >
                                            {HOME_PROMO_LINK_TYPE_OPTIONS.map((o) => (
                                                <option key={o.value} value={o.value}>
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                        {linkHint ? <p className="text-xs text-muted-foreground mt-1">{linkHint}</p> : null}
                                    </div>
                                    {linkType === 'custom' ? (
                                        variant === 'card' ? (
                                            <Input
                                                label="Custom URL"
                                                placeholder="https://example.com or /your-shop/products"
                                                value={slide.link_url || ''}
                                                onChange={(e) =>
                                                    updateSlide(idx, { link_url: e.target.value.trim() || null })
                                                }
                                            />
                                        ) : (
                                            <div>
                                                <label className="block text-sm font-medium text-foreground mb-1.5">
                                                    Custom URL
                                                </label>
                                                <input
                                                    className={fieldClass}
                                                    placeholder="https://example.com or /your-shop/products"
                                                    value={slide.link_url || ''}
                                                    onChange={(e) =>
                                                        updateSlide(idx, { link_url: e.target.value.trim() || null })
                                                    }
                                                />
                                            </div>
                                        )
                                    ) : null}
                                </div>
                            </div>
                        );
                    })
                )}
                {variant === 'card' ? (
                    <Button type="button" variant="outline" onClick={addSlideRow} disabled={slides.length >= HOME_PROMO_MAX_SLIDES}>
                        Add ad ({slides.length}/{HOME_PROMO_MAX_SLIDES})
                    </Button>
                ) : (
                    <button
                        type="button"
                        onClick={addSlideRow}
                        disabled={slides.length >= HOME_PROMO_MAX_SLIDES}
                        className="w-full sm:w-auto rounded-xl border-2 border-dashed border-[#004494]/40 px-5 py-2.5 text-sm font-semibold text-[#004494] hover:bg-[#004494]/5 disabled:opacity-50"
                    >
                        + Add ad ({slides.length}/{HOME_PROMO_MAX_SLIDES})
                    </button>
                )}
            </div>
        </div>
    );
}
