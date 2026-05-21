import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { customerApi } from '../api';

type HistoryRow = {
    order_id: string;
    order_number: string;
    status: string;
    grand_total: number;
    points_earned: number;
    created_at: string;
};

export default function LoyaltyHistory() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const { state, showToast } = useApp();
    const [items, setItems] = useState<HistoryRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!state.isLoggedIn) {
            navigate(`/${shopSlug}/login?redirect=loyalty/history`, { replace: true });
            return;
        }
        customerApi
            .getLoyaltyHistory(50)
            .then((data: { items?: HistoryRow[] }) => setItems(Array.isArray(data?.items) ? data.items : []))
            .catch((err: { message?: string }) => showToast(err.message || 'Could not load history'))
            .finally(() => setLoading(false));
    }, [state.isLoggedIn, shopSlug, navigate, showToast]);

    const formatDate = (d: string) =>
        new Date(d).toLocaleDateString('en-PK', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });

    const formatPrice = (p: number) => `Rs. ${p.toLocaleString()}`;

    if (!state.isLoggedIn) return null;

    return (
        <div className="page slide-up">
            <div className="page-header">
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ marginBottom: 8 }}
                    onClick={() => navigate(-1)}
                >
                    ← Back
                </button>
                <h1>Points history</h1>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Points earned on delivered orders
                </p>
            </div>

            <div style={{ padding: '0 20px 24px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 32 }}>
                        <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} />
                    </div>
                ) : items.length === 0 ? (
                    <div className="empty-state" style={{ padding: '32px 16px' }}>
                        <span style={{ fontSize: 40 }} aria-hidden>
                            🎁
                        </span>
                        <h3>No points earned yet</h3>
                        <p>Complete a delivered order to earn loyalty points.</p>
                        <Link to={`/${shopSlug}/products`} className="btn btn-primary">
                            Start shopping
                        </Link>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {items.map((row) => (
                            <Link
                                key={row.order_id}
                                to={`/${shopSlug}/orders/${row.order_id}`}
                                className="card loyalty-history-row"
                            >
                                <div className="loyalty-history-row__top">
                                    <span className="loyalty-history-row__order">{row.order_number}</span>
                                    <span className="loyalty-history-row__points">+{row.points_earned} pts</span>
                                </div>
                                <div className="loyalty-history-row__meta">
                                    <span>{formatDate(row.created_at)}</span>
                                    <span>{formatPrice(row.grand_total)}</span>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
