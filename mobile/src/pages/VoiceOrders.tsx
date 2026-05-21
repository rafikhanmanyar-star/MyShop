import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { voiceOrderApi } from '../api';

const STATUS_LABEL: Record<string, string> = {
    Pending: 'Pending',
    Received: 'Received',
    Preparing: 'Preparing',
    InvoiceCreated: 'Invoice ready',
    Accepted: 'Accepted',
    Rejected: 'Rejected',
    OutForDelivery: 'Out for delivery',
    Delivered: 'Delivered',
    Cancelled: 'Cancelled',
};

export default function VoiceOrders() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const { state, showToast } = useApp();
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!state.isLoggedIn) {
            navigate(`/${shopSlug}/login?redirect=voice-orders`, { replace: true });
            return;
        }
        load();
    }, [state.isLoggedIn]);

    const load = async () => {
        try {
            const data = await voiceOrderApi.list();
            setOrders(data.items || []);
        } catch (e: any) {
            showToast(e.message);
        } finally {
            setLoading(false);
        }
    };

    const fmt = (d: string) => new Date(d).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

    return (
        <div className="page fade-in">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1>Voice Orders</h1>
                <Link to={`/${shopSlug}/voice-order`} className="btn btn-primary" style={{ padding: '8px 14px', fontSize: 13 }}>+ New</Link>
            </div>

            {loading ? (
                <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
            ) : orders.length === 0 ? (
                <div className="empty-state">
                    <h3>No voice orders</h3>
                    <p>Record a voice message with your shopping list</p>
                    <Link to={`/${shopSlug}/voice-order`} className="btn btn-primary" style={{ marginTop: 12 }}>Place voice order</Link>
                </div>
            ) : (
                orders.map((o) => (
                    <Link
                        key={o.id}
                        to={`/${shopSlug}/voice-orders/${o.id}`}
                        style={{
                            display: 'block',
                            padding: 14,
                            marginBottom: 10,
                            borderRadius: 12,
                            border: '1px solid var(--border-subtle)',
                            textDecoration: 'none',
                            color: 'inherit',
                            background: 'var(--surface-elevated, #fff)',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <strong>{o.order_number}</strong>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>{STATUS_LABEL[o.status] || o.status}</span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{fmt(o.created_at)}</div>
                        {o.invoice_grand_total != null && (
                            <div style={{ fontSize: 14, marginTop: 6, fontWeight: 600 }}>Invoice: Rs. {Number(o.invoice_grand_total).toLocaleString()}</div>
                        )}
                    </Link>
                ))
            )}
        </div>
    );
}
