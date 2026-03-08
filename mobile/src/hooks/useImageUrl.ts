import { useState, useEffect, useRef } from 'react';
import { getImageBlob } from '../services/imageCache';
import { getFullImageUrl } from '../api';

/**
 * Returns a URL suitable for <img src>: uses local cached blob if available,
 * otherwise the remote URL. Revokes object URLs on unmount.
 */
export function useImageUrl(path: string | undefined): string | undefined {
    const [url, setUrl] = useState<string | undefined>(undefined);
    const objectUrlRef = useRef<string | null>(null);

    useEffect(() => {
        if (!path) {
            setUrl(undefined);
            return;
        }
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
            } else {
                setUrl(getFullImageUrl(path));
            }
        }).catch(() => {
            if (!cancelled) setUrl(getFullImageUrl(path));
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
