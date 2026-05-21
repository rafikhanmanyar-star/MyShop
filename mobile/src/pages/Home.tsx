import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { publicApi, getProductImagePath } from '../api';
import ProductListCard, { type ProductListProduct } from '../components/ProductListCard';
import CategoryRailIcon from '../components/CategoryRailIcon';
import { filterCategoriesWithListedProducts } from '../utils/catalogCategories';
import { isMobileCatalogPriceListed } from '../utils/mobileProductPrice';
import GlobalSearchBar from '../features/search/GlobalSearchBar';
import { addRecentSearch } from '../features/search/recentSearchesStorage';
import HomePromoCarousel from '../components/HomePromoCarousel';
import type { HomePromoSlide } from '../context/AppContext';

function coercePromoSlides(raw: unknown): HomePromoSlide[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw as HomePromoSlide[];
    if (typeof raw === 'string') {
        try {
            const p = JSON.parse(raw);
            return Array.isArray(p) ? (p as HomePromoSlide[]) : [];
        } catch {
            return [];
        }
    }
    return [];
}

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

    const mainCategories = useMemo(
        () => categories.filter((c: any) => !c.parent_id),
        [categories]
    );

    const mainCategoriesWithProducts = useMemo(
        () => filterCategoriesWithListedProducts(mainCategories, null),
        [mainCategories]
    );

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
                const priceOk = (items: any[]) => (Array.isArray(items) ? items.filter((p) => isMobileCatalogPriceListed(p)) : []);
                setBestSellers(priceOk(bs.items || []));
                setDeals(priceOk(dl.items || []));
                setNewArrivals(priceOk(nw.items || []));
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

    const submitSearch = () => {
        const q = searchDraft.trim();
        if (!shopSlug) return;
        if (q) addRecentSearch(shopSlug, q);
        if (q) navigate(`/${shopSlug}/products?search=${encodeURIComponent(q)}`);
        else navigate(`/${shopSlug}/products`);
    };

    const renderSection = (title: string, items: any[], viewAllQuery: string) => (
        <section className="home-product-section">
            <div className="home-product-section__head">
                <h2 className="home-section-title">{title}</h2>
                <Link to={`/${shopSlug}/products${viewAllQuery}`} className="home-section-link">
                    View All →
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

    const promoSlides = coercePromoSlides(state.branding?.home_promo_slides);
    const promoIntervalSec = state.branding?.home_promo_interval_seconds ?? 5;
    const deliveryMins = state.settings?.estimated_delivery_minutes || 30;

    return (
        <div className="page page--home fade-in">
            <div className="home-search-sticky">
                <GlobalSearchBar
                    variant="home"
                    value={searchDraft}
                    onChange={setSearchDraft}
                    onSubmit={submitSearch}
                    fixedPlaceholder="Search for products, brands & more"
                    onBarcodeScan={() => navigate(`/${shopSlug}/products`)}
                />
            </div>

            <div className="category-nav-rail category-nav-rail--home" role="navigation" aria-label="Quick categories">
                <Link to={`/${shopSlug}/products`} className="category-nav-item category-nav-item--link category-nav-item--chip">
                    <span className="category-nav-item__icon category-nav-item__icon--indigo" aria-hidden>
                        📦
                    </span>
                    <span>All Items</span>
                </Link>
                <Link
                    to={`/${shopSlug}/products?filterInStock=true`}
                    className="category-nav-item category-nav-item--link category-nav-item--chip"
                >
                    <span className="category-nav-item__icon category-nav-item__icon--emerald" aria-hidden>
                        ✓
                    </span>
                    <span>In Stock</span>
                </Link>
                <Link
                    to={`/${shopSlug}/products?browse=popular`}
                    className="category-nav-item category-nav-item--link category-nav-item--chip"
                >
                    <span className="category-nav-item__icon category-nav-item__icon--amber" aria-hidden>
                        ⭐
                    </span>
                    <span>Popular</span>
                </Link>
                <Link
                    to={`/${shopSlug}/products?filterDeals=true`}
                    className="category-nav-item category-nav-item--link category-nav-item--chip"
                >
                    <span className="category-nav-item__icon category-nav-item__icon--rose" aria-hidden>
                        %
                    </span>
                    <span>Deals</span>
                </Link>
                <Link
                    to={`/${shopSlug}/products?sortBy=price_low_high`}
                    className="category-nav-item category-nav-item--link category-nav-item--chip"
                >
                    <span className="category-nav-item__icon category-nav-item__icon--cyan" aria-hidden>
                        ↓
                    </span>
                    <span>Low Price</span>
                </Link>
                <Link
                    to={`/${shopSlug}/utilities`}
                    className="category-nav-item category-nav-item--link category-nav-item--chip"
                >
                    <span className="category-nav-item__icon category-nav-item__icon--violet" aria-hidden>
                        ↩
                    </span>
                    <span>Easy Return</span>
                </Link>
                {mainCategoriesWithProducts.map((c: any) => (
                    <Link
                        key={c.id}
                        to={`/${shopSlug}/products?category=${c.id}`}
                        className="category-nav-item category-nav-item--link category-nav-item--chip"
                    >
                        <CategoryRailIcon mobile_icon_url={c.mobile_icon_url} />
                        <span>{c.name}</span>
                    </Link>
                ))}
            </div>

            {state.isLoggedIn && (
                <div className="home-loyalty-card home-loyalty-card--rich">
                    <div className="home-loyalty-card__main">
                        <span className="home-loyalty-card__icon" aria-hidden>
                            🎁
                        </span>
                        <div className="home-loyalty-card__text">
                            <p className="home-loyalty-card__brand-line">{state.shop?.company_name || state.shop?.name || 'Rewards'}</p>
                            {loyalty.fetchFailed && loyalty.totalPoints == null ? (
                                <p className="home-loyalty-card__points">Points unavailable</p>
                            ) : loyalty.totalPoints == null && !loyalty.fetchFailed ? (
                                <p className="home-loyalty-card__points home-loyalty-card__loading">Loading points…</p>
                            ) : (
                                <>
                                    <p className="home-loyalty-card__points">
                                        <strong>{(loyalty.totalPoints ?? 0).toLocaleString()}</strong> points
                                    </p>
                                    {loyalty.fetchFailed && (
                                        <p className="home-loyalty-card__hint home-loyalty-card__hint--muted">
                                            Showing last saved balance
                                        </p>
                                    )}
                                    <div className="home-loyalty-card__progress" aria-hidden>
                                        <span className="home-loyalty-card__progress-fill" />
                                    </div>
                                    <p className="home-loyalty-card__tagline">Keep shopping to unlock more perks</p>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="home-loyalty-card__actions">
                        <Link to={`/${shopSlug}/loyalty/history`} className="home-loyalty-card__cta home-loyalty-card__cta--ghost">
                            View History
                        </Link>
                        <Link to={`/${shopSlug}/loyalty/benefits`} className="home-loyalty-card__cta">
                            View Benefits →
                        </Link>
                    </div>
                </div>
            )}

            <HomePromoCarousel
                slides={promoSlides}
                shopSlug={shopSlug!}
                deliveryMinutes={deliveryMins}
                intervalSeconds={promoIntervalSec}
            />

            <div className="home-service-strip" aria-label="Service highlights">
                <div className="home-service-strip__item">
                    <span className="home-service-strip__ico">🚚</span>
                    <span className="home-service-strip__txt">Free Delivery</span>
                </div>
                <div className="home-service-strip__item">
                    <span className="home-service-strip__ico">🏪</span>
                    <span className="home-service-strip__txt">Easy Return</span>
                </div>
                <div className="home-service-strip__item">
                    <span className="home-service-strip__ico">🔒</span>
                    <span className="home-service-strip__txt">Secure Pay</span>
                </div>
                <div className="home-service-strip__item">
                    <span className="home-service-strip__ico">💬</span>
                    <span className="home-service-strip__txt">24/7 Support</span>
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
                    {renderSection('Flash Deals', deals, '?filterDeals=true')}
                    {renderSection('New Arrivals', newArrivals, '?browse=new')}
                </>
            )}
        </div>
    );
}
