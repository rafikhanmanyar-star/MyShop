import { useEffect, useRef, useState } from 'react';

type Props = {
    open: boolean;
    initialLat?: number | null;
    initialLng?: number | null;
    onClose: () => void;
    onConfirm: (lat: number, lng: number) => void;
};

function loadLeaflet(): Promise<void> {
    if (typeof document === 'undefined') return Promise.reject(new Error('No document'));

    const w = window as unknown as { L?: unknown };
    if (w.L) return Promise.resolve();

    const cssId = 'leaflet-css-myshop';
    if (!document.getElementById(cssId)) {
        const link = document.createElement('link');
        link.id = cssId;
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-myshop-leaflet]');
    if (existing) {
        return new Promise((resolve, reject) => {
            if ((window as unknown as { L?: unknown }).L) {
                resolve();
                return;
            }
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error('Leaflet failed to load')));
        });
    }

    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        s.async = true;
        s.setAttribute('data-myshop-leaflet', '1');
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Leaflet failed to load'));
        document.body.appendChild(s);
    });
}

/**
 * Map pin picker using OpenStreetMap tiles (no API key). Loads Leaflet from CDN when opened.
 */
export default function OsmMapPickerModal({ open, initialLat, initialLng, onClose, onConfirm }: Props) {
    const mapEl = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<{ remove: () => void } | null>(null);
    const [latLng, setLatLng] = useState<{ lat: number; lng: number } | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoadError(null);

        (async () => {
            try {
                await loadLeaflet();
                if (cancelled || !mapEl.current) return;

                // Leaflet is loaded from CDN; typings not bundled in the app.
                const L = (window as unknown as { L: any }).L;
                const IconProto = L.Icon.Default.prototype as { _getIconUrl?: string };
                delete IconProto._getIconUrl;
                L.Icon.Default.mergeOptions({
                    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
                    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
                });

                const defLat = initialLat ?? 24.8607;
                const defLng = initialLng ?? 67.0011;

                const map = L.map(mapEl.current).setView([defLat, defLng], 15);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                    maxZoom: 19,
                }).addTo(map);

                const marker = L.marker([defLat, defLng], { draggable: true }).addTo(map);
                setLatLng({ lat: defLat, lng: defLng });

                marker.on('dragend', () => {
                    const ll = marker.getLatLng();
                    setLatLng({ lat: ll.lat, lng: ll.lng });
                });
                map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
                    const { lat, lng } = e.latlng;
                    marker.setLatLng([lat, lng]);
                    map.panTo([lat, lng]);
                    setLatLng({ lat, lng });
                });

                mapInstanceRef.current = map;
                requestAnimationFrame(() => {
                    if (!cancelled) map.invalidateSize();
                });
                setTimeout(() => {
                    if (!cancelled) map.invalidateSize();
                }, 300);
            } catch (e: unknown) {
                if (!cancelled) {
                    setLoadError(e instanceof Error ? e.message : 'Could not load map');
                }
            }
        })();

        return () => {
            cancelled = true;
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, [open, initialLat, initialLng]);

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
            aria-labelledby="osm-map-picker-title"
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
                    <h2 id="osm-map-picker-title" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                        Pin your delivery location
                    </h2>
                    <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted, #6b7280)' }}>
                        Drag the marker or tap the map. Street address can still be edited below.
                    </p>
                </div>
                {loadError ? (
                    <div style={{ padding: 24, color: '#b91c1c', fontSize: 14 }}>{loadError}</div>
                ) : (
                    <div ref={mapEl} style={{ width: '100%', height: 280, zIndex: 0 }} />
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
