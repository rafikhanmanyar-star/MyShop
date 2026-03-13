import { useState, useEffect } from 'react';
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
    style?: React.CSSProperties;
    loading?: 'lazy' | 'eager';
    /** When true, show placeholder icon on load error instead of broken image. */
    fallbackToPlaceholder?: boolean;
}

/** Renders an img that uses local cached blob when available, so images load offline. */
export default function CachedImage({ path, alt, className, style, loading, fallbackToPlaceholder = true }: CachedImageProps) {
    const src = useImageUrl(path);
    const [error, setError] = useState(false);

    useEffect(() => {
        setError(false);
    }, [path]);

    if (!path || !src) return fallbackToPlaceholder ? <PlaceholderIcon /> : null;
    if (fallbackToPlaceholder && error) return <PlaceholderIcon />;

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
