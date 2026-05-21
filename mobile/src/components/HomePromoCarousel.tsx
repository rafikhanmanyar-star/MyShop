import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getFullImageUrl } from '../api';
import type { HomePromoSlide } from '../context/AppContext';
import { isExternalHref, resolveHomePromoHref } from '../utils/homePromoLinks';

type Props = {
    slides: HomePromoSlide[];
    shopSlug: string;
    deliveryMinutes: number;
    /** Seconds between slides (from POS branding, 3–30) */
    intervalSeconds?: number;
};

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

export default function HomePromoCarousel({ slides, shopSlug, deliveryMinutes, intervalSeconds }: Props) {
    const valid = useMemo(() => slides.filter((s) => String(s.image_url || '').trim()), [slides]);
    const [idx, setIdx] = useState(0);
    const touchStartX = useRef<number | null>(null);
    const intervalMs = clampIntervalSec(intervalSeconds) * 1000;

    useEffect(() => {
        setIdx(0);
    }, [slides]);

    useEffect(() => {
        if (valid.length <= 1) return;
        const t = window.setInterval(() => setIdx((i) => (i + 1) % valid.length), intervalMs);
        return () => window.clearInterval(t);
    }, [valid.length, intervalMs]);

    const goDelta = (delta: number) => {
        if (valid.length === 0) return;
        setIdx((i) => (i + delta + valid.length) % valid.length);
    };

    if (valid.length > 0) {
        const slide = valid[idx];
        const imgSrc = getFullImageUrl(slide.image_url);
        const href = resolveHomePromoHref(shopSlug, slide);
        const inner = (
            <img
                src={imgSrc}
                alt={slide.title?.trim() || 'Promotion'}
                className="home-promo-carousel__img"
                decoding="async"
                loading={idx === 0 ? 'eager' : 'lazy'}
            />
        );

        return (
            <div
                className="home-promo-carousel"
                onTouchStart={(e) => {
                    touchStartX.current = e.targetTouches[0]?.clientX ?? null;
                }}
                onTouchEnd={(e) => {
                    const start = touchStartX.current;
                    touchStartX.current = null;
                    const end = e.changedTouches[0]?.clientX;
                    if (start == null || end == null) return;
                    const dx = end - start;
                    if (Math.abs(dx) > 48) goDelta(dx < 0 ? 1 : -1);
                }}
            >
                <div className="home-promo-carousel__viewport">{wrapSlideContent(inner, href)}</div>
                {valid.length > 1 ? (
                    <div className="home-promo-carousel__dots">
                        {valid.map((_, i) => (
                            <button
                                key={i}
                                type="button"
                                className={`home-promo-carousel__dot ${i === idx ? 'home-promo-carousel__dot--active' : ''}`}
                                aria-label={`Promotion ${i + 1} of ${valid.length}`}
                                aria-current={i === idx ? 'true' : undefined}
                                onClick={() => setIdx(i)}
                            />
                        ))}
                    </div>
                ) : null}
            </div>
        );
    }

    const mins = deliveryMinutes > 0 ? deliveryMinutes : 30;

    return (
        <Link to={`/${shopSlug}/products`} className="home-promo-fallback">
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
