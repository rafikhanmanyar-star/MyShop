import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { publicApi } from '../api';

interface ShopEntry {
    slug: string;
    company_name: string;
    logo_url: string | null;
    brand_color: string;
}

export default function LandingPage() {
    const navigate = useNavigate();
    const [shops, setShops] = useState<ShopEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [manualSlug, setManualSlug] = useState('');

    useEffect(() => {
        publicApi.discover()
            .then((data: any) => {
                // If there's only one shop, auto-redirect to it immediately
                if (data.redirect) {
                    navigate(`/${data.redirect}`, { replace: true });
                    return;
                }
                setShops(data.shops || []);
            })
            .catch((err: any) => {
                setError(err.message || 'Could not connect to server');
            })
            .finally(() => setLoading(false));
    }, [navigate]);

    const handleManualGo = () => {
        const slug = manualSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (slug) navigate(`/${slug}`);
    };

    if (loading) {
        return (
            <div className="loading-page fade-in">
                <div className="spinner" style={{ width: 40, height: 40 }} />
                <p style={{ fontSize: 15, marginTop: 16 }}>Finding shops...</p>
            </div>
        );
    }

    return (
        <div className="loading-page fade-in" style={{ padding: '32px 20px', justifyContent: 'flex-start', paddingTop: '15vh' }}>

            {/* Header */}
            <div style={{ fontSize: 56, marginBottom: 12 }}>🛍️</div>
            <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4, color: 'var(--text-primary)' }}>
                MyShop Mobile
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 300, textAlign: 'center', marginBottom: 32, lineHeight: 1.5 }}>
                Order from your favorite shop. Scan a QR code or select a shop below.
            </p>

            {/* Error */}
            {error && (
                <div style={{
                    background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12,
                    padding: '12px 16px', marginBottom: 20, maxWidth: 360, width: '100%',
                    fontSize: 13, color: '#B91C1C',
                }}>
                    ⚠️ {error}
                </div>
            )}

            {/* Shop list */}
            {shops.length > 0 && (
                <div style={{ width: '100%', maxWidth: 360, marginBottom: 24 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                        Available Shops
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {shops.map(shop => (
                            <button
                                key={shop.slug}
                                onClick={() => navigate(`/${shop.slug}`)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 14,
                                    padding: '14px 16px', background: 'white',
                                    border: '1.5px solid #E5E7EB', borderRadius: 16,
                                    cursor: 'pointer', transition: 'all 0.2s',
                                    textAlign: 'left', width: '100%',
                                }}
                                onMouseEnter={e => {
                                    (e.currentTarget as HTMLButtonElement).style.borderColor = shop.brand_color || '#4F46E5';
                                    (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as HTMLButtonElement).style.borderColor = '#E5E7EB';
                                    (e.currentTarget as HTMLButtonElement).style.transform = 'none';
                                    (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
                                }}
                            >
                                {shop.logo_url ? (
                                    <img src={shop.logo_url} alt="" style={{ width: 44, height: 44, borderRadius: 12, objectFit: 'cover' }} />
                                ) : (
                                    <div style={{
                                        width: 44, height: 44, borderRadius: 12,
                                        background: shop.brand_color || '#4F46E5',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: 'white', fontSize: 18, fontWeight: 800,
                                        flexShrink: 0,
                                    }}>
                                        {(shop.company_name || shop.slug || '?').charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                                        {shop.company_name || shop.slug}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                                        Tap to order →
                                    </div>
                                </div>
                                <div style={{
                                    width: 32, height: 32, borderRadius: 10,
                                    background: (shop.brand_color || '#4F46E5') + '15',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 14,
                                }}>
                                    →
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* No shops found */}
            {shops.length === 0 && !error && (
                <div style={{
                    background: '#F3F4F6', borderRadius: 16,
                    padding: '20px 16px', marginBottom: 24, maxWidth: 360, width: '100%',
                    textAlign: 'center',
                }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📱</div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                        No shops available yet
                    </p>
                    <p style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.5 }}>
                        Ask the shop owner to enable mobile ordering and set up a shop URL slug from the POS settings.
                    </p>
                </div>
            )}

            {/* Manual entry */}
            <div style={{ width: '100%', maxWidth: 360 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                    Or enter shop URL
                </p>

                <div style={{ display: 'flex', gap: 8 }}>
                    <input
                        type="text"
                        value={manualSlug}
                        onChange={e => setManualSlug(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleManualGo()}
                        placeholder="e.g. my-shop"
                        style={{
                            flex: 1, padding: '12px 16px',
                            border: '1.5px solid #E5E7EB', borderRadius: 12,
                            fontSize: 14, outline: 'none',
                            background: 'white',
                        }}
                    />
                    <button
                        onClick={handleManualGo}
                        disabled={!manualSlug.trim()}
                        style={{
                            padding: '12px 20px',
                            background: manualSlug.trim() ? 'var(--primary, #4F46E5)' : '#E5E7EB',
                            color: manualSlug.trim() ? 'white' : '#9CA3AF',
                            border: 'none', borderRadius: 12,
                            fontSize: 14, fontWeight: 700,
                            cursor: manualSlug.trim() ? 'pointer' : 'default',
                        }}
                    >
                        Go
                    </button>
                </div>
            </div>
        </div>
    );
}
