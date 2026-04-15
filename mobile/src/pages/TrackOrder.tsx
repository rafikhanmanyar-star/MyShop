import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { GoogleMap, Marker, Polyline, useJsApiLoader } from '@react-google-maps/api';
import { customerApi } from '../api';
import { useApp } from '../context/AppContext';

const mapContainerStyle = { width: '100%', height: 300 };

type OrderShape = {
    status: string;
    payment_method?: string;
    delivery_lat?: number | string | null;
    delivery_lng?: number | string | null;
    rider_latitude?: number | string | null;
    rider_longitude?: number | string | null;
    delivery_order_id?: string | null;
};

function TrackMapBody({
    apiKey,
    custLat,
    custLng,
    riderLat,
    riderLng,
}: {
    apiKey: string;
    custLat: number;
    custLng: number;
    riderLat: number | null;
    riderLng: number | null;
}) {
    const { isLoaded, loadError } = useJsApiLoader({
        id: 'customer-track-map',
        googleMapsApiKey: apiKey,
    });

    const center = useMemo(() => {
        if (riderLat != null && riderLng != null) {
            return { lat: (custLat + riderLat) / 2, lng: (custLng + riderLng) / 2 };
        }
        return { lat: custLat, lng: custLng };
    }, [custLat, custLng, riderLat, riderLng]);

    const linePath = useMemo(() => {
        if (riderLat == null || riderLng == null) return null;
        return [
            { lat: riderLat, lng: riderLng },
            { lat: custLat, lng: custLng },
        ];
    }, [riderLat, riderLng, custLat, custLng]);

    if (loadError) {
        return <p className="text-muted" style={{ padding: 16 }}>Could not load the map.</p>;
    }
    if (!isLoaded) {
        return <div className="skeleton" style={{ height: 300, borderRadius: 'var(--radius-lg)' }} />;
    }

    return (
        <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={center}
            zoom={riderLat != null ? 13 : 14}
            options={{ streetViewControl: false, mapTypeControl: false }}
        >
            <Marker
                position={{ lat: custLat, lng: custLng }}
                label="You"
                icon={{ url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png' }}
            />
            {riderLat != null && riderLng != null && (
                <Marker
                    position={{ lat: riderLat, lng: riderLng }}
                    label="Rider"
                    icon={{ url: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png' }}
                />
            )}
            {linePath && <Polyline path={linePath} options={{ strokeColor: '#2563eb', strokeOpacity: 0.8, strokeWeight: 3 }} />}
        </GoogleMap>
    );
}

export default function TrackOrder() {
    const { shopSlug, id } = useParams();
    const navigate = useNavigate();
    const { state, showToast } = useApp();
    const [order, setOrder] = useState<OrderShape | null>(null);
    const [loading, setLoading] = useState(true);
    const [etaMin, setEtaMin] = useState<number | null>(null);
    const [etaLabel, setEtaLabel] = useState<string | null>(null);

    const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || '';

    const loadOrder = useCallback(async () => {
        if (!id) return;
        try {
            const data = await customerApi.getOrder(id);
            setOrder(data);
        } catch (err: any) {
            showToast(err.message);
        } finally {
            setLoading(false);
        }
    }, [id, showToast]);

    useEffect(() => {
        if (!state.isLoggedIn) {
            navigate(`/${shopSlug}/login?redirect=orders/${id}/track`, { replace: true });
            return;
        }
        void loadOrder();
    }, [state.isLoggedIn, shopSlug, id, navigate, loadOrder]);

    useEffect(() => {
        if (!state.isLoggedIn || !id) return;
        const t = window.setInterval(() => void loadOrder(), 8_000);
        return () => clearInterval(t);
    }, [state.isLoggedIn, id, loadOrder]);

    const fetchEta = useCallback(async () => {
        if (!id) return;
        try {
            const r = await customerApi.getDeliveryEta(id);
            if (r.eta_minutes != null && Number.isFinite(Number(r.eta_minutes))) {
                setEtaMin(Number(r.eta_minutes));
                setEtaLabel(`Rider arriving in ~${r.eta_minutes} minutes`);
            } else {
                setEtaMin(null);
                setEtaLabel(null);
            }
        } catch {
            setEtaLabel(null);
        }
    }, [id]);

    useEffect(() => {
        if (!order || order.status !== 'OutForDelivery') return;
        void fetchEta();
        const t = window.setInterval(() => void fetchEta(), 45_000);
        return () => clearInterval(t);
    }, [order?.status, fetchEta]);

    if (loading) {
        return (
            <div className="page fade-in">
                <div className="skeleton" style={{ height: 300, marginBottom: 16, borderRadius: 'var(--radius-lg)' }} />
            </div>
        );
    }

    if (!order) {
        return (
            <div className="page fade-in">
                <p>Order not found.</p>
                <button className="btn btn-primary" type="button" onClick={() => navigate(-1)}>
                    Back
                </button>
            </div>
        );
    }

    const isPickup = order.payment_method === 'SelfCollection';
    const dlat = order.delivery_lat != null ? Number(order.delivery_lat) : NaN;
    const dlng = order.delivery_lng != null ? Number(order.delivery_lng) : NaN;
    const rlat = order.rider_latitude != null ? Number(order.rider_latitude) : NaN;
    const rlng = order.rider_longitude != null ? Number(order.rider_longitude) : NaN;

    const hasCust = Number.isFinite(dlat) && Number.isFinite(dlng);
    const hasRider = Number.isFinite(rlat) && Number.isFinite(rlng);

    return (
        <div className="page slide-up">
            <div className="page-header">
                <button
                    type="button"
                    onClick={() => navigate(`/${shopSlug}/orders/${id}`)}
                    style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: 'var(--bg)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="m12 19-7-7 7-7" />
                        <path d="M19 12H5" />
                    </svg>
                </button>
                <div>
                    <h1 style={{ fontSize: 18 }}>Track order</h1>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Live location updates every few seconds</p>
                </div>
            </div>

            {isPickup && (
                <p style={{ padding: 16, color: 'var(--text-muted)' }}>Tracking applies to delivery orders only.</p>
            )}

            {!isPickup && order.status === 'OutForDelivery' && (
                <div style={{ marginBottom: 12 }}>
                    <p style={{ fontWeight: 700, fontSize: 16, margin: '0 0 8px' }}>On the way</p>
                    {etaLabel && (
                        <p style={{ color: '#047857', fontWeight: 600, margin: '0 0 8px' }}>{etaLabel}</p>
                    )}
                    {!etaLabel && etaMin == null && order.status === 'OutForDelivery' && (
                        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                            ETA appears when the rider&apos;s location is available.
                        </p>
                    )}
                </div>
            )}

            {hasCust && apiKey ? (
                <div style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 16 }}>
                    <TrackMapBody
                        apiKey={apiKey}
                        custLat={dlat}
                        custLng={dlng}
                        riderLat={hasRider ? rlat : null}
                        riderLng={hasRider ? rlng : null}
                    />
                </div>
            ) : hasCust && !apiKey ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                    Map preview needs <code>VITE_GOOGLE_MAPS_API_KEY</code> on the storefront build. Your location is still
                    saved for the rider.
                </p>
            ) : (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No delivery coordinates on this order.</p>
            )}

            <Link to={`/${shopSlug}/orders/${id}`} className="btn btn-outline" style={{ display: 'inline-block' }}>
                Order details
            </Link>
        </div>
    );
}
