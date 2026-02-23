import { useEffect, useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { publicApi } from '../api';
import BottomNav from '../components/BottomNav';
import Header from '../components/Header';

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

        Promise.all([
            publicApi.getShopInfo(shopSlug),
            publicApi.getBranding(shopSlug)
        ])
            .then(([shopData, brandingData]) => {
                dispatch({
                    type: 'SET_SHOP',
                    slug: shopSlug,
                    shop: shopData.shop,
                    settings: shopData.settings,
                    branding: brandingData,
                });

                // Apply shop brand color
                if (brandingData?.primary_color) {
                    document.documentElement.style.setProperty('--primary', brandingData.primary_color);
                } else if (shopData.shop.brand_color) {
                    document.documentElement.style.setProperty('--primary', shopData.shop.brand_color);
                }

                if (brandingData?.secondary_color) {
                    document.documentElement.style.setProperty('--secondary', brandingData.secondary_color);
                }

                if (brandingData?.accent_color) {
                    document.documentElement.style.setProperty('--accent', brandingData.accent_color);
                }

                document.title = `${shopData.shop.company_name || shopData.shop.name} — Order Online`;
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
            <Header />
            <Outlet />
            <BottomNav />
        </>
    );
}
