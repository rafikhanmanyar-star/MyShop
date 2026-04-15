import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { customerApi, getApiBaseUrl } from '../api';

const DELIVERY_STEPS = ['Pending', 'Confirmed', 'Packed', 'OutForDelivery', 'Delivered'];
const PICKUP_STEPS = ['Pending', 'Confirmed', 'Packed', 'Delivered'];

const statusLabel = (s: string, isPickup: boolean): string => {
    const labels: Record<string, string> = {
        Pending: 'Order Placed',
        Confirmed: 'Confirmed by Shop',
        Packed: 'Packed & Ready',
        OutForDelivery: 'Out for Delivery',
        Delivered: isPickup ? 'Collected' : 'Delivered',
        Cancelled: 'Cancelled',
    };
    return labels[s] || s;
};

/** Stage 9 — live courier tracking in the customer PWA (API shares rider fields with POS Stage 8). */
function formatCourierDeliveryStatus(ds: string | null | undefined): string {
    if (!ds) return '—';
    const u = ds.toUpperCase();
    const map: Record<string, string> = {
        ASSIGNED: 'Assigned',
        PICKED: 'Picked up',
        ON_THE_WAY: 'On the way',
        DELIVERED: 'Delivered',
    };
    return map[u] || ds.replace(/_/g, ' ');
}

function formatRiderOperationalStatus(s: string | null | undefined): string {
    if (!s) return '—';
    const u = String(s).toUpperCase();
    const map: Record<string, string> = { AVAILABLE: 'Available', BUSY: 'Busy', OFFLINE: 'Offline' };
    return map[u] || String(s);
}

function buildRiderToCustomerMapsUrl(
    rlat: number,
    rlng: number,
    dlat: number,
    dlng: number
): string {
    return `https://www.google.com/maps/dir/?api=1&origin=${rlat},${rlng}&destination=${dlat},${dlng}`;
}

