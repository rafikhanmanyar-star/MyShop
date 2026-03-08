import { useImageUrl } from '../hooks/useImageUrl';

interface CachedImageProps {
    path: string | undefined;
    alt: string;
    className?: string;
    style?: React.CSSProperties;
    loading?: 'lazy' | 'eager';
}

/** Renders an img that uses local cached blob when available, so images load offline. */
export default function CachedImage({ path, alt, className, style, loading }: CachedImageProps) {
    const src = useImageUrl(path);
    if (!path) return null;
    return <img src={src} alt={alt} className={className} style={style} loading={loading} />;
}
