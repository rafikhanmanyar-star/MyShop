import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { publicApi, getFullImageUrl } from '../api';
import FilterPanel from '../components/FilterPanel';

export default function Products() {
    const { shopSlug } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const { dispatch, showToast } = useApp();

    const [products, setProducts] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [brands, setBrands] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [cursor, setCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    // Debounce timer
    const searchTimeout = useRef<any>(null);
    // Sentinel ref for infinite scroll
    const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

    // Filter state from URL
    const filters = {
        categoryIds: searchParams.getAll('categoryIds[]').length > 0 ? searchParams.getAll('categoryIds[]') : (searchParams.get('category') ? [searchParams.get('category') as string] : []),
        subcategoryIds: searchParams.getAll('subcategoryIds[]'),
        brandIds: searchParams.getAll('brandIds[]'),
        minPrice: searchParams.get('minPrice'),
        maxPrice: searchParams.get('maxPrice'),
        availability: searchParams.get('availability'),
        onSale: searchParams.get('onSale') === 'true',
        sortBy: searchParams.get('sortBy') || 'newest',
        search: searchParams.get('search') || '',
    };

    const loadProducts = useCallback(async (reset = false, customParams?: any) => {
        if (!shopSlug) return;

        const currentFilters = customParams || filters;
        const params: Record<string, any> = {
            limit: '20',
            ...currentFilters,
            search: searchTerm // prioritize current input
        };

        if (!reset && cursor) params.cursor = cursor;
        else if (reset) delete params.cursor;

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
    }, [shopSlug, JSON.stringify(filters), searchTerm, cursor]);

    useEffect(() => {
        if (!shopSlug) return;
        Promise.all([
            publicApi.getCategories(shopSlug),
            publicApi.getBrands(shopSlug)
        ]).then(([cats, bnds]) => {
            setCategories(cats);
            setBrands(bnds);
        }).catch(() => { });
    }, [shopSlug]);

    useEffect(() => {
        setCursor(null);
        loadProducts(true);
    }, [shopSlug, JSON.stringify(filters)]);

    // Infinite scroll: load next page when sentinel enters viewport
    useEffect(() => {
        if (!hasMore || loadingMore || loading) return;
        const el = loadMoreSentinelRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting && hasMore && !loadingMore && !loading) {
                    loadProducts(false);
                }
            },
            { rootMargin: '200px', threshold: 0.1 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [hasMore, loadingMore, loading, loadProducts]);

    const handleSearchChange = (val: string) => {
        setSearchTerm(val);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => {
            setSearchParams(prev => {
                if (val) prev.set('search', val);
                else prev.delete('search');
                return prev;
            });
        }, 300);
    };

    const applyFilters = (newFilters: any) => {
        setSearchParams(prev => {
            // Clear current param lists
            const keysToDelete = ['categoryIds[]', 'subcategoryIds[]', 'brandIds[]', 'category'];
            keysToDelete.forEach(k => prev.delete(k));

            Object.entries(newFilters).forEach(([key, value]) => {
                if (Array.isArray(value)) {
                    value.forEach(v => prev.append(`${key}[]`, v));
                } else if (value) {
                    prev.set(key, value.toString());
                } else {
                    prev.delete(key);
                }
            });
            return prev;
        });
    };

    const clearFilters = () => {
        setSearchParams(new URLSearchParams());
        setSearchTerm('');
    };

    const removeFilter = (key: string, value?: string) => {
        setSearchParams(prev => {
            if (value) {
                const current = prev.getAll(key).filter(v => v !== value);
                prev.delete(key);
                current.forEach(v => prev.append(key, v));
            } else {
                prev.delete(key);
            }
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

    const formatPrice = (p: number | string | null | undefined) => {
        if (p === null || p === undefined) return 'Rs. 0';
        const num = typeof p === 'string' ? parseFloat(p) : p;
        return `Rs. ${isNaN(num) ? '0' : num.toLocaleString()}`;
    };

    const renderStars = (rating: number) => {
        return (
            <div className="rating-stars">
                {[1, 2, 3, 4, 5].map(s => (
                    <svg key={s} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill={s <= rating ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                ))}
            </div>
        );
    };

    return (
        <div className="page fade-in">
            {/* Search */}
            <div className="search-bar">
                <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                <input
                    type="search"
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={e => handleSearchChange(e.target.value)}
                />
            </div>

            {/* Filter & Sort Controls */}
            <div className="filter-controls">
                <button className={`filter-btn ${(filters.categoryIds.length > 0 || filters.brandIds.length > 0 || filters.minPrice || filters.maxPrice || filters.onSale) ? 'active' : ''}`} onClick={() => setIsFilterOpen(true)}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" /></svg>
                    Filters {(filters.categoryIds.length + filters.brandIds.length + (filters.minPrice || filters.maxPrice ? 1 : 0) + (filters.onSale ? 1 : 0)) > 0 && `(${filters.categoryIds.length + filters.brandIds.length + (filters.minPrice || filters.maxPrice ? 1 : 0) + (filters.onSale ? 1 : 0)})`}
                </button>
                <select className="sort-btn" value={filters.sortBy} onChange={e => applyFilters({ ...filters, sortBy: e.target.value })}>
                    <option value="newest">Newest First</option>
                    <option value="popularity">Most Popular</option>
                    <option value="price_low_high">Price: Low to High</option>
                    <option value="price_high_low">Price: High to Low</option>
                    <option value="top_rated">Highest Rated</option>
                    <option value="best_selling">Best Selling</option>
                    <option value="a_z">A-Z</option>
                    <option value="z_a">Z-A</option>
                </select>
            </div>

            {/* Active Filter Chips */}
            {(filters.categoryIds.length > 0 || filters.brandIds.length > 0 || filters.minPrice || filters.maxPrice || filters.onSale) && (
                <div className="active-filters">
                    {filters.categoryIds.map(id => {
                        const cat = categories.find(c => c.id === id);
                        return cat && (
                            <div key={id} className="filter-chip">
                                {cat.name}
                                <button onClick={() => removeFilter('categoryIds[]', id)}>×</button>
                            </div>
                        );
                    })}
                    {filters.brandIds.map(id => {
                        const brand = brands.find(b => b.id === id);
                        return brand && (
                            <div key={id} className="filter-chip">
                                {brand.name}
                                <button onClick={() => removeFilter('brandIds[]', id)}>×</button>
                            </div>
                        );
                    })}
                    {(filters.minPrice || filters.maxPrice) && (
                        <div className="filter-chip">
                            {filters.minPrice ? `> Rs.${filters.minPrice}` : ''} {filters.maxPrice ? `< Rs.${filters.maxPrice}` : ''}
                            <button onClick={() => { removeFilter('minPrice'); removeFilter('maxPrice'); }}>×</button>
                        </div>
                    )}
                    {filters.onSale && (
                        <div className="filter-chip">
                            On Sale
                            <button onClick={() => removeFilter('onSale')}>×</button>
                        </div>
                    )}
                    <button className="btn-sm" style={{ color: 'var(--primary)', fontWeight: 700 }} onClick={clearFilters}>Clear All</button>
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
                    <p>Try refining your filters or search</p>
                    <button className="btn btn-outline btn-sm" style={{ marginTop: 12 }} onClick={clearFilters}>Clear filters</button>
                </div>
            ) : (
                <>
                    <div className="product-grid">
                        {products.map((p: any) => (
                            <Link key={p.id} to={`/${shopSlug}/products/${p.id}`} className="product-card">
                                {p.is_on_sale && p.discount_percentage > 0 && (
                                    <div className="discount-badge">-{Math.round(p.discount_percentage)}%</div>
                                )}
                                <div className="image-wrap">
                                    {p.image_url ? (
                                        <img src={getFullImageUrl(p.image_url)} alt={p.name} loading="lazy" />
                                    ) : (
                                        <svg className="placeholder-icon" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
                                    )}
                                </div>
                                <div className="info">
                                    <div className="name">{p.name}</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div className="price">{formatPrice(p.price)}</div>
                                        {p.rating_avg > 0 && renderStars(p.rating_avg)}
                                    </div>
                                    <div className={`stock ${p.available_stock <= 0 ? 'out' : ''}`}>
                                        {p.available_stock > 0 ? (
                                            <span style={{ fontSize: 10 }}>In Stock: {p.available_stock}</span>
                                        ) : p.is_pre_order ? (
                                            <span style={{ color: 'var(--warning)', fontSize: 10 }}>Pre-Order</span>
                                        ) : (
                                            'Out of Stock'
                                        )}
                                    </div>
                                </div>
                                <button
                                    className="add-btn"
                                    disabled={p.available_stock <= 0}
                                    onClick={(e) => handleAddToCart(e, p)}
                                >
                                    {p.available_stock <= 0 ? (p.is_pre_order ? 'Pre-Order' : 'Sold Out') : '+ Add to Cart'}
                                </button>
                            </Link>
                        ))}
                    </div>

                    {/* Sentinel for infinite scroll; loading indicator when fetching more */}
                    {hasMore && (
                        <div ref={loadMoreSentinelRef} style={{ minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                            {loadingMore && <span className="spinner" style={{ width: 24, height: 24 }} />}
                        </div>
                    )}
                </>
            )}

            {/* Filter Panel */}
            <FilterPanel
                isOpen={isFilterOpen}
                onClose={() => setIsFilterOpen(false)}
                categories={categories}
                brands={brands}
                filters={filters}
                onApply={applyFilters}
                onClear={clearFilters}
            />
        </div>
    );
}
