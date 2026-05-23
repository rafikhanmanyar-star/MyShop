import { useEffect, useState, useMemo, useCallback, memo } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { publicApi, getProductImagePath } from '../api';
import CachedImage from '../components/CachedImage';
import { useOnline } from '../hooks/useOnline';
import { getProductById } from '../services/offlineCache';
import { getSessionProductDetail, setSessionProductDetail } from '../services/productSessionCache';
import { type ProductListProduct } from '../components/ProductListCard';
import RecommendationCard from '../components/RecommendationCard';
import { isMobileCatalogPriceListed } from '../utils/mobileProductPrice';
import { getFavoriteIds, toggleFavoriteId } from '../features/search/favoritesStorage';
import { getRecommendationSubtitle } from '../recommendations/productRecommendationRules';
import type { ProductRecommendationsResponse } from '../recommendations/types';

function detailText(product: any): string | null {
    const raw = product?.description ?? product?.mobile_description ?? '';
    if (typeof raw !== 'string') return null;
    let s = raw.trim();
    if (!s) return null;
    if (s.includes('<')) {
        s = s
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>\s*/gi, '\n\n')
            .replace(/<p[^>]*>/gi, '')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n[ \t]+/g, '\n')
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }
    return s || null;
}

function formatSpecLabel(k: string): string {
    const spaced = k.replace(/_/g, ' ');
    return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

function tagsFromAttributes(attrs: Record<string, unknown> | null): string | null {
    if (!attrs) return null;
    const raw = attrs.tags ?? attrs.Tags;
    if (Array.isArray(raw)) {
        const parts = raw.map((t) => String(t).trim()).filter(Boolean);
        return parts.length ? parts.join(', ') : null;
    }
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    return null;
}

function collectionFromAttributes(attrs: Record<string, unknown> | null): string | null {
    if (!attrs) return null;
    const raw = attrs.collection ?? attrs.Collection;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    return null;
}

const RecRow = memo(function RecRow({
    items,
    shopSlug,
    cartQtyMap,
    formatPrice,
    onAddOne,
    onChangeQty,
}: {
    items: ProductListProduct[];
    shopSlug: string;
    cartQtyMap: Map<string, number>;
    formatPrice: (p: number | string | null | undefined) => string;
    onAddOne: (p: ProductListProduct) => void;
    onChangeQty: (productId: string, quantity: number) => void;
}) {
    return (
        <div className="pdp-rec-row" role="list">
            {items.map((p) => (
                <div key={p.id} className="pdp-rec-row__cell" role="listitem">
                    <RecommendationCard
                        product={p}
                        shopSlug={shopSlug}
                        cartQty={cartQtyMap.get(p.id) ?? 0}
                        formatPrice={formatPrice}
                        onAddOne={onAddOne}
                        onChangeQty={onChangeQty}
                    />
                </div>
            ))}
        </div>
    );
});

export default function ProductDetail() {
    const { shopSlug, id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { dispatch, showToast, state } = useApp();
    const online = useOnline();

    const [product, setProduct] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [qty, setQty] = useState(1);
    const [recs, setRecs] = useState<ProductListProduct[]>([]);
    const [recSubtitle, setRecSubtitle] = useState<string | null>(null);
    const [recBundle, setRecBundle] = useState<ProductRecommendationsResponse['bundle']>(null);
    const [recsLoading, setRecsLoading] = useState(false);
    const [descOpen, setDescOpen] = useState(true);
    const [specsOpen, setSpecsOpen] = useState(true);
    const [isFavorite, setIsFavorite] = useState(false);

    useEffect(() => {
        setQty(1);
    }, [id]);

    useEffect(() => {
        setRecs([]);
        setRecSubtitle(null);
        setRecBundle(null);
    }, [id]);

    useEffect(() => {
        if (!shopSlug || !id) return;
        setIsFavorite(getFavoriteIds(shopSlug).has(id));
    }, [shopSlug, id]);

    useEffect(() => {
        if (!shopSlug || !id) return;
        let cancelled = false;

        const cached = getSessionProductDetail(shopSlug, id) as any;
        if (cached && isMobileCatalogPriceListed(cached)) {
            setProduct(cached);
            setLoading(false);
            return () => {
                cancelled = true;
            };
        }

        setProduct(null);
        setLoading(true);
        (async () => {
            try {
                if (online) {
                    const p = await publicApi.getProduct(shopSlug, id);
                    if (!cancelled) {
                        setSessionProductDetail(shopSlug, id, p);
                        setProduct(p);
                    }
                } else {
                    const p = await getProductById(shopSlug, id);
                    if (!cancelled) {
                        const ok = p && isMobileCatalogPriceListed(p);
                        setProduct(ok ? p : null);
                        if (ok) setSessionProductDetail(shopSlug, id, p!);
                        if (!ok) showToast('Product not found');
                    }
                }
            } catch {
                if (!cancelled) {
                    setProduct(null);
                    showToast('Product not found');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [shopSlug, id, online, showToast]);

    useEffect(() => {
        if (!shopSlug || !id || !product) return;
        let cancelled = false;

        if (!online) {
            setRecs([]);
            return () => {
                cancelled = true;
            };
        }

        setRecsLoading(true);
        publicApi
            .getProductRecommendations(shopSlug, id)
            .then((data: ProductRecommendationsResponse & { items?: ProductListProduct[] }) => {
                const items = Array.isArray(data?.items) ? data.items : [];
                if (!cancelled) {
                    setRecs(items);
                    setRecSubtitle(
                        data?.subtitle ??
                            getRecommendationSubtitle(product.name, product.category_name)
                    );
                    setRecBundle(data?.bundle ?? null);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setRecs([]);
                    setRecSubtitle(getRecommendationSubtitle(product.name, product.category_name));
                    setRecBundle(null);
                }
            })
            .finally(() => {
                if (!cancelled) setRecsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [shopSlug, id, product, online]);

    const formatPrice = useCallback((p: number | string | null | undefined) => {
        if (p === null || p === undefined) return 'Rs. 0';
        const num = typeof p === 'string' ? parseFloat(p) : p;
        return `Rs. ${isNaN(num) ? '0' : num.toLocaleString()}`;
    }, []);

    const stock = useMemo(() => {
        if (!product) return 0;
        const s = product.available_stock ?? product.stock;
        const n = typeof s === 'string' ? parseFloat(s) : Number(s);
        return Number.isFinite(n) ? n : 0;
    }, [product]);

    const isPreOrder = Boolean(product?.is_pre_order);
    const canPurchase = isPreOrder || stock > 0;
    const maxQty = isPreOrder ? 99 : stock;

    const inCart = state.cart.find((i) => i.productId === id);

    const cartQtyMap = useMemo(() => {
        const m = new Map<string, number>();
        state.cart.forEach((i) => m.set(i.productId, i.quantity));
        return m;
    }, [state.cart]);

    const addRecToCart = useCallback(
        (p: ProductListProduct, qtyDelta = 1) => {
            const s = Number(p.stock ?? p.available_stock ?? 0);
            const existing = state.cart.find((i) => i.productId === p.id);
            const nextQty = (existing?.quantity ?? 0) + qtyDelta;
            if (!p.is_pre_order && s > 0 && nextQty > s) {
                showToast(`Only ${s} available`);
                return;
            }
            if (qtyDelta > 0 && !p.is_pre_order && s <= 0) {
                showToast('This product is unavailable');
                return;
            }
            try {
                if (existing) {
                    if (nextQty <= 0) {
                        dispatch({ type: 'REMOVE_FROM_CART', productId: p.id });
                        return;
                    }
                    dispatch({ type: 'UPDATE_QTY', productId: p.id, quantity: nextQty });
                } else if (qtyDelta > 0) {
                    dispatch({
                        type: 'ADD_TO_CART',
                        item: {
                            productId: p.id,
                            name: p.name,
                            sku: p.sku || '',
                            price: p.price,
                            quantity: 1,
                            image_url: getProductImagePath(p),
                            available_stock: s,
                            tax_rate: parseFloat(String(p.tax_rate)) || 0,
                        },
                    });
                }
            } catch (e: any) {
                showToast(e?.message || 'Could not update cart');
            }
        },
        [dispatch, showToast, state.cart]
    );

    const handleRecAddOne = useCallback((p: ProductListProduct) => addRecToCart(p, 1), [addRecToCart]);
    const handleRecChangeQty = useCallback(
        (productId: string, quantity: number) => {
            const p = recs.find((r) => r.id === productId);
            if (!p) return;
            const cur = cartQtyMap.get(productId) ?? 0;
            addRecToCart(p, quantity - cur);
        },
        [recs, cartQtyMap, addRecToCart]
    );

    const handleAdd = useCallback(() => {
        if (!product || !canPurchase) return;
        dispatch({
            type: 'ADD_TO_CART',
            item: {
                productId: product.id,
                name: product.name,
                sku: product.sku,
                price: product.price,
                quantity: qty,
                image_url: getProductImagePath(product),
                available_stock: stock,
                tax_rate: parseFloat(product.tax_rate) || 0,
            },
        });
        showToast(`${product.name} added to cart`);
    }, [product, canPurchase, qty, stock, dispatch, showToast]);

    const handleBundleAddAll = useCallback(() => {
        if (!recBundle?.product_ids?.length) return;
        let added = 0;
        for (const pid of recBundle.product_ids) {
            const p = recs.find((r) => r.id === pid);
            if (p) {
                addRecToCart(p, 1);
                added++;
            }
        }
        if (added > 0) showToast(`${added} items added to cart`);
    }, [recBundle, recs, addRecToCart, showToast]);

    const toggleFavorite = useCallback(() => {
        if (!shopSlug || !id) return;
        const next = toggleFavoriteId(shopSlug, id);
        setIsFavorite(next.has(id));
    }, [shopSlug, id]);

    const goBack = useCallback(() => {
        const from = (location.state as { from?: string } | null)?.from;
        if (from && from.startsWith('/')) {
            navigate(from);
            return;
        }
        if (typeof window !== 'undefined' && window.history.length > 1) {
            navigate(-1);
            return;
        }
        if (shopSlug) navigate(`/${shopSlug}/products`);
    }, [location.state, navigate, shopSlug]);

    const specRows = useMemo(() => {
        if (!product) return [];
        const rows: { label: string; value: string }[] = [];
        const seen = new Set<string>();
        const add = (label: string, value: string | null | undefined) => {
            const v = value != null && String(value).trim() ? String(value).trim() : '';
            if (!v) return;
            const key = label.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            rows.push({ label, value: v });
        };

        add('SKU', product.sku ?? product.sku_code);
        add('Barcode', product.barcode);
        add('Brand', product.brand ?? product.brand_name);
        add('Category', product.category_name);
        add('Subcategory', product.subcategory_name);
        add('Unit', product.unit);
        add('Size', product.size != null ? String(product.size) : null);
        const wu = product.weight_unit != null ? String(product.weight_unit).trim() : null;
        const wr = product.weight;
        const wn =
            wr === null || wr === undefined || wr === ''
                ? null
                : (() => {
                      const n = typeof wr === 'number' ? wr : parseFloat(String(wr));
                      return Number.isFinite(n) ? n : null;
                  })();
        add('Weight', wn != null ? (wu ? `${wn} ${wu}` : String(wn)) : null);
        add('Color', product.color != null ? String(product.color) : null);
        add('Material', product.material != null ? String(product.material) : null);
        add('Country of origin', product.origin_country != null ? String(product.origin_country) : null);

        const rawAttrs =
            product.attributes && typeof product.attributes === 'object' && !Array.isArray(product.attributes)
                ? (product.attributes as Record<string, unknown>)
                : null;
        add('Tags', tagsFromAttributes(rawAttrs));
        add('Collection', collectionFromAttributes(rawAttrs));
        const skipAttrKeys = new Set(
            [
                'brand',
                'sku',
                'barcode',
                'unit',
                'size',
                'weight',
                'color',
                'material',
                'origin',
                'country of origin',
                'tags',
                'collection',
            ].map((s) => s.toLowerCase())
        );
        if (rawAttrs) {
            for (const [k, v] of Object.entries(rawAttrs)) {
                if (v === null || v === undefined) continue;
                const kl = k.toLowerCase().replace(/_/g, ' ');
                if (skipAttrKeys.has(kl)) continue;
                if (Array.isArray(v)) {
                    const parts = v.map((x) => String(x).trim()).filter(Boolean);
                    if (parts.length) add(formatSpecLabel(k), parts.join(', '));
                    continue;
                }
                if (typeof v === 'object') continue;
                add(formatSpecLabel(k), String(v));
            }
        }
        return rows;
    }, [product]);

    if (loading) {
        return (
            <div className="pdp-page fade-in">
                <div className="pdp-skeleton-hero skeleton" />
                <div className="pdp-body">
                    <div className="skeleton" style={{ height: 18, width: '40%', marginBottom: 6 }} />
                    <div className="skeleton" style={{ height: 22, width: '75%', marginBottom: 6 }} />
                    <div className="skeleton" style={{ height: 26, width: '35%' }} />
                </div>
            </div>
        );
    }

    if (!product) {
        return (
            <div className="page fade-in">
                <div className="empty-state">
                    <h3>Product not found</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 8 }}>
                        This item may have been removed or is not available.
                    </p>
                    <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate(-1)}>
                        Go back
                    </button>
                </div>
            </div>
        );
    }

    const desc = detailText(product);
    const descShown = desc ?? 'No description available for this product.';
    const unitVal = product?.unit != null && String(product.unit).trim() !== '' ? String(product.unit).trim() : null;
    const stockStatusLabel =
        !isPreOrder && stock <= 0 ? 'Out of stock' : isPreOrder && stock <= 0 ? 'Pre-order' : 'In stock';
    const cartCount = state.cart.reduce((n, i) => n + i.quantity, 0);
    const bundleTotal =
        recBundle?.total_price ??
        recBundle?.product_ids?.reduce((sum, pid) => {
            const p = recs.find((r) => r.id === pid);
            return sum + (p ? Number(p.price) || 0 : 0);
        }, 0) ??
        0;

    return (
        <div className="pdp-page fade-in">
            <div className="pdp-toolbar">
                <button type="button" className="pdp-toolbar__back" onClick={goBack} aria-label="Go back">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="m12 19-7-7 7-7" />
                        <path d="M19 12H5" />
                    </svg>
                    <span>Back</span>
                </button>
                {shopSlug ? (
                    <Link to={`/${shopSlug}`} className="pdp-toolbar__home">
                        Home
                    </Link>
                ) : null}
            </div>
            <div className="pdp-body">
                {/* Product hero — compact side-by-side on wider phones */}
                <section className="pdp-hero" aria-label="Product overview">
                    <div className="pdp-hero__media">
                        <CachedImage
                            path={getProductImagePath(product)}
                            alt={product.name}
                            fallbackLabel={product.name}
                            fallbackClassName="product-detail-image-fallback"
                        />
                        <button
                            type="button"
                            className={`pdp-hero__fav ${isFavorite ? 'pdp-hero__fav--on' : ''}`}
                            aria-label={isFavorite ? 'Remove from wishlist' : 'Add to wishlist'}
                            onClick={toggleFavorite}
                        >
                            {isFavorite ? '♥' : '♡'}
                        </button>
                    </div>

                    <div className="pdp-hero__info">
                        {product.category_name ? (
                            <span className="pdp-chip pdp-chip--category">{product.category_name}</span>
                        ) : null}
                        <h1 className="pdp-title">{product.name}</h1>
                        <div className="pdp-price">{formatPrice(product.price)}</div>
                        {parseFloat(String(product.tax_rate ?? 0)) > 0 && (
                            <span className="pdp-tax">+{product.tax_rate}% tax</span>
                        )}
                        {unitVal ? <span className="pdp-chip">Unit: {unitVal}</span> : null}
                        <div className={`pdp-stock ${canPurchase ? 'pdp-stock--ok' : 'pdp-stock--out'}`}>
                            <span className="pdp-stock__dot" aria-hidden />
                            {stockStatusLabel}
                            {canPurchase && stock > 0 ? (
                                <span className="pdp-stock__qty"> · {Math.floor(stock)} available</span>
                            ) : null}
                        </div>
                    </div>
                </section>

                {/* Product information — collapsible, compact */}
                <section className="pdp-info" aria-label="Product information">
                    <button
                        type="button"
                        className="pdp-info__toggle"
                        aria-expanded={descOpen ? 'true' : 'false'}
                        onClick={() => setDescOpen((v) => !v)}
                    >
                        <span>Description</span>
                        <span aria-hidden>{descOpen ? '−' : '+'}</span>
                    </button>
                    {descOpen ? (
                        <p className={`pdp-desc ${desc ? '' : 'pdp-desc--empty'}`}>{descShown}</p>
                    ) : null}

                    <button
                        type="button"
                        className="pdp-info__toggle"
                        aria-expanded={specsOpen ? 'true' : 'false'}
                        onClick={() => setSpecsOpen((v) => !v)}
                    >
                        <span>Specifications</span>
                        <span aria-hidden>{specsOpen ? '−' : '+'}</span>
                    </button>
                    {specsOpen ? (
                        specRows.length > 0 ? (
                            <dl className="pdp-specs">
                                {specRows.map((row, i) => (
                                    <div key={`spec-${i}-${row.label}`} className="pdp-specs__row">
                                        <dt>{row.label}</dt>
                                        <dd>{row.value}</dd>
                                    </div>
                                ))}
                            </dl>
                        ) : (
                            <p className="pdp-desc pdp-desc--empty">No additional specifications for this product.</p>
                        )
                    ) : null}
                </section>

                {inCart ? (
                    <p className="pdp-in-cart">✓ {inCart.quantity} already in cart</p>
                ) : null}

                {/* Frequently bought together — primary focus below details */}
                {recsLoading ? (
                    <div className="pdp-rec-section">
                        <div className="skeleton" style={{ height: 16, width: '55%', marginBottom: 8 }} />
                        <div className="skeleton" style={{ height: 120, width: '100%', borderRadius: 10 }} />
                    </div>
                ) : null}

                {!recsLoading && recs.length > 0 && shopSlug ? (
                    <section className="pdp-rec-section" aria-label="Frequently bought together">
                        <div className="pdp-rec-section__head">
                            <div>
                                <h2 className="pdp-rec-section__title">Frequently Bought Together</h2>
                                {recSubtitle ? <p className="pdp-rec-section__sub">{recSubtitle}</p> : null}
                            </div>
                            <Link to={`/${shopSlug}/products`} className="pdp-rec-section__link">
                                View all
                            </Link>
                        </div>

                        {recBundle && recBundle.product_ids.length >= 3 ? (
                            <div className="pdp-bundle">
                                <span className="pdp-bundle__title">{recBundle.title}</span>
                                <button type="button" className="pdp-bundle__add" onClick={handleBundleAddAll}>
                                    Add all · {formatPrice(bundleTotal)}
                                </button>
                            </div>
                        ) : null}

                        <RecRow
                            items={recs}
                            shopSlug={shopSlug}
                            cartQtyMap={cartQtyMap}
                            formatPrice={formatPrice}
                            onAddOne={handleRecAddOne}
                            onChangeQty={handleRecChangeQty}
                        />
                    </section>
                ) : null}
            </div>

            {/* Sticky add-to-cart — compact, above bottom nav */}
            {canPurchase ? (
                <div className="pdp-sticky-bar" role="region" aria-label="Add to cart">
                    <div className="pdp-sticky-bar__qty">
                        <button type="button" aria-label="Decrease quantity" onClick={() => setQty(Math.max(1, qty - 1))}>
                            −
                        </button>
                        <span>{qty}</span>
                        <button type="button" aria-label="Increase quantity" onClick={() => setQty(Math.min(maxQty, qty + 1))}>
                            +
                        </button>
                    </div>
                    <button type="button" className="pdp-sticky-bar__cta" onClick={handleAdd}>
                        + Add {formatPrice(Number(product.price) * qty)}
                    </button>
                    {cartCount > 0 && shopSlug ? (
                        <Link to={`/${shopSlug}/cart`} className="pdp-sticky-bar__cart" aria-label="View cart">
                            🛒
                        </Link>
                    ) : null}
                </div>
            ) : (
                <div className="pdp-sticky-bar pdp-sticky-bar--disabled" role="status">
                    Not available to add right now
                </div>
            )}
        </div>
    );
}
