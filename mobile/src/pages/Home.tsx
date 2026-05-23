import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { publicApi, getProductImagePath } from '../api';
import { type ProductListProduct } from '../components/ProductListCard';
import { filterCategoriesWithListedProducts } from '../utils/catalogCategories';
import { isMobileCatalogPriceListed } from '../utils/mobileProductPrice';
import GlobalSearchBar from '../features/search/GlobalSearchBar';
import { addRecentSearch } from '../features/search/recentSearchesStorage';
import HomePromoCarousel from '../components/HomePromoCarousel';
import CategoryScroller from '../components/home/CategoryScroller';
import HomeLoyaltyCard from '../components/home/HomeLoyaltyCard';
import HomeProductSection from '../components/home/HomeProductSection';
import { coerceHomePromoSlides } from '../utils/homePromoSlides';

const formatPrice = (p: number | string | null | undefined) => {
    if (p === null || p === undefined) return 'Rs. 0';
    const num = typeof p === 'string' ? parseFloat(p) : p;
    return `Rs. ${isNaN(num) ? '0' : num.toLocaleString()}`;
};

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
        [categories],
    );

    const mainCategoriesWithProducts = useMemo(
        () => filterCategoriesWithListedProducts(mainCategories, null),
        [mainCategories],
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
                const priceOk = (items: any[]) =>
                    Array.isArray(items) ? items.filter((p) => isMobileCatalogPriceListed(p)) : [];
                setBestSellers(priceOk(bs.items || []));
                setDeals(priceOk(dl.items || []));
                setNewArrivals(priceOk(nw.items || []));
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [shopSlug]);

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
        [dispatch, showToast, state.cart],
    );

    const handleAddOne = useCallback(
        (product: ProductListProduct) => addToCart(product, 1),
        [addToCart],
    );

    const handleChangeQty = useCallback(
        (productId: string, quantity: number) => {
            const merged = [...bestSellers, ...deals, ...newArrivals];
            const product = merged.find((p: any) => p.id === productId);
            if (!product) return;
            const cur = cartQtyMap.get(productId) ?? 0;
            addToCart(product as ProductListProduct, quantity - cur);
        },
        [addToCart, bestSellers, deals, newArrivals, cartQtyMap],
    );

    const submitSearch = useCallback(() => {
        const q = searchDraft.trim();
        if (!shopSlug) return;
        if (q) addRecentSearch(shopSlug, q);
        if (q) navigate(`/${shopSlug}/products?search=${encodeURIComponent(q)}`);
        else navigate(`/${shopSlug}/products`);
    }, [searchDraft, shopSlug, navigate]);

    const promoSlides = useMemo(
        () => coerceHomePromoSlides(state.branding?.home_promo_slides),
        [state.branding?.home_promo_slides],
    );
    const promoIntervalSec = state.branding?.home_promo_interval_seconds ?? 5;
    const deliveryMins = state.settings?.estimated_delivery_minutes || 30;

    const brandName = state.shop?.company_name || state.shop?.name || 'Rewards';

    return (
        <div className="page page--home page--home-compact fade-in">
            <div className="home-search-sticky">
                <GlobalSearchBar
                    variant="home"
                    value={searchDraft}
                    onChange={setSearchDraft}
                    onSubmit={submitSearch}
                    fixedPlaceholder="Search products, brands…"
                    onBarcodeScan={() => navigate(`/${shopSlug}/products`)}
                />
            </div>

            {shopSlug ? (
                <CategoryScroller shopSlug={shopSlug} categories={mainCategoriesWithProducts} />
            ) : null}

            {state.isLoggedIn && shopSlug ? (
                <HomeLoyaltyCard shopSlug={shopSlug} brandName={brandName} loyalty={loyalty} />
            ) : null}

            {shopSlug ? (
                <HomePromoCarousel
                    slides={promoSlides}
                    shopSlug={shopSlug}
                    deliveryMinutes={deliveryMins}
                    intervalSeconds={promoIntervalSec}
                    compact
                />
            ) : null}

            <div className="home-service-strip home-service-strip--compact" aria-label="Service highlights">
                <div className="home-service-strip__item">
                    <span className="home-service-strip__ico" aria-hidden>
                        🚚
                    </span>
                    <span className="home-service-strip__txt">Free Delivery</span>
                </div>
                <div className="home-service-strip__item">
                    <span className="home-service-strip__ico" aria-hidden>
                        🏪
                    </span>
                    <span className="home-service-strip__txt">Easy Return</span>
                </div>
                <div className="home-service-strip__item">
                    <span className="home-service-strip__ico" aria-hidden>
                        🔒
                    </span>
                    <span className="home-service-strip__txt">Secure Pay</span>
                </div>
                <div className="home-service-strip__item">
                    <span className="home-service-strip__ico" aria-hidden>
                        💬
                    </span>
                    <span className="home-service-strip__txt">24/7 Support</span>
                </div>
            </div>

            {loading ? (
                <>
                    {[1, 2, 3].map((s) => (
                        <section key={s} className="home-product-section">
                            <div className="skeleton" style={{ height: 16, width: 120, marginBottom: 8 }} />
                            <div className="home-product-row">
                                {[1, 2, 3, 4, 5].map((i) => (
                                    <div key={i} className="home-product-row__cell">
                                        <div className="skeleton" style={{ height: 210, borderRadius: 10 }} />
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
                </>
            ) : shopSlug ? (
                <>
                    <HomeProductSection
                        title="Best Sellers"
                        items={bestSellers}
                        viewAllQuery="?sortBy=best_selling"
                        shopSlug={shopSlug}
                        cartQtyMap={cartQtyMap}
                        formatPrice={formatPrice}
                        onAddOne={handleAddOne}
                        onChangeQty={handleChangeQty}
                    />
                    <HomeProductSection
                        title="Flash Deals"
                        items={deals}
                        viewAllQuery="?filterDeals=true"
                        shopSlug={shopSlug}
                        cartQtyMap={cartQtyMap}
                        formatPrice={formatPrice}
                        onAddOne={handleAddOne}
                        onChangeQty={handleChangeQty}
                    />
                    <HomeProductSection
                        title="New Arrivals"
                        items={newArrivals}
                        viewAllQuery="?browse=new"
                        shopSlug={shopSlug}
                        cartQtyMap={cartQtyMap}
                        formatPrice={formatPrice}
                        onAddOne={handleAddOne}
                        onChangeQty={handleChangeQty}
                    />
                </>
            ) : null}
        </div>
    );
}
