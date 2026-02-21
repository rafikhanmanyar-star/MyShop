import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { publicApi, getFullImageUrl } from '../api';

export default function Home() {
    const { shopSlug } = useParams();
    const { state } = useApp();
    const [categories, setCategories] = useState<any[]>([]);
    const [featured, setFeatured] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!shopSlug) return;
        Promise.all([
            publicApi.getCategories(shopSlug),
            publicApi.getProducts(shopSlug, { limit: '6' }),
        ]).then(([cats, prods]) => {
            setCategories(cats);
            setFeatured(prods.items || []);
        }).catch(() => { })
            .finally(() => setLoading(false));
    }, [shopSlug]);

    const formatPrice = (p: number | string | null | undefined) => {
        if (p === null || p === undefined) return 'Rs. 0';
        const num = typeof p === 'string' ? parseFloat(p) : p;
        return `Rs. ${isNaN(num) ? '0' : num.toLocaleString()}`;
    };

    return (
        <div className="page fade-in">
            {/* Hero / Shop Header */}
            <div style={{
                background: `linear-gradient(135deg, var(--primary) 0%, ${state.shop?.brand_color || '#4F46E5'}dd 100%)`,
                borderRadius: 'var(--radius-xl)',
                padding: '28px 20px',
                marginBottom: 20,
                color: 'white',
            }}>
                <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>
                    {state.shop?.company_name || state.shop?.name}
                </h1>
                <p style={{ opacity: 0.85, fontSize: 14 }}>
                    Order online • {state.settings?.estimated_delivery_minutes || 60} min delivery
                </p>
                {state.settings && state.settings.delivery_fee > 0 && (
                    <p style={{ opacity: 0.7, fontSize: 13, marginTop: 4 }}>
                        Delivery: Rs. {state.settings.delivery_fee}
                        {state.settings.free_delivery_above && ` (free above Rs. ${state.settings.free_delivery_above})`}
                    </p>
                )}

                <Link to={`/${shopSlug}/products`} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'rgba(255,255,255,0.2)', borderRadius: 'var(--radius-full)',
                    padding: '10px 16px', marginTop: 16, color: 'white', fontSize: 14,
                    backdropFilter: 'blur(10px)',
                }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                    Search products...
                </Link>
            </div>

            {/* Categories */}
            {categories.length > 0 && (
                <section style={{ marginBottom: 24 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Categories</h2>
                    <div className="category-pills">
                        {categories.map((c: any) => (
                            <Link key={c.id} to={`/${shopSlug}/products?category=${c.id}`} className="category-pill">
                                {c.name}
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {/* Featured Products */}
            <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 700 }}>Products</h2>
                    <Link to={`/${shopSlug}/products`} style={{ color: 'var(--primary)', fontSize: 14, fontWeight: 600 }}>
                        View All →
                    </Link>
                </div>

                {loading ? (
                    <div className="product-grid">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="product-card">
                                <div className="skeleton" style={{ aspectRatio: '1', width: '100%' }} />
                                <div style={{ padding: 12 }}>
                                    <div className="skeleton" style={{ height: 14, width: '80%', marginBottom: 8 }} />
                                    <div className="skeleton" style={{ height: 18, width: '50%' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="product-grid">
                        {featured.map((p: any) => (
                            <Link key={p.id} to={`/${shopSlug}/products/${p.id}`} className="product-card">
                                <div className="image-wrap">
                                    {p.image_url ? (
                                        <img src={getFullImageUrl(p.image_url)} alt={p.name} />
                                    ) : (
                                        <svg className="placeholder-icon" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
                                    )}
                                </div>
                                <div className="info">
                                    <div className="name">{p.name}</div>
                                    <div className="price">{formatPrice(p.price)}</div>
                                    <div className={`stock ${p.available_stock <= 0 ? 'out' : ''}`}>
                                        {p.available_stock > 0 ? `${p.available_stock} in stock` : 'Out of stock'}
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
