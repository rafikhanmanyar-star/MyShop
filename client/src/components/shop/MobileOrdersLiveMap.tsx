import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { GoogleMap, Marker, DirectionsRenderer, Polyline, useJsApiLoader } from '@react-google-maps/api';
import { MapPin } from 'lucide-react';
import type { MobileOrder, PosRidersOverview, ShopBranding } from '../../services/mobileOrdersApi';

const mapContainerStyle: CSSProperties = { width: '100%', height: '100%' };
const DEFAULT_CENTER = { lat: 24.8607, lng: 67.0011 };

function parseLatLng(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
    const la = lat != null ? Number(lat) : NaN;
    const ln = lng != null ? Number(lng) : NaN;
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
    return { lat: la, lng: ln };
}

function riderRowStyle(status: string): { label: string; dotClass: string } {
    const u = String(status).toUpperCase();
    if (u === 'BUSY') return { label: 'En route', dotClass: 'bg-emerald-500' };
    if (u === 'AVAILABLE') return { label: 'At store', dotClass: 'bg-amber-500' };
    return { label: 'Offline', dotClass: 'bg-slate-400' };
}

/** Map delivery_status to 0–3 for the three-step progress UI (0 = before pickup, 3 = done). */
function courierProgressIndex(ds: string | null | undefined): number {
    const u = String(ds || '').toUpperCase();
    if (u === 'DELIVERED') return 3;
    if (u === 'ON_THE_WAY') return 2;
    if (u === 'PICKED') return 1;
    return 0;
}

const STEPS = ['Picked up', 'On the way', 'Arriving soon'] as const;

type InnerProps = {
    apiKey: string;
    branding: ShopBranding | null;
    selectedOrder: MobileOrder | null;
    riders: PosRidersOverview['riders'];
};

