import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { publicApi, getFullImageUrl } from '../api';

export default function ProductDetail() {
    const { shopSlug, id } = useParams();
    const navigate = useNavigate();
    const { dispatch, showToast, state } = useApp();

    const [product, setProduct] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [qty, setQty] = useState(1);

    useEffect(() => {
        if (!shopSlug || !id) return;
        publicApi.getProduct(shopSlug, id)
            .then(setProduct)
            .catch(() => showToast('Product not found'))
            .finally(() => setLoading(false));
    }, [shopSlug, id]);

    const formatPrice = (p: number | string | null | undefined) => {
        if (p === null || p === undefined) return 'Rs. 0';
        const num = typeof p === 'string' ? parseFloat(p) : p;
        return `Rs. ${isNaN(num) ? '0' : num.toLocaleString()}`;
    };

    const inCart = state.cart.find(i => i.productId === id);

    const handleAdd = () => {
        if (!product || product.available_stock <= 0) return;
        dispatch({
            type: 'ADD_TO_CART',
            item: {
                productId: product.id,
                name: product.name,
                sku: product.sku,
                price: product.price,
                quantity: qty,
                image_url: product.image_url,
                available_stock: product.available_stock,
                tax_rate: parseFloat(product.tax_rate) || 0,
            },
        });
        showToast(`${product.name} added to cart`);
    };

    if (loading) {
        return (
            <div className="page fade-in">
                <div className="skeleton" style={{ width: '100%', aspectRatio: '1', borderRadius: 'var(--radius-xl)', marginBottom: 20 }} />
                <div className="skeleton" style={{ height: 28, width: '70%', marginBottom: 12 }} />
                <div className="skeleton" style={{ height: 24, width: '40%', marginBottom: 20 }} />
                <div className="skeleton" style={{ height: 48, width: '100%' }} />
            </div>
        );
    }

    if (!product) {
        return (
            <div className="page fade-in">
                <div className="empty-state">
                    <h3>Product not found</h3>
                    <button className="btn btn-primary" onClick={() => navigate(-1)}>Go Back</button>
                </div>
            </div>
        );
    }

    return (
        <div className="page fade-in" style={{ padding: 0, paddingBottom: 'calc(100px + var(--safe-bottom))' }}>
            {/* Image */}
            <div style={{
                width: '100%',
                aspectRatio: '1',
                background: 'linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
            }}>
                {product.image_url ? (
                    <img src={getFullImageUrl(product.image_url)} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
                )}

                {/* Back button */}
                <button style={{
                    position: 'absolute', top: 12, left: 12,
                    width: 40, height: 40, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: 'var(--shadow)',
                }}
                    onClick={() => navigate(-1)}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
                </button>
            </div>

            {/* Info */}
            <div style={{ padding: '20px 16px' }}>
                {product.category_name && (
                    <span style={{
                        fontSize: 12, fontWeight: 600, color: 'var(--primary)',
                        background: 'rgba(79,70,229,0.08)', padding: '4px 10px',
                        borderRadius: 'var(--radius-full)', marginBottom: 8, display: 'inline-block',
                    }}>
                        {product.category_name}
                    </span>
                )}

                <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, lineHeight: 1.3 }}>
                    {product.name}
                </h1>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                    SKU: {product.sku}
                </p>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
                    <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)' }}>
                        {formatPrice(product.price)}
                    </span>
                    {product.tax_rate > 0 && (
                        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                            +{product.tax_rate}% tax
                        </span>
                    )}
                </div>

                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 'var(--radius-full)',
                    background: product.available_stock > 0 ? '#D1FAE5' : '#FEE2E2',
                    color: product.available_stock > 0 ? '#065F46' : '#991B1B',
                    fontSize: 13, fontWeight: 600, marginBottom: 20,
                }}>
                    <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: product.available_stock > 0 ? '#10B981' : '#EF4444',
                    }} />
                    {product.available_stock > 0 ? `${product.available_stock} in stock` : 'Out of stock'}
                </div>

                {product.mobile_description && (
                    <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)', marginBottom: 20 }}>
                        {product.mobile_description}
                    </p>
                )}

                {/* Quantity selector + Add to Cart */}
                {product.available_stock > 0 && (
                    <div style={{
                        display: 'flex', gap: 12, alignItems: 'center',
                        padding: '16px', background: 'var(--bg)', borderRadius: 'var(--radius-lg)',
                    }}>
                        <div className="qty-controls">
                            <button onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
                            <span>{qty}</span>
                            <button onClick={() => setQty(Math.min(product.available_stock, qty + 1))}>+</button>
                        </div>
                        <button className="btn btn-primary btn-full" onClick={handleAdd}>
                            Add to Cart — {formatPrice(product.price * qty)}
                        </button>
                    </div>
                )}

                {inCart && (
                    <p style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, marginTop: 12, textAlign: 'center' }}>
                        ✓ {inCart.quantity} already in cart
                    </p>
                )}
            </div>
        </div>
    );
}
