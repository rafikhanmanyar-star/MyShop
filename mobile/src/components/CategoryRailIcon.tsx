import { useState, useEffect } from 'react';
import { getFullImageUrl } from '../api';

/** Renders the mobile home / browse category chip image, or a package emoji fallback. */
export default function CategoryRailIcon({ mobile_icon_url }: { mobile_icon_url?: string | null }) {
    const [failed, setFailed] = useState(false);
    const raw = mobile_icon_url && String(mobile_icon_url).trim() ? String(mobile_icon_url).trim() : '';

    useEffect(() => {
        setFailed(false);
    }, [raw]);

    const src = raw && !failed ? getFullImageUrl(raw) : undefined;

    if (!src) {
        return (
            <span className="category-nav-item__icon category-nav-item__icon--emoji" aria-hidden>
                📦
            </span>
        );
    }

    return (
        <span className="category-nav-item__icon category-nav-item__icon--img" aria-hidden>
            <img
                src={src}
                alt=""
                className="category-nav-item__icon-img"
                loading="lazy"
                decoding="async"
                onError={() => setFailed(true)}
            />
        </span>
    );
}
