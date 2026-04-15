import React, { useEffect, useState } from 'react';
import { useImageUrl } from '../../hooks/useImageUrl';

interface CachedImageProps {
  path: string | undefined;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  /** When set, shown in the image area if there is no path or the image fails to load (404, etc.). */
  fallbackLabel?: string;
  /** Extra classes for the fallback label (e.g. smaller text in dense POS grid). */
  fallbackClassName?: string;
}

/** Renders an img that uses local cached blob when available, so product images load offline in POS. */
export default function CachedImage({
  path,
  alt,
  className,
  style,
  fallbackLabel,
  fallbackClassName,
}: CachedImageProps) {
  const src = useImageUrl(path);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoadError(false);
  }, [path]);

  const showFallback = Boolean(fallbackLabel) && (!path || loadError);
  const showImg = Boolean(path) && !loadError && src !== undefined;

  if (showFallback) {
    return (
      <div
        className={`flex h-full w-full min-h-0 min-w-0 items-center justify-center bg-slate-100/90 p-1 text-center dark:bg-slate-700/80 ${fallbackClassName ?? ''}`}
        style={style}
        role="img"
        aria-label={alt}
      >
        <span className="line-clamp-4 max-h-full w-full break-words text-center text-[10px] font-semibold leading-tight text-slate-600 dark:text-slate-200 sm:text-xs">
          {fallbackLabel}
        </span>
      </div>
    );
  }

  if (!path) {
    return null;
  }

  if (!showImg) {
    return <div className={`h-full w-full min-h-0 ${className ?? ''}`} style={style} aria-hidden />;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      onError={() => setLoadError(true)}
    />
  );
}
