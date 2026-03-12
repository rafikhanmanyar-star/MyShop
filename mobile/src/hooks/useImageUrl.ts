import { useState, useEffect, useRef } from 'react';
import { getImageBlob } from '../services/imageCache';
import { getFullImageUrl } from '../api';

/**
 * Returns a URL suitable for <img src>. Uses full remote URL immediately so
 * images show without waiting for cache. If a cached blob is available, swaps
 * to blob URL for offline support. Revokes object URLs on unmount.
 */
export function useImageUrl(path: string | undefined): string | undefined {
    // Set initial URL from path so <img> has a valid src on first paint (no undefined)
    const [url, setUrl] = useState<string | undefined>(() =>
        path ? getFullImageUrl(path) : undefined
    );
    const objectUrlRef = useRef<string | null>(null);

    useEffect(() => {
        if (!path) {
            setUrl(undefined);
            return;
        }
        // Show remote URL immediately so images load right away
        setUrl(getFullImageUrl(path));

        let cancelled = false;
        getImageBlob(path).then((blob) => {
            if (cancelled) return;
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
                objectUrlRef.current = null;
            }
            if (blob) {
                const objUrl = URL.createObjectURL(blob);
                objectUrlRef.current = objUrl;
                setUrl(objUrl);
            }
            // else: keep current url (already set to full remote URL above)
        }).catch(() => {
            // keep current url (full remote URL)
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
