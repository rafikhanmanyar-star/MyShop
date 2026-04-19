import { useEffect, useState, useMemo, useCallback, type FormEvent } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { publicApi, getProductImagePath } from '../api';
import ProductListCard, { type ProductListProduct } from '../components/ProductListCard';
import CategoryRailIcon from '../components/CategoryRailIcon';

export default function Home() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const { state, dispatch, showToast } = useApp();
    const loyalty = state.loyalty;
    const [categories, setCategories] = useState<any[]>([]);
    const [bestSellers, setBestSellers] = useState<any[]>([]);
    const [deals, setDeals] = useState<any[]>([]);
    const [newArrivals, setNewArrivals] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchDraft, setSearchDraft] = useState('');

    useEffect(() => {
        if (!shopSlug) return;
        setLoading(true);
        Promise.all([
            publicApi.getCategories(shopSlug),
            publicApi.getProducts(shopSlug, { limit: '10', sortBy: 'best_selling' }),
            publicApi.getProducts(shopSlug, { limit: '10', onSale: 'true' }),
            publicApi.getProducts(shopSlug, { limit: '10', sortBy: 'newest' }),
        ])
            .then(([cats, bs, dl, nw]) => {
                setCategories(Array.isArray(cats) ? cats : (cats as any)?.categories ?? []);
                setBestSellers(bs.items || []);
                setDeals(dl.items || []);
                setNewArrivals(nw.items || []);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [shopSlug]);

    const formatPrice = (p: number | string | null | undefined) => {
        if (p === null || p === undefined) return 'Rs. 0';
        const num = typeof p === 'string' ? parseFloat(p) : p;
        return `Rs. ${isNaN(num) ? '0' : num.toLocaleString()}`;
    };

    const cartQtyMap = useMemo(() => {
        const m = new Map<string, number>();
        state.cart.forEach((i) => m.set(i.productId, i.quantity));
        return m;
    }, [state.cart]);

    const addToCart = useCallback(
        (product: ProductListProduct, qtyDelta = 1) => {
            const stock = Number(product.stock ?? product.available_stock ?? 0);
            const existing = state.cart.find((i) => i.productId === product.id);
            const nextQty = (existing?.quantity ?? 0) + qtyDelta;
            if (!product.is_pre_order && stock > 0 && nextQty > stock) {
                showToast(`Only ${stock} available`);
                return;
            }
            if (qtyDelta > 0 && !product.is_pre_order && stock <= 0) {
                showToast('This product is unavailable');
                return;
            }
            try {
                if (existing) {
                    if (nextQty <= 0) {
                        dispatch({ type: 'REMOVE_FROM_CART', productId: product.id });
                        return;
                    }
                    dispatch({ type: 'UPDATE_QTY', productId: product.id, quantity: nextQty });
                } else if (qtyDelta > 0) {
                    dispatch({
                        type: 'ADD_TO_CART',
                        item: {
                            productId: product.id,
                            name: product.name,
                            sku: product.sku || '',
                            price: product.price,
                            quantity: 1,
                            image_url: getProductImagePath(product),
                            available_stock: stock,
                            tax_rate: parseFloat(String(product.tax_rate)) || 0,
                        },
                    });
                }
            } catch (e: any) {
                showToast(e?.message || 'Could not update cart');
            }
        },
        [dispatch, showToast, state.cart]
    );

    const handleAddOne = (product: ProductListProduct) => addToCart(product, 1);
    const handleChangeQty = (productId: string, quantity: number) => {
        const merged = [...bestSellers, ...deals, ...newArrivals];
        const product = merged.find((p: any) => p.id === productId);
        if (!product) return;
        const cur = cartQtyMap.get(productId) ?? 0;
        addToCart(product as ProductListProduct, quantity - cur);
    };

    const submitSearch = (e: FormEvent) => {
        e.preventDefault();
        const q = searchDraft.trim();
        if (!shopSlug) return;
        if (q) navigate(`/${shopSlug}/products?search=${encodeURIComponent(q)}`);
        else navigate(`/${shopSlug}/products`);
    };

    const renderSection = (title: string, items: any[], viewAllQuery: string) => (
        <section className="home-product-section">
            <div className="home-product-section__head">
                <h2 className="home-section-title">{title}</h2>
                <Link to={`/${shopSlug}/products${viewAllQuery}`} className="home-section-link">
                    View all →
                </Link>
            </div>
            <div className="home-product-row">
                {items.map((p: any) => (
                    <div key={p.id} className="home-product-row__cell">
                        <ProductListCard
                            product={p}
                            shopSlug={shopSlug!}
                            cartQty={cartQtyMap.get(p.id) ?? 0}
                            formatPrice={formatPrice}
                            unavailableStyle={false}
                            onAddOne={handleAddOne}
                            onChangeQty={handleChangeQty}
                        />
                    </div>
                ))}
            </div>
        </section>
    );

    return (
        <div className="page page--home fade-in">
            <div
                className="home-hero"
                style={{
                    background: `linear-gradient(135deg, var(--primary) 0%, ${state.shop?.brand_color || '#4F46E5'}dd 100%)`,
                }}
            >
                <p className="home-hero-sub">
                    Order online • {state.settings?.estimated_delivery_minutes || 60} min delivery
                </p>
                {state.settings && state.settings.delivery_fee > 0 && (
                    <p className="home-hero-delivery">
                        Delivery: Rs. {state.settings.delivery_fee}
                        {state.settings.free_delivery_above &&
                            ` (free above Rs. ${state.settings.free_delivery_above})`}
                    </p>
                )}
            </div>

            <div className="home-sticky">
                <form className="home-sticky-search" onSubmit={submitSearch}>
                    <svg
                        className="search-icon"
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                    >
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.3-4.3" />
                    </svg>
                    <input
                        type="search"
                        placeholder="Search products..."
                        value={searchDraft}
                        onChange={(e) => setSearchDraft(e.target.value)}
                        autoComplete="off"
                    />
                </form>

                {state.isLoggedIn && (
                    <div className="home-loyalty-card">
                        <div className="home-loyalty-card__main">
                            <span className="home-loyalty-card__icon" aria-hidden>🎁</span>
                            <div className="home-loyalty-card__text">
                                {loyalty.fetchFailed && loyalty.totalPoints == null ? (
                                    <p className="home-loyalty-card__points">Points unavailable</p>
                                ) : loyalty.totalPoints == null && !loyalty.fetchFailed ? (
                                    <p className="home-loyalty-card__points home-loyalty-card__loading">
                                        Loading points…
                                    </p>
                                ) : (
                                    <>
                                        <p className="home-loyalty-card__points">
                                            You have{' '}
                                            <strong>
                                                {(loyalty.totalPoints ?? 0).toLocaleString()} points
                                            </strong>
                                        </p>
                                        {loyalty.fetchFailed && (
                                            <p className="home-loyalty-card__hint home-loyalty-card__hint--muted">
                                                Showing last saved balance
                                            </p>
                                        )}
                                        {loyalty.pointsValue != null && loyalty.pointsValue > 0 && !loyalty.fetchFailed && (
                                            <p className="home-loyalty-card__hint">
                                                ≈ Rs. {loyalty.pointsValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} value
                                            </p>
                                        )}
                                        <p className="home-loyalty-card__tagline">Keep shopping to earn more!</p>
                                    </>
                                )}
                            </div>
                        </div>
                        <Link
                            to={`/${shopSlug}/account#loyalty`}
                            className="home-loyalty-card__cta"
                        >
                            View Details →
                        </Link>
                    </div>
                )}

                <div className="category-nav-rail category-nav-rail--home" role="tablist" aria-label="Categories">
                    <Link
                        to={`/${shopSlug}/products`}
                        className="category-nav-item category-nav-item--link"
                        role="tab"
                    >
                        <span className="category-nav-item__icon" aria-hidden>
                            🏬
                        </span>
                        <span>All Products</span>
                    </Link>
                    <Link
                        to={`/${shopSlug}/products?browse=popular`}
                        className="category-nav-item category-nav-item--link"
                        role="tab"
                    >
                        <span className="category-nav-item__icon" aria-hidden>
                            ⭐
                        </span>
                        <span>Popular</span>
                    </Link>
                    <Link
                        to={`/${shopSlug}/products?browse=new`}
                        className="category-nav-item category-nav-item--link"
                        role="tab"
                    >
                        <span className="category-nav-item__icon" aria-hidden>
                            ✨
                        </span>
                        <span>New Arrivals</span>
                    </Link>
                    {categories.map((c: any) => (
                        <Link
                            key={c.id}
                            to={`/${shopSlug}/products?category=${c.id}`}
                            className="category-nav-item category-nav-item--link"
                            role="tab"
                        >
                            <CategoryRailIcon mobile_icon_url={c.mobile_icon_url} />
                            <span>{c.name}</span>
                        </Link>
                    ))}
                </div>
            </div>

            {loading ? (
                <>
                    {[1, 2, 3].map((s) => (
                        <section key={s} className="home-product-section">
                            <div className="skeleton" style={{ height: 20, width: 140, marginBottom: 12 }} />
                            <div className="home-product-row">
                                {[1, 2, 3, 4].map((i) => (
                                    <div key={i} style={{ width: 140, flexShrink: 0 }}>
                                        <div className="skeleton" style={{ aspectRatio: '1', borderRadius: 12 }} />
                                        <div className="skeleton" style={{ height: 10, marginTop: 8 }} />
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
                </>
            ) : (
                <>
                    {renderSection('Best Sellers', bestSellers, '?sortBy=best_selling')}
                    {renderSection('Deals Today', deals, '?filterDeals=true')}
                    {renderSection('New Arrivals', newArrivals, '?browse=new')}
                </>
            )}
        </div>
    );
}