export default function OrderDetail() {
    const { shopSlug, id } = useParams();
    const navigate = useNavigate();
    const { state, showToast } = useApp();

    const [order, setOrder] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [cancelling, setCancelling] = useState(false);

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
            navigate(`/${shopSlug}/login?redirect=orders/${id}`, { replace: true });
            return;
        }
        if (!id) return;
        setLoading(true);
        setOrder(null);
        void loadOrder();
    }, [id, state.isLoggedIn, shopSlug, navigate, loadOrder]);

    /** Stage 10: server-sent events when order or courier status changes (PostgreSQL LISTEN; polling remains for live GPS). */
    useEffect(() => {
        if (!state.isLoggedIn || !id) return;
        const token = localStorage.getItem('mobile_token');
        if (!token) return;

        const base = getApiBaseUrl();
        const qs = new URLSearchParams({ access_token: token });
        const url = `${base}/mobile/orders/${encodeURIComponent(id)}/stream?${qs.toString()}`;

        const es = new EventSource(url);
        es.onmessage = (ev) => {
            try {
                const d = JSON.parse(ev.data);
                if (d.type === 'order_updated') void loadOrder();
            } catch {
                /* ignore non-JSON */
            }
        };
        es.onerror = () => {
            /* browser reconnects automatically */
        };
        return () => {
            es.close();
        };
    }, [id, state.isLoggedIn, loadOrder]);

    useEffect(() => {
        if (!state.isLoggedIn || !id) return;
        const fastPoll =
            order &&
            order.payment_method !== 'SelfCollection' &&
            order.delivery_order_id &&
            order.status === 'OutForDelivery' &&
            String(order.delivery_status || '').toUpperCase() !== 'DELIVERED';
        const ms = fastPoll ? 12_000 : 15_000;
        const t = window.setInterval(() => void loadOrder(), ms);
        return () => clearInterval(t);
    }, [
        id,
        state.isLoggedIn,
        order?.payment_method,
        order?.delivery_order_id,
        order?.status,
        order?.delivery_status,
        loadOrder,
    ]);

    const handleCancel = async () => {
        if (!confirm('Are you sure you want to cancel this order?')) return;
        setCancelling(true);
        try {
            await customerApi.cancelOrder(id!);
            showToast('Order cancelled');
            loadOrder();
        } catch (err: any) {
            showToast(err.message);
        } finally {
            setCancelling(false);
        }
    };

    const formatPrice = (p: number | string | null | undefined) => {
        if (p === null || p === undefined) return 'Rs. 0';
        const num = typeof p === 'string' ? parseFloat(p) : p;
        return `Rs. ${isNaN(num) ? '0' : num.toLocaleString()}`;
    };
    const formatDate = (d: string) => new Date(d).toLocaleDateString('en-PK', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    if (loading) {
        return (
            <div className="page fade-in">
                <div className="skeleton" style={{ height: 200, marginBottom: 16, borderRadius: 'var(--radius-lg)' }} />
                <div className="skeleton" style={{ height: 300, borderRadius: 'var(--radius-lg)' }} />
            </div>
        );
    }

    if (!order) {
        return (
            <div className="page fade-in">
                <div className="empty-state">
                    <h3>Order not found</h3>
                    <button className="btn btn-primary" onClick={() => navigate(-1)}>Go Back</button>
                </div>
            </div>
        );
    }

    const isPickup = order.payment_method === 'SelfCollection';
    const statusSteps = isPickup ? PICKUP_STEPS : DELIVERY_STEPS;
    const currentStepIdx = statusSteps.indexOf(order.status);

    return (
        <div className="page slide-up">
            {/* Header */}
            <div className="page-header">
                <button onClick={() => navigate(-1)} style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
                </button>
                <div>
                    <h1 style={{ fontSize: 18 }}>{order.order_number}</h1>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(order.created_at)}</p>
                </div>
                <span className={`status-badge status-${order.status}`} style={{ marginLeft: 'auto' }}>
                    {statusLabel(order.status, isPickup)}
                </span>
            </div>

            {/* Status Timeline */}
            {order.status !== 'Cancelled' && (
                <div style={{
                    background: 'white', borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border-light)', padding: 20, marginBottom: 16,
                }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Order Status</h3>
                    <div className="status-timeline">
                        {statusSteps.map((step, idx) => {
                            const isCompleted = idx < currentStepIdx;
                            const isActive = idx === currentStepIdx;
                            return (
                                <div key={step} className={`timeline-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                                    <div className="dot">
                                        {isCompleted ? (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                                        ) : isActive ? (
                                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'white' }} />
                                        ) : null}
                                    </div>
                                    <div className="step-info">
                                        <h4>{statusLabel(step, isPickup)}</h4>
                                        {(isActive || isCompleted) && order.status_history && (
                                            <p>{formatDate(order.status_history.find((h: any) => h.to_status === step)?.created_at || order.created_at)}</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Stage 9: live courier — same data as shop POS (distance + map when coords exist) */}
            {!isPickup && order.delivery_order_id && order.status !== 'Cancelled' && order.status !== 'Delivered' && (
                <div style={{
                    background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid #a7f3d0',
                    padding: 16,
                    marginBottom: 16,
                }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: '#065f46' }}>
                        🛵 Your courier
                    </h3>
                    <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {order.rider_name && (
                            <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {order.rider_name}
                            </p>
                        )}
                        {order.rider_phone && (
                            <p style={{ margin: '0 0 8px' }}>
                                <a href={`tel:${order.rider_phone}`} style={{ color: 'var(--primary)', fontWeight: 600 }}>
                                    {order.rider_phone}
                                </a>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>Tap to call</span>
                            </p>
                        )}
                        <p style={{ margin: '0 0 4px' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Delivery: </span>
                            <span style={{ fontWeight: 600 }}>{formatCourierDeliveryStatus(order.delivery_status)}</span>
                        </p>
                        <p style={{ margin: '0 0 8px' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Rider status: </span>
                            <span style={{ fontWeight: 600 }}>{formatRiderOperationalStatus(order.rider_operational_status)}</span>
                        </p>
                        {order.rider_to_dropoff_km != null && Number.isFinite(Number(order.rider_to_dropoff_km)) && (
                            <p style={{ margin: '0 0 10px', fontWeight: 700, color: '#047857' }}>
                                ~{Number(order.rider_to_dropoff_km).toFixed(2)} km to your address
                            </p>
                        )}
                        {(() => {
                            const rlat = order.rider_latitude != null ? Number(order.rider_latitude) : NaN;
                            const rlng = order.rider_longitude != null ? Number(order.rider_longitude) : NaN;
                            const dlat = order.delivery_lat != null ? Number(order.delivery_lat) : NaN;
                            const dlng = order.delivery_lng != null ? Number(order.delivery_lng) : NaN;
                            if (![rlat, rlng, dlat, dlng].every((n) => Number.isFinite(n))) return null;
                            return (
                                <a
                                    href={buildRiderToCustomerMapsUrl(rlat, rlng, dlat, dlng)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btn-outline btn-sm"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4 }}
                                >
                                    Open in Maps
                                </a>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Cancelled notice */}
            {order.status === 'Cancelled' && (
                <div style={{
                    background: '#FEE2E2', borderRadius: 'var(--radius-lg)',
                    padding: 16, marginBottom: 16, color: '#991B1B',
                }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Order Cancelled</div>
                    {order.cancellation_reason && <p style={{ fontSize: 13 }}>{order.cancellation_reason}</p>}
                    <p style={{ fontSize: 12, marginTop: 4 }}>
                        Cancelled by {order.cancelled_by || 'system'} on {formatDate(order.cancelled_at)}
                    </p>
                </div>
            )}

            {/* Items */}
            <div style={{
                background: 'white', borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-light)', padding: 16, marginBottom: 16,
            }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Items</h3>
                {order.items?.map((item: any) => (
                    <div key={item.id} style={{
                        display: 'flex', justifyContent: 'space-between', padding: '8px 0',
                        borderBottom: '1px solid var(--border-light)', fontSize: 14,
                    }}>
                        <div>
                            <div style={{ fontWeight: 600 }}>{item.product_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>× {item.quantity} @ {formatPrice(parseFloat(item.unit_price))}</div>
                        </div>
                        <div style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{formatPrice(parseFloat(item.subtotal))}</div>
                    </div>
                ))}

                <div style={{ marginTop: 12 }}>
                    <div className="summary-row">
                        <span>Subtotal</span><span>{formatPrice(parseFloat(order.subtotal))}</span>
                    </div>
                    {parseFloat(order.tax_total) > 0 && (
                        <div className="summary-row">
                            <span>Tax</span><span>{formatPrice(parseFloat(order.tax_total))}</span>
                        </div>
                    )}
                    <div className="summary-row">
                        <span>{isPickup ? 'Pickup' : 'Delivery'}</span>
                        <span>
                            {parseFloat(order.delivery_fee) === 0
                                ? <span style={{ color: 'var(--accent)' }}>FREE</span>
                                : formatPrice(parseFloat(order.delivery_fee))}
                        </span>
                    </div>
                    <div className="summary-row total">
                        <span>Total</span><span>{formatPrice(parseFloat(order.grand_total))}</span>
                    </div>
                </div>
            </div>

            {/* Delivery / pickup */}
            {order.delivery_address && (
                <div style={{
                    background: 'white', borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border-light)', padding: 16, marginBottom: 16,
                }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{isPickup ? '🏪 Pickup' : '📍 Delivery'}</h3>
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{order.delivery_address}</p>
                    {order.delivery_notes && (
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Note: {order.delivery_notes}</p>
                    )}
                </div>
            )}

            <div style={{
                background: 'white', borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-light)', padding: 16, marginBottom: 16,
            }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>💳 Payment</h3>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                    {order.payment_method === 'SelfCollection'
                        ? 'Self collection — pay at the branch when you collect'
                        : order.payment_method === 'EasypaisaJazzcashOnline'
                          ? 'Easypaisa / Jazzcash / online — complete payment using details the shop shares with you; delivery follows as usual.'
                          : 'Cash on delivery'}
                </p>
            </div>

            {/* Cancel button */}
            {order.status === 'Pending' && (
                <button
                    className="btn btn-danger btn-full"
                    onClick={handleCancel}
                    disabled={cancelling}
                    style={{ marginBottom: 16 }}
                >
                    {cancelling ? 'Cancelling...' : 'Cancel Order'}
                </button>
            )}
        </div>
    );
}
