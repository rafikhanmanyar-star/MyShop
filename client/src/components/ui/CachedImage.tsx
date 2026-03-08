import React from 'react';
import { useImageUrl } from '../../hooks/useImageUrl';

interface CachedImageProps {
  path: string | undefined;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
}

/** Renders an img that uses local cached blob when available, so product images load offline in POS. */
export default function CachedImage({ path, alt, className, style }: CachedImageProps) {
  const src = useImageUrl(path);
  if (!path) return null;
  return <img src={src} alt={alt} className={className} style={style} />;
}
