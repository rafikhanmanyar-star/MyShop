import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { customerApi } from '../api';

const STATUS_STEPS = ['Pending', 'Confirmed', 'Packed', 'OutForDelivery', 'Delivered'];

const statusLabel = (s: string): string => {
    const labels: Record<string, string> = {
        Pending: 'Order Placed',
        Confirmed: 'Confirmed by Shop',
        Packed: 'Packed & Ready',
        OutForDelivery: 'Out for Delivery',
        Delivered: 'Delivered',
        Cancelled: 'Cancelled',
    };
    return labels[s] || s;
};

export default function OrderDetail() {
    const { shopSlug, id } = useParams();
    const navigate = useNavigate();
    const { state, showToast } = useApp();

    const [order, setOrder] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [cancelling, setCancelling] = useState(false);

    useEffect(() => {
        if (!state.isLoggedIn) {
            navigate(`/${shopSlug}/login?redirect=orders/${id}`, { replace: true });
            return;
        }
        loadOrder();
        // Poll for status updates
        const interval = setInterval(loadOrder, 10000);
        return () => clearInterval(interval);
    }, [id, state.isLoggedIn]);

    const loadOrder = async () => {
        try {
            const data = await customerApi.getOrder(id!);
            setOrder(data);
        } catch (err: any) {
            showToast(err.message);
        } finally {
            setLoading(false);
        }
    };

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

    const formatPrice = (p: number) => `Rs. ${parseFloat(p as any).toLocaleString()}`;
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

    const currentStepIdx = STATUS_STEPS.indexOf(order.status);

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
                    {statusLabel(order.status)}
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
                        {STATUS_STEPS.map((step, idx) => {
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
                                        <h4>{statusLabel(step)}</h4>
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
                        <span>Delivery</span><span>{formatPrice(parseFloat(order.delivery_fee))}</span>
                    </div>
                    <div className="summary-row total">
                        <span>Total</span><span>{formatPrice(parseFloat(order.grand_total))}</span>
                    </div>
                </div>
            </div>

            {/* Delivery Info */}
            {order.delivery_address && (
                <div style={{
                    background: 'white', borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border-light)', padding: 16, marginBottom: 16,
                }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>📍 Delivery</h3>
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{order.delivery_address}</p>
                    {order.delivery_notes && (
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Note: {order.delivery_notes}</p>
                    )}
                </div>
            )}

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
