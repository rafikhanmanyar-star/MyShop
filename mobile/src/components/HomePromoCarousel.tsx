import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { HomePromoSlide } from '../context/AppContext';
import CachedImage from './CachedImage';
import { isExternalHref, resolveHomePromoHref } from '../utils/homePromoLinks';
import { homePromoSlidesKey, slideImageUrl } from '../utils/homePromoSlides';

type Props = {
    slides: HomePromoSlide[];
    shopSlug: string;
    deliveryMinutes: number;
    /** Seconds between slides (from POS branding, 3–30) */
    intervalSeconds?: number;
    /** Shorter hero for high-density home layout */
    compact?: boolean;
};

const SWIPE_THRESHOLD_PX = 48;

function clampIntervalSec(sec: number | undefined): number {
    const n = Number(sec);
    if (!Number.isFinite(n)) return 5;
    return Math.min(30, Math.max(3, Math.round(n)));
}

function wrapSlideContent(child: ReactNode, href: string | null) {
    if (!href) {
        return <div className="home-promo-carousel__link home-promo-carousel__link--static">{child}</div>;
    }
    if (isExternalHref(href)) {
        return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="home-promo-carousel__link">
                {child}
            </a>
        );
    }
    const path = href.startsWith('/') ? href : `/${href}`;
    return (
        <Link to={path} className="home-promo-carousel__link">
            {child}
        </Link>
    );
}

