import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { publicApi, getProductImagePath } from '../api';
import CachedImage from '../components/CachedImage';
import { useOnline } from '../hooks/useOnline';
import { getProductById } from '../services/offlineCache';
import { getSessionProductDetail, setSessionProductDetail } from '../services/productSessionCache';
import ProductListCard, { type ProductListProduct } from '../components/ProductListCard';
import { isMobileCatalogPriceListed } from '../utils/mobileProductPrice';

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

export default function ProductDetail() {
    const { shopSlug, id } = useParams();
    const navigate = useNavigate();
    const { dispatch, showToast, state } = useApp();
    const online = useOnline();

    const [product, setProduct] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [qty, setQty] = useState(1);
    const [recs, setRecs] = useState<ProductListProduct[]>([]);
    const [recsLoading, setRecsLoading] = useState(false);
    const [specsVisible, setSpecsVisible] = useState(false);

    useEffect(() => {
        setQty(1);
    }, [id]);

    useEffect(() => {
        setRecs([]);
    }, [id]);

    useEffect(() => {
        if (!product) {
            setSpecsVisible(false);
            return;
        }
        setSpecsVisible(false);
        const frame = requestAnimationFrame(() => setSpecsVisible(true));
        return () => cancelAnimationFrame(frame);
    }, [product?.id]);

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
            .then((data: { items?: ProductListProduct[] }) => {
                const items = Array.isArray(data?.items) ? data.items : [];
                if (!cancelled) setRecs(items);
            })
            .catch(() => {
                if (!cancelled) setRecs([]);
            })
            .finally(() => {
                if (!cancelled) setRecsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [shopSlug, id, product, online]);

    const formatPrice = (p: number | string | null | undefined) => {
        if (p === null || p === undefined) return 'Rs. 0';
        const num = typeof p === 'string' ? parseFloat(p) : p;
        return `Rs. ${isNaN(num) ? '0' : num.toLocaleString()}`;
    };

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

    const handleRecAddOne = (p: ProductListProduct) => addRecToCart(p, 1);
    const handleRecChangeQty = (productId: string, quantity: number) => {
        const p = recs.find((r) => r.id === productId);
        if (!p) return;
        const cur = cartQtyMap.get(productId) ?? 0;
        addRecToCart(p, quantity - cur);
    };

    const handleAdd = () => {
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
    };

    const desc = product ? detailText(product) : null;
    const descShown = desc ?? 'No description available for this product.';
    const sizeVal = product?.size != null && String(product.size).trim() !== '' ? String(product.size).trim() : null;
    const weightUnitVal =
        product?.weight_unit != null && String(product.weight_unit).trim() !== ''
            ? String(product.weight_unit).trim()
            : null;
    const weightRaw = product?.weight;
    const weightNum =
        weightRaw === null || weightRaw === undefined || weightRaw === ''
            ? null
            : (() => {
                  const n = typeof weightRaw === 'number' ? weightRaw : parseFloat(String(weightRaw));
                  return Number.isFinite(n) ? n : null;
              })();
    const weightLine =
        weightNum != null ? (weightUnitVal ? `${weightNum} ${weightUnitVal}` : String(weightNum)) : null;
    const unitVal = product?.unit != null && String(product.unit).trim() !== '' ? String(product.unit).trim() : null;
    const brandLine =
        product?.brand != null && String(product.brand).trim() !== '' ? String(product.brand).trim() : null;
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

        const b =
            product.brand != null && String(product.brand).trim() !== '' ? String(product.brand).trim() : null;
        const u = product.unit != null && String(product.unit).trim() !== '' ? String(product.unit).trim() : null;
        const sz = product.size != null && String(product.size).trim() !== '' ? String(product.size).trim() : null;
        const wu =
            product.weight_unit != null && String(product.weight_unit).trim() !== ''
                ? String(product.weight_unit).trim()
                : null;
        const wr = product.weight;
        const wn =
            wr === null || wr === undefined || wr === ''
                ? null
                : (() => {
                      const n = typeof wr === 'number' ? wr : parseFloat(String(wr));
                      return Number.isFinite(n) ? n : null;
                  })();
        const wl = wn != null ? (wu ? `${wn} ${wu}` : String(wn)) : null;

        add('Brand', b);
        add('Unit', u);
        add('Size', sz);
        add('Weight', wl);
        add('Color', product.color != null ? String(product.color) : null);
        add('Material', product.material != null ? String(product.material) : null);
        add('Country of origin', product.origin_country != null ? String(product.origin_country) : null);

        const rawAttrs =
            product.attributes && typeof product.attributes === 'object' && !Array.isArray(product.attributes)
                ? (product.attributes as Record<string, unknown>)
                : null;

        const skipAttrKeys = new Set(
            [
                'brand',
                'sku',
                'sku code',
                'barcode',
                'unit',
                'size',
                'weight',
                'color',
                'material',
                'origin',
                'origin country',
                'country of origin',
            ].map((s) => s.toLowerCase())
        );
        if (rawAttrs) {
            for (const [k, v] of Object.entries(rawAttrs)) {
                if (v === null || v === undefined) continue;
                const kl = k.toLowerCase().replace(/_/g, ' ');
                if (skipAttrKeys.has(kl)) continue;
                add(formatSpecLabel(k), String(v));
            }
        }
        return rows;
    }, [product]);

    if (loading) {
        return (
            <div className="page fade-in">
                <div
                    className="skeleton"
                    style={{ width: '100%', aspectRatio: '1', borderRadius: 'var(--radius-xl)', marginBottom: 20 }}
                />
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
                    <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 8 }}>This item may have been removed or is not available.</p>
                    <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate(-1)}>
                        Go back
                    </button>
                </div>
            </div>
        );
    }

    const stockStatusLabel =
        !isPreOrder && stock <= 0 ? 'Out of stock' : isPreOrder && stock <= 0 ? 'Pre-order' : 'In stock';

    return (
        <div className="page fade-in" style={{ padding: 0, paddingBottom: 'calc(80px + var(--safe-bottom))' }}>
            <div
                style={{
                    width: '100%',
                    aspectRatio: '1',
                    background: 'linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    overflow: 'hidden',
                }}
            >
                <CachedImage
                    path={getProductImagePath(product)}
                    alt={product.name}
                    fallbackLabel={product.name}
                    fallbackClassName="product-detail-image-fallback"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />

                <button
                    type="button"
                    style={{
                        position: 'absolute',
                        top: 12,
                        left: 12,
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.9)',
                        backdropFilter: 'blur(10px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: 'var(--shadow)',
                        border: 'none',
                        cursor: 'pointer',
                    }}
                    onClick={() => navigate(-1)}
                    aria-label="Back"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="m12 19-7-7 7-7" />
                        <path d="M19 12H5" />
                    </svg>
                </button>
            </div>

            <div style={{ padding: '20px 16px 12px' }}>
                <section style={{ marginBottom: 20 }} aria-label="Overview">
                    {product.category_name && (
                        <span
                            style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: 'var(--primary)',
                                background: 'rgba(79,70,229,0.08)',
                                padding: '4px 10px',
                                borderRadius: 'var(--radius-full)',
                                marginBottom: 8,
                                display: 'inline-block',
                            }}
                        >
                            {product.category_name}
                        </span>
                    )}

                    <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, lineHeight: 1.3 }}>{product.name}</h1>
                    {brandLine && (
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, marginTop: 0 }}>{brandLine}</p>
                    )}

                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
                        <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)' }}>{formatPrice(product.price)}</span>
                        {parseFloat(String(product.tax_rate ?? 0)) > 0 && (
                            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>+{product.tax_rate}% tax</span>
                        )}
                    </div>

                    {(sizeVal || weightLine || unitVal) && (
                        <div
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 8,
                                marginBottom: 12,
                            }}
                        >
                            {sizeVal && (
                                <span
                                    style={{
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: 'var(--text-secondary)',
                                        background: 'var(--bg)',
                                        padding: '6px 10px',
                                        borderRadius: 'var(--radius-full)',
                                        border: '1px solid var(--border)',
                                    }}
                                >
                                    Size: {sizeVal}
                                </span>
                            )}
                            {weightLine && (
                                <span
                                    style={{
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: 'var(--text-secondary)',
                                        background: 'var(--bg)',
                                        padding: '6px 10px',
                                        borderRadius: 'var(--radius-full)',
                                        border: '1px solid var(--border)',
                                    }}
                                >
                                    Weight: {weightLine}
                                </span>
                            )}
                            {unitVal && (
                                <span
                                    style={{
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: 'var(--text-secondary)',
                                        background: 'var(--bg)',
                                        padding: '6px 10px',
                                        borderRadius: 'var(--radius-full)',
                                        border: '1px solid var(--border)',
                                    }}
                                >
                                    Unit: {unitVal}
                                </span>
                            )}
                        </div>
                    )}

                    <div
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 12px',
                            borderRadius: 'var(--radius-full)',
                            background: canPurchase ? '#D1FAE5' : '#FEE2E2',
                            color: canPurchase ? '#065F46' : '#991B1B',
                            fontSize: 13,
                            fontWeight: 600,
                            marginBottom: 4,
                        }}
                    >
                        <span
                            style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: canPurchase ? '#10B981' : '#EF4444',
                            }}
                        />
                        {stockStatusLabel}
                        {canPurchase && stock > 0 && (
                            <span style={{ fontWeight: 500, opacity: 0.85 }}> · {Math.floor(stock)} available</span>
                        )}
                    </div>
                </section>

                <section style={{ marginBottom: 22 }} aria-label="Description">
                    <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Description</h2>
                    <p
                        style={{
                            fontSize: 14,
                            lineHeight: 1.6,
                            color: desc ? 'var(--text-secondary)' : 'var(--text-muted)',
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            fontStyle: desc ? 'normal' : 'italic',
                        }}
                    >
                        {descShown}
                    </p>
                </section>

                {specsVisible && specRows.length > 0 && (
                    <section style={{ marginBottom: 22 }} aria-label="Specifications">
                        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Specifications</h2>
                        <dl
                            style={{
                                margin: 0,
                                display: 'grid',
                                gridTemplateColumns: 'auto 1fr',
                                gap: '8px 16px',
                                fontSize: 14,
                                color: 'var(--text-secondary)',
                            }}
                        >
                            {specRows.map((row, i) => (
                                <div key={`spec-${i}-${row.label}`} style={{ display: 'contents' }}>
                                    <dt style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.label}</dt>
                                    <dd style={{ margin: 0, wordBreak: 'break-word' }}>{row.value}</dd>
                                </div>
                            ))}
                        </dl>
                    </section>
                )}

                <section style={{ marginBottom: 24 }} aria-label="Add to cart">
                    <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Add to cart</h2>
                    {canPurchase ? (
                        <div
                            style={{
                                display: 'flex',
                                gap: 12,
                                alignItems: 'center',
                                padding: '16px',
                                background: 'var(--bg)',
                                borderRadius: 'var(--radius-lg)',
                                border: '1px solid var(--border)',
                            }}
                        >
                            <div className="qty-controls">
                                <button type="button" onClick={() => setQty(Math.max(1, qty - 1))}>
                                    −
                                </button>
                                <span>{qty}</span>
                                <button type="button" onClick={() => setQty(Math.min(maxQty, qty + 1))}>
                                    +
                                </button>
                            </div>
                            <button type="button" className="btn btn-primary btn-full" onClick={handleAdd}>
                                + Add to Cart — {formatPrice(Number(product.price) * qty)}
                            </button>
                        </div>
                    ) : (
                        <p
                            style={{
                                margin: 0,
                                padding: '14px 16px',
                                background: 'var(--bg)',
                                borderRadius: 'var(--radius-lg)',
                                border: '1px solid var(--border)',
                                fontSize: 14,
                                color: 'var(--text-muted)',
                                fontWeight: 500,
                            }}
                        >
                            This item is not available to add to your cart right now.
                        </p>
                    )}
                </section>

                {inCart && (
                    <p style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, marginTop: -12, marginBottom: 20, textAlign: 'center' }}>
                        ✓ {inCart.quantity} already in cart
                    </p>
                )}

                {recsLoading && (
                    <div style={{ marginBottom: 16 }} className="skeleton" aria-hidden>
                        <div style={{ height: 18, width: '50%', marginBottom: 12 }} />
                        <div style={{ height: 220, width: '100%', borderRadius: 12 }} />
                    </div>
                )}

                {!recsLoading && recs.length > 0 && shopSlug && (
                    <section style={{ marginBottom: 8 }} aria-label="Similar products">
                        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Similar products</h2>
                        <div className="home-product-row">
                            {recs.map((p) => (
                                <div key={p.id} className="home-product-row__cell">
                                    <ProductListCard
                                        product={p}
                                        shopSlug={shopSlug}
                                        cartQty={cartQtyMap.get(p.id) ?? 0}
                                        formatPrice={formatPrice}
                                        onAddOne={handleRecAddOne}
                                        onChangeQty={handleRecChangeQty}
                                    />
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}
