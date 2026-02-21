import { useEffect, useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { publicApi } from '../api';
import BottomNav from '../components/BottomNav';

export default function ShopLoader() {
    const { shopSlug } = useParams<{ shopSlug: string }>();
    const { state, dispatch } = useApp();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!shopSlug) return;
        if (state.shopSlug === shopSlug && state.shop) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError('');

        publicApi.getShopInfo(shopSlug)
            .then((data) => {
                dispatch({
                    type: 'SET_SHOP',
                    slug: shopSlug,
                    shop: data.shop,
                    settings: data.settings,
                });

                // Apply shop brand color
                if (data.shop.brand_color) {
                    document.documentElement.style.setProperty('--primary', data.shop.brand_color);
                }
                document.title = `${data.shop.company_name || data.shop.name} — Order Online`;
            })
            .catch((err) => {
                setError(err.message || 'Shop not found');
            })
            .finally(() => setLoading(false));
    }, [shopSlug]);

    if (loading) {
        return (
            <div className="loading-page fade-in">
                <div className="spinner" style={{ width: 40, height: 40 }} />
                <p style={{ fontSize: 15 }}>Loading shop...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="loading-page fade-in">
                <div style={{ fontSize: 48, marginBottom: 8 }}>🏪</div>
                <h2 style={{ fontSize: 20, fontWeight: 700 }}>Failed to resolve shop</h2>
                <p style={{ color: 'var(--text-secondary)', maxWidth: 280, textAlign: 'center', marginBottom: 16 }}>
                    The shop "<strong>{shopSlug}</strong>" was not found. It may not exist or mobile ordering is not enabled yet.
                </p>
                <button
                    onClick={() => window.location.href = '/'}
                    style={{
                        padding: '12px 24px',
                        background: 'var(--primary, #4F46E5)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 12,
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: 'pointer',
                    }}
                >
                    ← Go Back
                </button>
            </div>
        );
    }

    return (
        <>
            <Outlet />
            <BottomNav />
        </>
    );
}
