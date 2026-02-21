import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { customerApi } from '../api';

export default function Orders() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const { state, showToast } = useApp();

    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [cursor, setCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);

    useEffect(() => {
        if (!state.isLoggedIn) {
            navigate(`/${shopSlug}/login?redirect=orders`, { replace: true });
            return;
        }
        loadOrders();
    }, [state.isLoggedIn]);

    const loadOrders = async (nextCursor?: string) => {
        try {
            const data = await customerApi.getOrders(nextCursor);
            if (nextCursor) {
                setOrders(prev => [...prev, ...data.items]);
            } else {
                setOrders(data.items);
            }
            setCursor(data.nextCursor);
            setHasMore(data.hasMore);
        } catch (err: any) {
            showToast(err.message);
        } finally {
            setLoading(false);
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

    const statusLabel = (s: string) => s === 'OutForDelivery' ? 'Out for Delivery' : s;

    if (loading) {
        return (
            <div className="page fade-in">
                <div className="page-header"><h1>My Orders</h1></div>
                {[1, 2, 3].map(i => (
                    <div key={i} className="skeleton" style={{ height: 100, marginBottom: 12, borderRadius: 'var(--radius-lg)' }} />
                ))}
            </div>
        );
    }

    return (
        <div className="page fade-in">
            <div className="page-header">
                <h1>My Orders</h1>
            </div>

            {orders.length === 0 ? (
                <div className="empty-state">
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z" /><path d="M15 3v4a2 2 0 0 0 2 2h4" /></svg>
                    <h3>No orders yet</h3>
                    <p>Place your first order to see it here</p>
                    <Link to={`/${shopSlug}/products`} className="btn btn-primary">Browse Products</Link>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {orders.map((order: any) => (
                        <Link key={order.id} to={`/${shopSlug}/orders/${order.id}`} className="card" style={{ padding: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: 15 }}>{order.order_number}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{formatDate(order.created_at)}</div>
                                </div>
                                <span className={`status-badge status-${order.status}`}>{statusLabel(order.status)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{order.payment_method}</span>
                                <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--primary)' }}>{formatPrice(order.grand_total)}</span>
                            </div>
                        </Link>
                    ))}

                    {hasMore && (
                        <button className="btn btn-outline btn-sm" onClick={() => loadOrders(cursor!)}>
                            Load More
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
