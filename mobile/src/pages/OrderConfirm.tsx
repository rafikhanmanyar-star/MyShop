import { useParams, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function OrderConfirm() {
    const { shopSlug, orderId } = useParams();
    const { state } = useApp();

    return (
        <div className="page fade-in" style={{ textAlign: 'center', paddingTop: 60 }}>
            {/* Success animation */}
            <div style={{
                width: 100, height: 100, borderRadius: '50%',
                background: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 24px',
                animation: 'scaleIn 0.4s ease-out',
            }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </div>

            <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8, color: '#065F46' }}>
                Order Placed!
            </h1>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 24 }}>
                Your order has been placed successfully
            </p>

            <div style={{
                background: 'white', borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-light)', padding: 20,
                marginBottom: 24, textAlign: 'left',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Order ID</span>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{orderId}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Status</span>
                    <span className="status-badge status-Pending">Pending</span>
                </div>
                {state.settings?.estimated_delivery_minutes && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Estimated Delivery</span>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>
                            ~{state.settings.estimated_delivery_minutes} min
                        </span>
                    </div>
                )}
            </div>

            <Link to={`/${shopSlug}/orders`} className="btn btn-primary btn-full" style={{ marginBottom: 12 }}>
                Track My Orders
            </Link>
            <Link to={`/${shopSlug}/products`} className="btn btn-outline btn-full">
                Continue Shopping
            </Link>
        </div>
    );
}