export default function HomePromoCarousel({ slides, shopSlug, deliveryMinutes, intervalSeconds, compact }: Props) {
    const rootClass = compact ? 'home-promo-carousel home-promo-carousel--compact' : 'home-promo-carousel';
    const fallbackClass = compact ? 'home-promo-fallback home-promo-fallback--compact' : 'home-promo-fallback';
    const valid = useMemo(() => slides.filter((s) => slideImageUrl(s)), [slides]);
    const slidesKey = useMemo(() => homePromoSlidesKey(valid), [valid]);
    const [idx, setIdx] = useState(0);
    const [dragPx, setDragPx] = useState(0);
    const touchRef = useRef<{ startX: number; startY: number; swiping: boolean } | null>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const [viewportWidth, setViewportWidth] = useState(0);
    const [viewportHeight, setViewportHeight] = useState<number | undefined>(undefined);
    const autoplayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const intervalMs = clampIntervalSec(intervalSeconds) * 1000;

    const goTo = useCallback(
        (next: number) => {
            if (valid.length === 0) return;
            setIdx(((next % valid.length) + valid.length) % valid.length);
            setDragPx(0);
        },
        [valid.length],
    );

    const goDelta = useCallback(
        (delta: number) => {
            setIdx((i) => (i + delta + valid.length) % valid.length);
            setDragPx(0);
        },
        [valid.length],
    );

    const clearAutoplay = useCallback(() => {
        if (autoplayTimerRef.current != null) {
            clearTimeout(autoplayTimerRef.current);
            autoplayTimerRef.current = null;
        }
    }, []);

    const scheduleAutoplay = useCallback(() => {
        clearAutoplay();
        if (valid.length <= 1) return;
        if (typeof document !== 'undefined' && document.hidden) return;
        autoplayTimerRef.current = setTimeout(() => {
            setIdx((i) => (i + 1) % valid.length);
            scheduleAutoplay();
        }, intervalMs);
    }, [clearAutoplay, intervalMs, valid.length]);

    const syncViewportHeight = useCallback(() => {
        if (!compact) return;
        const viewport = viewportRef.current;
        if (!viewport) return;
        const activeImg = viewport.querySelector<HTMLImageElement>(
            '.home-promo-carousel__slide--active .home-promo-carousel__img',
        );
        if (!activeImg) return;
        const h = activeImg.getBoundingClientRect().height;
        if (h > 0) setViewportHeight(Math.ceil(h));
    }, [compact]);

    useEffect(() => {
        setIdx(0);
        setDragPx(0);
        setViewportHeight(undefined);
    }, [slidesKey]);

    useEffect(() => {
        const el = viewportRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const measure = () => {
            setViewportWidth(el.clientWidth);
            syncViewportHeight();
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [slidesKey, syncViewportHeight]);

    useEffect(() => {
        syncViewportHeight();
    }, [idx, syncViewportHeight]);

    useEffect(() => {
        scheduleAutoplay();
        return clearAutoplay;
    }, [slidesKey, intervalMs, scheduleAutoplay, clearAutoplay]);

    useEffect(() => {
        const onVisibility = () => {
            if (document.hidden) clearAutoplay();
            else scheduleAutoplay();
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, [clearAutoplay, scheduleAutoplay]);

    const onTouchStart = (e: React.TouchEvent) => {
        const t = e.targetTouches[0];
        if (!t) return;
        touchRef.current = { startX: t.clientX, startY: t.clientY, swiping: false };
        clearAutoplay();
    };

    const onTouchMove = (e: React.TouchEvent) => {
        const touch = touchRef.current;
        const t = e.targetTouches[0];
        if (!touch || !t || valid.length <= 1) return;
        const dx = t.clientX - touch.startX;
        const dy = t.clientY - touch.startY;
        if (!touch.swiping && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
            touch.swiping = true;
        }
        if (touch.swiping) {
            e.preventDefault();
            setDragPx(dx);
        }
    };

    const onTouchEnd = (e: React.TouchEvent) => {
        const touch = touchRef.current;
        touchRef.current = null;
        const t = e.changedTouches[0];
        if (!touch || !t) {
            scheduleAutoplay();
            return;
        }
        const dx = t.clientX - touch.startX;
        if (touch.swiping || Math.abs(dx) > SWIPE_THRESHOLD_PX) {
            if (dx < -SWIPE_THRESHOLD_PX) goDelta(1);
            else if (dx > SWIPE_THRESHOLD_PX) goDelta(-1);
            else setDragPx(0);
        } else {
            setDragPx(0);
        }
        scheduleAutoplay();
    };

    if (valid.length > 0) {
        const slideOffsetPx = viewportWidth > 0 ? idx * viewportWidth : 0;
        const trackStyle: React.CSSProperties = {
            transform:
                viewportWidth > 0
                    ? `translateX(calc(-${slideOffsetPx}px + ${dragPx}px))`
                    : `translateX(calc(-${idx * 100}% + ${dragPx}px))`,
            transition: dragPx !== 0 ? 'none' : 'transform 0.35s ease',
        };

        return (
            <div className={rootClass}>
                <div
                    ref={viewportRef}
                    className="home-promo-carousel__viewport"
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                    style={{
                        touchAction: valid.length > 1 ? 'pan-y pinch-zoom' : undefined,
                        ...(compact && viewportHeight != null ? { height: viewportHeight } : undefined),
                    }}
                >
                    <div className="home-promo-carousel__track" style={trackStyle}>
                        {valid.map((slide, i) => {
                            const imagePath = slideImageUrl(slide);
                            const href = resolveHomePromoHref(shopSlug, slide);
                            const inner = (
                                <CachedImage
                                    path={imagePath}
                                    alt={slide.title?.trim() || 'Promotion'}
                                    className="home-promo-carousel__img"
                                    loading={i === 0 ? 'eager' : 'lazy'}
                                    preferCache
                                    fallbackToPlaceholder={false}
                                    onLoad={i === idx ? syncViewportHeight : undefined}
                                />
                            );
                            return (
                                <div
                                    key={`${slidesKey}-${i}`}
                                    className={`home-promo-carousel__slide${i === idx ? ' home-promo-carousel__slide--active' : ''}`}
                                >
                                    {wrapSlideContent(inner, href)}
                                </div>
                            );
                        })}
                    </div>
                </div>
                {valid.length > 1 ? (
                    <div className="home-promo-carousel__dots">
                        {valid.map((_, i) => (
                            <button
                                key={i}
                                type="button"
                                className={`home-promo-carousel__dot ${i === idx ? 'home-promo-carousel__dot--active' : ''}`}
                                aria-label={`Promotion ${i + 1} of ${valid.length}`}
                                aria-current={i === idx ? 'true' : undefined}
                                onClick={() => {
                                    goTo(i);
                                    scheduleAutoplay();
                                }}
                            />
                        ))}
                    </div>
                ) : null}
            </div>
        );
    }

    const mins = deliveryMinutes > 0 ? deliveryMinutes : 30;

    return (
        <Link to={`/${shopSlug}/products`} className={fallbackClass}>
            <div className="home-promo-fallback__text">
                <p className="home-promo-fallback__eyebrow">Quick Delivery</p>
                <h2 className="home-promo-fallback__title">{mins} MIN DELIVERY</h2>
                <p className="home-promo-fallback__sub">At your doorstep</p>
                <span className="home-promo-fallback__cta">
                    Shop Now
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                        <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </span>
            </div>
            <div className="home-promo-fallback__art" aria-hidden>
                <span className="home-promo-fallback__emoji">🛵</span>
            </div>
        </Link>
    );
}
