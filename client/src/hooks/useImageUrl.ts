import { useState, useEffect, useRef } from 'react';
import { getImageBlob } from '../services/imageCache';
import { getFullImageUrl } from '../config/apiUrl';

/**
 * Returns a URL for <img src>: uses local cached blob if available,
 * otherwise the remote URL. Revokes object URLs on unmount.
 */
function pathForCache(path: string): string {
  if (path.startsWith('http')) {
    try { return new URL(path).pathname; } catch { return path; }
  }
  return path.startsWith('/') ? path : `/${path}`;
}

export function useImageUrl(path: string | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!path) {
      setUrl(undefined);
      return;
    }
    let cancelled = false;
    const cacheKey = pathForCache(path);
    getImageBlob(cacheKey).then((blob) => {
      if (cancelled) return;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      if (blob) {
        const objUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objUrl;
        setUrl(objUrl);
      } else {
        setUrl(path.startsWith('http') ? path : getFullImageUrl(path));
      }
    }).catch(() => {
      if (!cancelled) setUrl(path.startsWith('http') ? path : getFullImageUrl(path));
    });
    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [path]);

  return url;
}
