import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { publicApi, getProductImagePath } from '../api';
import CachedImage from '../components/CachedImage';

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
            publicApi.getProducts(shopSlug, { limit: '18' }),
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
        <div className="page page--home fade-in">
            {/* Hero / Shop Header */}
            <div
                className="home-hero"
                style={{
                    background: `linear-gradient(135deg, var(--primary) 0%, ${state.shop?.brand_color || '#4F46E5'}dd 100%)`,
                }}
            >
                <h1>
                    {state.shop?.company_name || state.shop?.name}
                </h1>
                <p className="home-hero-sub">
                    Order online • {state.settings?.estimated_delivery_minutes || 60} min delivery
                </p>
                {state.settings && state.settings.delivery_fee > 0 && (
                    <p className="home-hero-delivery">
                        Delivery: Rs. {state.settings.delivery_fee}
                        {state.settings.free_delivery_above && ` (free above Rs. ${state.settings.free_delivery_above})`}
                    </p>
                )}

                <Link to={`/${shopSlug}/products`} className="home-hero-search">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                    Search products...
                </Link>
            </div>

            {/* Categories */}
            {categories.length > 0 && (
                <section className="home-categories">
                    <h2 className="home-section-title">Categories</h2>
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
                <div className="home-products-head">
                    <h2>Products</h2>
                    <Link to={`/${shopSlug}/products`}>
                        View All →
                    </Link>
                </div>

                {loading ? (
                    <div className="product-grid product-grid--compact">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
                            <div key={i} className="product-card">
                                <div className="skeleton" style={{ aspectRatio: '1', width: '100%' }} />
                                <div style={{ padding: 8 }}>
                                    <div className="skeleton" style={{ height: 11, width: '80%', marginBottom: 6 }} />
                                    <div className="skeleton" style={{ height: 13, width: '50%' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="product-grid product-grid--compact">
                        {featured.map((p: any) => (
                            <Link key={p.id} to={`/${shopSlug}/products/${p.id}`} className="product-card">
                                <div className="image-wrap">
                                    <CachedImage path={getProductImagePath(p)} alt={p.name} />
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