function MobileOrdersLiveMapInner({ apiKey, branding, selectedOrder, riders }: InnerProps) {
    const { isLoaded, loadError } = useJsApiLoader({
        id: 'pos-mobile-orders-google-maps',
        googleMapsApiKey: apiKey,
        libraries: ['geometry'],
    });

    const [map, setMap] = useState<google.maps.Map | null>(null);
    const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
    const [fallbackLine, setFallbackLine] = useState<google.maps.LatLngLiteral[] | null>(null);
    const [routeMeta, setRouteMeta] = useState<{ etaText: string; distanceText: string } | null>(null);

    const store = useMemo(() => {
        const lat = branding?.lat != null ? Number(branding.lat) : NaN;
        const lng = branding?.lng != null ? Number(branding.lng) : NaN;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return { lat, lng };
    }, [branding?.lat, branding?.lng]);

    const customer = useMemo(
        () =>
            selectedOrder
                ? parseLatLng(selectedOrder.delivery_lat, selectedOrder.delivery_lng)
                : null,
        [selectedOrder?.delivery_lat, selectedOrder?.delivery_lng]
    );

    const orderRider = useMemo(
        () =>
            selectedOrder
                ? parseLatLng(selectedOrder.rider_latitude, selectedOrder.rider_longitude)
                : null,
        [selectedOrder?.rider_latitude, selectedOrder?.rider_longitude]
    );

    const center = useMemo(() => {
        if (customer) return customer;
        if (store) return store;
        return DEFAULT_CENTER;
    }, [customer, store]);

    useEffect(() => {
        if (!isLoaded || loadError) return;
        setDirections(null);
        setFallbackLine(null);
        setRouteMeta(null);

        if (!customer) return;

        const origin = orderRider || store;
        if (!origin) {
            setFallbackLine(null);
            return;
        }

        let cancelled = false;
        const svc = new google.maps.DirectionsService();
        svc.route(
            {
                origin,
                destination: customer,
                travelMode: google.maps.TravelMode.DRIVING,
            },
            (result, status) => {
                if (cancelled) return;
                if (status === google.maps.DirectionsStatus.OK && result?.routes[0]) {
                    setDirections(result);
                    setFallbackLine(null);
                    const leg = result.routes[0].legs[0];
                    setRouteMeta({
                        etaText: leg.duration?.text ?? '—',
                        distanceText: leg.distance?.text ?? '—',
                    });
                } else {
                    setDirections(null);
                    setFallbackLine([origin, customer]);
                    setRouteMeta(null);
                }
            }
        );

        return () => {
            cancelled = true;
        };
    }, [isLoaded, loadError, customer, orderRider, store, selectedOrder?.id]);

    useEffect(() => {
        if (!map || !isLoaded) return;
        const bounds = new google.maps.LatLngBounds();
        let n = 0;
        const extend = (p: { lat: number; lng: number }) => {
            bounds.extend(p);
            n += 1;
        };
        if (store) extend(store);
        if (customer) extend(customer);
        if (orderRider) extend(orderRider);
        riders.forEach((r) => {
            const p = parseLatLng(r.current_latitude, r.current_longitude);
            if (p) extend(p);
        });
        if (n >= 2) {
            map.fitBounds(bounds, 56);
        } else if (n === 1) {
            map.setCenter(bounds.getCenter());
            map.setZoom(14);
        }
    }, [map, isLoaded, store, customer, orderRider, riders]);

    const progressIdx = courierProgressIndex(selectedOrder?.delivery_status);
    const etaDisplay =
        routeMeta?.etaText ||
        (selectedOrder?.status === 'Delivered' ? 'Delivered' : '—');
    const distDisplay =
        selectedOrder?.rider_to_dropoff_km != null && Number.isFinite(selectedOrder.rider_to_dropoff_km)
            ? `${selectedOrder.rider_to_dropoff_km.toFixed(2)} km`
            : routeMeta?.distanceText || '—';

    if (loadError) {
        return (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 bg-rose-950/20 p-6 text-center text-sm text-rose-200">
                <p className="font-semibold">Could not load Google Maps</p>
                <p className="text-xs opacity-90">Check the API key and HTTP referrer restrictions for this POS origin.</p>
            </div>
        );
    }

    if (!isLoaded) {
        return (
            <div className="flex h-full min-h-[280px] items-center justify-center bg-muted/30">
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent dark:border-indigo-400" />
            </div>
        );
    }

    return (
        <div className="relative h-full min-h-[280px] w-full">
            <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={center}
                zoom={13}
                onLoad={setMap}
                options={{
                    streetViewControl: false,
                    mapTypeControl: true,
                    fullscreenControl: true,
                    mapTypeControlOptions: { position: google.maps.ControlPosition.TOP_RIGHT },
                }}
            >
                {store ? (
                    <Marker
                        position={store}
                        title={branding?.company_name || 'Store'}
                        label={{ text: 'S', color: 'white', fontSize: '11px', fontWeight: 'bold' }}
                    />
                ) : null}
                {customer ? (
                    <Marker
                        position={customer}
                        title="Customer"
                        label={{ text: 'D', color: 'white', fontSize: '11px', fontWeight: 'bold' }}
                    />
                ) : null}
                {riders.map((r) => {
                    const p = parseLatLng(r.current_latitude, r.current_longitude);
                    if (!p) return null;
                    const letter = (r.name || '?').trim().slice(0, 1).toUpperCase();
                    return (
                        <Marker
                            key={r.id}
                            position={p}
                            title={r.name}
                            label={{ text: letter, color: 'white', fontSize: '10px', fontWeight: 'bold' }}
                        />
                    );
                })}
                {directions ? (
                    <DirectionsRenderer
                        directions={directions}
                        options={{
                            suppressMarkers: true,
                            preserveViewport: true,
                            polylineOptions: {
                                strokeColor: '#16a34a',
                                strokeOpacity: 0.92,
                                strokeWeight: 5,
                            },
                        }}
                    />
                ) : null}
                {fallbackLine && fallbackLine.length >= 2 ? (
                    <Polyline
                        path={fallbackLine}
                        options={{
                            strokeColor: '#64748b',
                            strokeOpacity: 0.85,
                            strokeWeight: 4,
                            geodesic: true,
                        }}
                    />
                ) : null}
            </GoogleMap>

            {selectedOrder && selectedOrder.payment_method !== 'SelfCollection' ? (
                <div className="pointer-events-none absolute left-3 top-3 z-[1] max-w-[min(100%,20rem)] rounded-xl border border-border/80 bg-card/95 p-3 shadow-lg backdrop-blur-sm dark:bg-slate-900/95 dark:border-slate-600">
                    <p className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">
                        Delivery status
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-foreground break-all">{selectedOrder.order_number}</p>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <span className="text-muted-foreground">ETA</span>
                        <span className="font-semibold tabular-nums text-right">{etaDisplay}</span>
                        <span className="text-muted-foreground">Remaining</span>
                        <span className="font-semibold tabular-nums text-right">{distDisplay}</span>
                    </div>
                    <div className="mt-3 space-y-1.5">
                        <div className="flex h-1.5 overflow-hidden rounded-full bg-muted dark:bg-slate-700">
                            {[0, 1, 2].map((i) => (
                                <div
                                    key={i}
                                    className={`h-full flex-1 border-r border-background last:border-0 ${
                                        progressIdx > i ? 'bg-emerald-500' : 'bg-muted dark:bg-slate-600'
                                    }`}
                                />
                            ))}
                        </div>
                        <div className="flex justify-between gap-1 text-[0.65rem] font-medium text-muted-foreground">
                            {STEPS.map((label, i) => (
                                <span
                                    key={label}
                                    className={
                                        progressIdx > i
                                            ? 'text-emerald-700 dark:text-emerald-400'
                                            : progressIdx === i && selectedOrder.status !== 'Delivered'
                                              ? 'text-foreground font-semibold'
                                              : ''
                                    }
                                >
                                    {label}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}

            <div className="pointer-events-none absolute bottom-3 right-3 z-[1] max-w-[14rem] rounded-xl border border-border/80 bg-card/95 p-2.5 shadow-lg backdrop-blur-sm dark:bg-slate-900/95 dark:border-slate-600">
                <p className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground mb-1.5 px-0.5">
                    Active riders
                </p>
                <ul className="pointer-events-auto max-h-40 space-y-1.5 overflow-y-auto custom-scrollbar text-xs">
                    {riders
                        .filter((r) => r.is_active)
                        .map((r) => {
                            const st = riderRowStyle(r.status);
                            return (
                                <li key={r.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1">
                                    <span className={`h-2 w-2 shrink-0 rounded-full ${st.dotClass}`} />
                                    <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{r.name}</span>
                                    <span className={`shrink-0 ${st.label === 'Offline' ? 'text-slate-500' : 'text-muted-foreground'}`}>
                                        {st.label}
                                    </span>
                                </li>
                            );
                        })}
                    {riders.filter((r) => r.is_active).length === 0 && (
                        <li className="px-1 text-muted-foreground">No active rider accounts</li>
                    )}
                </ul>
            </div>
        </div>
    );
}

export function MobileOrdersLiveMap({
    branding,
    selectedOrder,
    riders,
}: Omit<InnerProps, 'apiKey'>) {
    const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim();
    if (!apiKey) {
        return (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                <MapPin className="h-10 w-10 opacity-35" />
                <p className="font-semibold text-foreground">Live map needs a Maps API key</p>
                <p className="max-w-sm text-xs leading-relaxed">
                    Set <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.7rem]">VITE_GOOGLE_MAPS_API_KEY</code>{' '}
                    in the POS client environment (Maps JavaScript API + Directions), then rebuild.
                </p>
            </div>
        );
    }
    return <MobileOrdersLiveMapInner apiKey={apiKey} branding={branding} selectedOrder={selectedOrder} riders={riders} />;
}
