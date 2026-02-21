import { useEffect, useState, useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { publicApi } from '../api';

export default function Products() {
    const { shopSlug } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const { dispatch, showToast } = useApp();

    const [products, setProducts] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [cursor, setCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');

    const activeCategory = searchParams.get('category') || '';

    const loadProducts = useCallback(async (reset = false) => {
        if (!shopSlug) return;
        const params: Record<string, string> = { limit: '20' };
        if (activeCategory) params.category = activeCategory;
        if (searchTerm) params.search = searchTerm;
        if (!reset && cursor) params.cursor = cursor;

        if (reset) setLoading(true);
        else setLoadingMore(true);

        try {
            const data = await publicApi.getProducts(shopSlug, params);
            if (reset) {
                setProducts(data.items);
            } else {
                setProducts(prev => [...prev, ...data.items]);
            }
            setCursor(data.nextCursor);
            setHasMore(data.hasMore);
        } catch (err: any) {
            showToast(err.message || 'Failed to load products');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [shopSlug, activeCategory, searchTerm, cursor]);

    useEffect(() => {
        if (!shopSlug) return;
        publicApi.getCategories(shopSlug).then(setCategories).catch(() => { });
    }, [shopSlug]);

    useEffect(() => {
        setCursor(null);
        loadProducts(true);
    }, [shopSlug, activeCategory, searchTerm]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setSearchParams(prev => {
            if (searchTerm) prev.set('search', searchTerm);
            else prev.delete('search');
            return prev;
        });
    };

    const handleAddToCart = (e: React.MouseEvent, product: any) => {
        e.preventDefault();
        e.stopPropagation();
        if (product.available_stock <= 0) return;

        dispatch({
            type: 'ADD_TO_CART',
            item: {
                productId: product.id,
                name: product.name,
                sku: product.sku,
                price: product.price,
                quantity: 1,
                image_url: product.image_url,
                available_stock: product.available_stock,
                tax_rate: parseFloat(product.tax_rate) || 0,
            },
        });
        showToast(`${product.name} added to cart`);
    };

    const formatPrice = (p: number) => `Rs. ${p.toLocaleString()}`;

    return (
        <div className="page fade-in">
            {/* Search */}
            <form className="search-bar" onSubmit={handleSearch}>
                <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                <input
                    type="search"
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </form>

            {/* Categories */}
            {categories.length > 0 && (
                <div className="category-pills">
                    <button
                        className={`category-pill ${!activeCategory ? 'active' : ''}`}
                        onClick={() => setSearchParams(prev => { prev.delete('category'); return prev; })}
                    >All</button>
                    {categories.map((c: any) => (
                        <button
                            key={c.id}
                            className={`category-pill ${activeCategory === c.id ? 'active' : ''}`}
                            onClick={() => setSearchParams(prev => { prev.set('category', c.id); return prev; })}
                        >{c.name}</button>
                    ))}
                </div>
            )}

            {/* Products Grid */}
            {loading ? (
                <div className="product-grid">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="product-card">
                            <div className="skeleton" style={{ aspectRatio: '1' }} />
                            <div style={{ padding: 12 }}>
                                <div className="skeleton" style={{ height: 14, width: '80%', marginBottom: 8 }} />
                                <div className="skeleton" style={{ height: 18, width: '50%' }} />
                            </div>
                        </div>
                    ))}
                </div>
            ) : products.length === 0 ? (
                <div className="empty-state">
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                    <h3>No products found</h3>
                    <p>Try a different search or category</p>
                </div>
            ) : (
                <>
                    <div className="product-grid">
                        {products.map((p: any) => (
                            <Link key={p.id} to={`/${shopSlug}/products/${p.id}`} className="product-card">
                                <div className="image-wrap">
                                    {p.image_url ? (
                                        <img src={p.image_url} alt={p.name} loading="lazy" />
                                    ) : (
                                        <svg className="placeholder-icon" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
                                    )}
                                </div>
                                <div className="info">
                                    <div className="name">{p.name}</div>
                                    <div className="price">{formatPrice(p.price)}</div>
                                    <div className={`stock ${p.available_stock <= 0 ? 'out' : ''}`}>
                                        {p.available_stock > 0 ? `${p.available_stock} avail` : 'Out of stock'}
                                    </div>
                                </div>
                                <button
                                    className="add-btn"
                                    disabled={p.available_stock <= 0}
                                    onClick={(e) => handleAddToCart(e, p)}
                                >
                                    {p.available_stock <= 0 ? 'Sold Out' : '+ Add to Cart'}
                                </button>
                            </Link>
                        ))}
                    </div>

                    {hasMore && (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <button
                                className="btn btn-outline btn-sm"
                                onClick={() => loadProducts(false)}
                                disabled={loadingMore}
                            >
                                {loadingMore ? (
                                    <><span className="spinner" style={{ width: 16, height: 16 }} /> Loading...</>
                                ) : 'Load More'}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
