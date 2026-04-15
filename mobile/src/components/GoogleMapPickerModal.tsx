import { useEffect, useRef, useState } from 'react';

type Props = {
    apiKey: string;
    open: boolean;
    initialLat?: number | null;
    initialLng?: number | null;
    onClose: () => void;
    onConfirm: (lat: number, lng: number) => void;
};

function loadGoogleMapsScript(apiKey: string): Promise<void> {
    if (typeof document === 'undefined') return Promise.reject(new Error('No document'));
    const existing = document.querySelector<HTMLScriptElement>('script[data-myshop-gmaps]');
    if (existing && (window as unknown as { google?: unknown }).google) {
        return Promise.resolve();
    }
    if (existing && !(window as unknown as { google?: unknown }).google) {
        return new Promise((resolve, reject) => {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error('Google Maps failed to load')));
        });
    }
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
        s.async = true;
        s.defer = true;
        s.setAttribute('data-myshop-gmaps', '1');
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Google Maps failed to load'));
        document.head.appendChild(s);
    });
}

/**
 * Minimal map: tap/drag marker to set delivery coordinates. Requires VITE_GOOGLE_MAPS_API_KEY.
 */
export default function GoogleMapPickerModal({
    apiKey,
    open,
    initialLat,
    initialLng,
    onClose,
    onConfirm,
}: Props) {
    const mapEl = useRef<HTMLDivElement>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const markerRef = useRef<google.maps.Marker | null>(null);
    const [latLng, setLatLng] = useState<{ lat: number; lng: number } | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoadError(null);
        (async () => {
            try {
                await loadGoogleMapsScript(apiKey);
                if (cancelled || !mapEl.current) return;
                const g = (window as unknown as { google: typeof google }).google;
                const defLat = initialLat ?? 24.8607;
                const defLng = initialLng ?? 67.0011;
                const start = { lat: defLat, lng: defLng };
                const map = new g.maps.Map(mapEl.current, {
                    center: start,
                    zoom: 15,
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: false,
                });
                mapRef.current = map;
                const marker = new g.maps.Marker({
                    position: start,
                    map,
                    draggable: true,
                });
                markerRef.current = marker;
                setLatLng({ lat: start.lat, lng: start.lng });
                marker.addListener('dragend', () => {
                    const p = marker.getPosition();
                    if (p) setLatLng({ lat: p.lat(), lng: p.lng() });
                });
                map.addListener('click', (e: google.maps.MapMouseEvent) => {
                    if (!e.latLng) return;
                    marker.setPosition(e.latLng);
                    map.panTo(e.latLng);
                    setLatLng({ lat: e.latLng.lat(), lng: e.latLng.lng() });
                });
            } catch (e: unknown) {
                setLoadError(e instanceof Error ? e.message : 'Could not load map');
            }
        })();
        return () => {
            cancelled = true;
            mapRef.current = null;
            markerRef.current = null;
        };
    }, [open, apiKey, initialLat, initialLng]);

    if (!open) return null;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                background: 'rgba(0,0,0,0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="map-picker-title"
        >
            <div
                style={{
                    background: 'var(--bg, #fff)',
                    borderRadius: 'var(--radius-lg, 12px)',
                    maxWidth: 480,
                    width: '100%',
                    overflow: 'hidden',
                    border: '1px solid var(--border-light, #e5e7eb)',
                }}
            >
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light, #e5e7eb)' }}>
                    <h2 id="map-picker-title" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                        Pin your delivery location
                    </h2>
                    <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted, #6b7280)' }}>
                        Drag the marker or tap the map. Street address can still be edited below.
                    </p>
                </div>
                {loadError ? (
                    <div style={{ padding: 24, color: '#b91c1c', fontSize: 14 }}>{loadError}</div>
                ) : (
                    <div ref={mapEl} style={{ width: '100%', height: 280 }} />
                )}
                <div style={{ display: 'flex', gap: 8, padding: 12, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!latLng || !!loadError}
                        onClick={() => {
                            if (latLng) {
                                onConfirm(latLng.lat, latLng.lng);
                                onClose();
                            }
                        }}
                    >
                        Use this location
                    </button>
                </div>
            </div>
        </div>
    );
}
