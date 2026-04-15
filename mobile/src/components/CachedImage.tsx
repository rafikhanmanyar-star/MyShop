import { useState, useEffect, type CSSProperties } from 'react';
import { useImageUrl } from '../hooks/useImageUrl';

const PlaceholderIcon = ({ size = 40 }: { size?: number }) => (
    <svg className="placeholder-icon" xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
);

interface CachedImageProps {
    path: string | undefined;
    alt: string;
    className?: string;
    style?: CSSProperties;
    loading?: 'lazy' | 'eager';
    /** When true, show placeholder on load error (ignored if fallbackLabel is set). */
    fallbackToPlaceholder?: boolean;
    /** Shown when there is no image path or loading fails — usually the product name. */
    fallbackLabel?: string;
    /** Extra classes for the fallback label block (e.g. hero size on product detail). */
    fallbackClassName?: string;
}

/** Renders an img that uses local cached blob when available, so images load offline. */
export default function CachedImage({
    path,
    alt,
    className,
    style,
    loading,
    fallbackToPlaceholder = true,
    fallbackLabel,
    fallbackClassName,
}: CachedImageProps) {
    const src = useImageUrl(path);
    const [error, setError] = useState(false);

    useEffect(() => {
        setError(false);
    }, [path]);

    const useNameFallback = Boolean(fallbackLabel?.trim());
    const showFallback = useNameFallback && (!path || !src || error);
    const showIconFallback = !useNameFallback && fallbackToPlaceholder && (!path || !src || error);

    if (showFallback) {
        return (
            <div
                className={`image-fallback-label flex h-full w-full min-h-0 min-w-0 items-center justify-center p-2 text-center ${fallbackClassName ?? ''}`}
                style={style}
                role="img"
                aria-label={alt}
            >
                <span className="image-fallback-label__text max-h-full w-full break-words">{fallbackLabel}</span>
            </div>
        );
    }

    if (showIconFallback) {
        return <PlaceholderIcon />;
    }

    if (!path || !src) {
        return null;
    }

    return (
        <img
            src={src}
            alt={alt}
            className={className}
            style={style}
            loading={loading}
            onError={() => setError(true)}
        />
    );
}

export { PlaceholderIcon };
