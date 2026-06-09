import { useState, useEffect, useRef } from 'react';
import { getImageBlob } from '../services/imageCache';
import { getFullImageUrl } from '../api';

export type UseImageUrlOptions = {
    /** When true, use IndexedDB blob first (no network) — for prefetched promo slides. */
    preferCache?: boolean;
};

/**
 * Returns a URL suitable for <img src>. By default uses full remote URL immediately,
 * then swaps to a cached blob when available. With preferCache, blob is tried first.
 */
export function useImageUrl(path: string | undefined, options?: UseImageUrlOptions): string | undefined {
    const preferCache = options?.preferCache ?? false;
    const [url, setUrl] = useState<string | undefined>(() =>
        path && !preferCache ? getFullImageUrl(path) : undefined,
    );
    const objectUrlRef = useRef<string | null>(null);

    useEffect(() => {
        if (!path) {
            setUrl(undefined);
            return;
        }

        let cancelled = false;

        const applyBlob = (blob: Blob) => {
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
                objectUrlRef.current = null;
            }
            const objUrl = URL.createObjectURL(blob);
            objectUrlRef.current = objUrl;
            setUrl(objUrl);
        };

        if (preferCache) {
            getImageBlob(path)
                .then((blob) => {
                    if (cancelled) return;
                    if (blob) {
                        applyBlob(blob);
                        return;
                    }
                    setUrl(getFullImageUrl(path));
                })
                .catch(() => {
                    if (!cancelled) setUrl(getFullImageUrl(path));
                });
        } else {
            setUrl(getFullImageUrl(path));
            getImageBlob(path)
                .then((blob) => {
                    if (cancelled || !blob) return;
                    applyBlob(blob);
                })
                .catch(() => {});
        }

        return () => {
            cancelled = true;
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
                objectUrlRef.current = null;
            }
        };
    }, [path, preferCache]);

    return url;
}
