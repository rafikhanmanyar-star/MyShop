import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { voiceOrderApi, getFullImageUrl } from '../api';

const STATUS_STEPS = ['Pending', 'Received', 'Preparing', 'InvoiceCreated', 'Accepted', 'OutForDelivery', 'Delivered'];

export default function VoiceOrderDetail() {
    const { shopSlug, id } = useParams();
    const navigate = useNavigate();
    const { state, showToast } = useApp();
    const [order, setOrder] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        if (!id) return;
        try {
            const o = await voiceOrderApi.get(id);
            setOrder(o);
        } catch (e: any) {
            showToast(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!state.isLoggedIn) {
            navigate(`/${shopSlug}/login`, { replace: true });
            return;
        }
        void load();
        const t = setInterval(load, 15000);
        return () => clearInterval(t);
    }, [id, state.isLoggedIn]);

    if (loading || !order) {
        return <div className="page"><p>Loading…</p></div>;
    }

    const audioSrc = order.audio_url ? getFullImageUrl(order.audio_url) : null;
    const stepIdx = STATUS_STEPS.indexOf(order.status);

    return (
        <div className="page fade-in" style={{ paddingBottom: 80 }}>
            <Link to={`/${shopSlug}/voice-orders`} style={{ fontSize: 14, marginBottom: 8, display: 'inline-block' }}>← Voice orders</Link>
            <h1>{order.order_number}</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{order.status?.replace(/([A-Z])/g, ' $1').trim()}</p>

            {audioSrc && (
                <div style={{ margin: '16px 0', padding: 12, borderRadius: 12, background: 'var(--surface-elevated)' }}>
                    <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Your recording</p>
                    <audio controls src={audioSrc} style={{ width: '100%' }} />
                </div>
            )}

            {order.transcription_text && (
                <div style={{ marginBottom: 16, padding: 12, borderRadius: 12, background: '#f0fdf4', fontSize: 14 }}>
                    <strong>Transcript</strong>
                    <p style={{ marginTop: 6 }}>{order.transcription_text}</p>
                </div>
            )}

            {order.invoice_number && (
                <div style={{ marginBottom: 16, padding: 16, borderRadius: 12, border: '2px solid var(--primary)' }}>
                    <h3 style={{ margin: '0 0 8px' }}>Invoice {order.invoice_number}</h3>
                    <p style={{ fontSize: 22, fontWeight: 800 }}>Rs. {Number(order.invoice_grand_total || 0).toLocaleString()}</p>
                    {order.status === 'InvoiceCreated' && (
                        <button type="button" className="btn btn-primary btn-full" style={{ marginTop: 12 }} onClick={async () => {
                            try {
                                await voiceOrderApi.approve(id!);
                                showToast('Invoice approved');
                                void load();
                            } catch (e: any) {
                                showToast(e.message);
                            }
                        }}>
                            Approve invoice
                        </button>
                    )}
                </div>
            )}

            {order.mobile_order_id && (
                <Link to={`/${shopSlug}/orders/${order.mobile_order_id}`} className="btn btn-secondary btn-full" style={{ marginBottom: 12 }}>
                    Track delivery
                </Link>
            )}

            <div style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: 14, marginBottom: 8 }}>Status</h3>
                {STATUS_STEPS.map((s, i) => (
                    <div key={s} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, opacity: i <= stepIdx ? 1 : 0.35 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: i <= stepIdx ? 'var(--primary)' : '#cbd5e1' }} />
                        <span style={{ fontSize: 13 }}>{s.replace(/([A-Z])/g, ' $1').trim()}</span>
                    </div>
                ))}
            </div>

            {order.branch_name && (
                <p style={{ marginTop: 16, fontSize: 14 }}>
                    Branch: <strong>{order.branch_name}</strong>
                    {order.customer_phone && (
                        <> · <a href={`tel:${order.customer_phone}`}>Call shop</a></>
                    )}
                </p>
            )}

            {['Pending', 'Received', 'Preparing'].includes(order.status) && (
                <button type="button" className="btn btn-secondary btn-full" style={{ marginTop: 20 }} onClick={async () => {
                    try {
                        await voiceOrderApi.cancel(id!, 'Cancelled by customer');
                        showToast('Order cancelled');
                        navigate(`/${shopSlug}/voice-orders`);
                    } catch (e: any) {
                        showToast(e.message);
                    }
                }}>
                    Cancel order
                </button>
            )}
        </div>
    );
}
