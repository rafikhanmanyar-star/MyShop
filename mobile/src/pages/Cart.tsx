import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { customerApi } from '../api';
import CachedImage from '../components/CachedImage';
import { useOnline } from '../hooks/useOnline';
import { haversineDistanceKm, estimatedDeliveryRangeMinutes } from '../utils/deliveryLocation';

function parseProfileCoord(v: unknown): number | null {
    if (v == null) return null;
    const n = parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
}

export default function Cart() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const { state, dispatch, cartTotal, cartTax, cartCount } = useApp();
    const online = useOnline();
    const [etaLine, setEtaLine] = useState<string | null>(null);

    const formatPrice = (p: number | string | null | undefined) => {
        if (p === null || p === undefined) return 'Rs. 0';
        const num = typeof p === 'string' ? parseFloat(p) : p;
        return `Rs. ${isNaN(num) ? '0' : num.toLocaleString()}`;
    };

    const deliveryFee = state.settings?.delivery_fee || 0;
    const freeAbove = state.settings?.free_delivery_above;
    const actualDelivery = freeAbove && cartTotal >= freeAbove ? 0 : deliveryFee;
    const tax = cartTax;
    const grandTotal = cartTotal + tax + actualDelivery;

    const handleCheckout = () => {
        if (state.settings?.minimum_order_amount && cartTotal < state.settings.minimum_order_amount) {
            return;
        }
        if (!state.isLoggedIn) {
            navigate(`/${shopSlug}/login?redirect=checkout`);
        } else {
            navigate(`/${shopSlug}/checkout`);
        }
    };

    const handleRemoveFromCart = (productId: string) => {
        dispatch({ type: 'REMOVE_FROM_CART', productId });
    };

    const openProductDetail = (productId: string) => {
        if (!shopSlug) return;
        navigate(`/${shopSlug}/products/${productId}`);
    };

    const openOfferDetail = (offerId: string) => {
        if (!shopSlug) return;
        navigate(`/${shopSlug}/offers/${offerId}`);
    };

    const shopFallbackMins = state.settings?.estimated_delivery_minutes;

    useEffect(() => {
        const area = state.shop?.delivery_area;
        const setFromFallback = () => {
            if (shopFallbackMins != null && shopFallbackMins > 0) {
                setEtaLine(`~${shopFallbackMins} min`);
            } else {
                setEtaLine(null);
            }
        };
        if (!area) {
            setFromFallback();
            return;
        }
        if (!state.isLoggedIn || !online) {
            setFromFallback();
            return;
        }
        let cancelled = false;
        customerApi
            .getProfile()
            .then(
                (profile: { lat?: unknown; lng?: unknown }) => {
                    if (cancelled) return;
                    const lat = parseProfileCoord(profile.lat);
                    const lng = parseProfileCoord(profile.lng);
                    if (lat == null || lng == null) {
                        setFromFallback();
                        return;
                    }
                    const km = haversineDistanceKm(lat, lng, area.branch_latitude, area.branch_longitude);
                    const { min, max } = estimatedDeliveryRangeMinutes(km);
                    if (min === max) {
                        setEtaLine(`~${min} min`);
                    } else {
                        setEtaLine(`${min}–${max} min`);
                    }
                }
            )
            .catch(() => {
                if (!cancelled) setFromFallback();
            });
        return () => {
            cancelled = true;
        };
    }, [
        state.shop?.delivery_area,
        state.isLoggedIn,
        online,
        shopFallbackMins,
    ]);

    const isEmpty = state.cart.length === 0 && state.offerBundles.length === 0;

    if (isEmpty) {
        return (
            <div className="page fade-in">
                <div className="empty-state">
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></svg>
                    <h3>Your cart is empty</h3>
                    <p>Browse products and add items to get started</p>
                    <button className="btn btn-primary" onClick={() => navigate(`/${shopSlug}/products`)}>
                        Browse Products
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="page slide-up">
            <div style={{
                background: 'white', borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-light)', padding: '0', marginBottom: 16, overflow: 'hidden',
            }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '12px 16px 8px',
                        borderBottom: '1px solid var(--border-light)',
                    }}
                >
                    <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3, margin: 0, lineHeight: 1.2 }}>
                        Cart ({cartCount})
                    </h1>
                    {etaLine && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 5,
                                flexShrink: 0,
                                maxWidth: '55%',
                                textAlign: 'right',
                            }}
                            title="Based on your saved address and bike travel, plus 15 min for packing"
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                aria-hidden
                                style={{ color: 'var(--text-muted)', flexShrink: 0 }}
                            >
                                <circle cx="12" cy="12" r="9" />
                                <path d="M12 7v5l3 2" />
                            </svg>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #1a1a1a)' }}>
                                Est. {etaLine}
                            </span>
                        </div>
                    )}
                </div>
                <div style={{ padding: '4px 16px' }}>
                {state.offerBundles.map(o => {
                    const line = (o.merchandisePerBundle + o.taxPerBundle) * o.quantity;
                    return (
                        <div
                            key={o.offerId}
                            className="cart-item cart-item--navigable"
                            style={{ borderLeft: '3px solid var(--primary)' }}
                            onClick={() => openOfferDetail(o.offerId)}
                        >
                            <div className="item-image" style={{
                                background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 12,
                            }}>
                                %
                            </div>
                            <div className="item-details">
                                <div className="item-name">{o.title}</div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginTop: 4 }}>
                                    Offer applied · {o.discountBadge}
                                </div>
                                <div className="item-price">{formatPrice(line)}</div>
                                <button
                                    type="button"
                                    className="cart-item-remove"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        dispatch({ type: 'REMOVE_OFFER_BUNDLE', offerId: o.offerId });
                                    }}
                                >
                                    Remove
                                </button>
                            </div>
                            <div className="qty-controls" onClick={(e) => e.stopPropagation()}>
                                <button
                                    type="button"
                                    onClick={() => o.quantity === 1
                                        ? dispatch({ type: 'REMOVE_OFFER_BUNDLE', offerId: o.offerId })
                                        : dispatch({ type: 'UPDATE_OFFER_QTY', offerId: o.offerId, quantity: o.quantity - 1 })
                                    }
                                >
                                    {o.quantity === 1 ? '🗑' : '−'}
                                </button>
                                <span>{o.quantity}</span>
                                <button
                                    type="button"
                                    onClick={() => dispatch({ type: 'UPDATE_OFFER_QTY', offerId: o.offerId, quantity: o.quantity + 1 })}
                                >+</button>
                            </div>
                        </div>
                    );
                })}
                {state.cart.map(item => (
                    <div
                        key={item.productId}
                        className="cart-item cart-item--navigable"
                        onClick={() => openProductDetail(item.productId)}
                    >
                        <div className="item-image">
                            <CachedImage
                                path={item.image_url}
                                alt={item.name}
                                fallbackLabel={item.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius)' }}
                            />
                        </div>
                        <div className="item-details">
                            <div className="item-name">{item.name}</div>
                            <div className="item-price">{formatPrice(item.price * item.quantity)}</div>
                            <button
                                type="button"
                                className="cart-item-remove"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveFromCart(item.productId);
                                }}
                                aria-label={`Remove ${item.name} from cart`}
                            >
                                Remove
                            </button>
                        </div>
                        <div className="qty-controls" onClick={(e) => e.stopPropagation()}>
                            <button
                                type="button"
                                onClick={() => item.quantity === 1
                                    ? handleRemoveFromCart(item.productId)
                                    : dispatch({ type: 'UPDATE_QTY', productId: item.productId, quantity: item.quantity - 1 })
                                }
                                aria-label={item.quantity === 1 ? 'Remove from cart' : 'Decrease quantity'}
                            >
                                {item.quantity === 1 ? '🗑' : '−'}
                            </button>
                            <span>{item.quantity}</span>
                            <button
                                type="button"
                                onClick={() => dispatch({ type: 'UPDATE_QTY', productId: item.productId, quantity: item.quantity + 1 })}
                                disabled={item.quantity >= item.available_stock}
                                aria-label="Increase quantity"
                            >+</button>
                        </div>
                    </div>
                ))}
                </div>
            </div>

            <div style={{
                background: 'white', borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-light)', padding: 16, marginBottom: 16,
            }}>
                <div className="summary-row">
                    <span>Subtotal</span>
                    <span>{formatPrice(Math.round(cartTotal * 100) / 100)}</span>
                </div>
                {tax > 0 && (
                    <div className="summary-row">
                        <span>Tax</span>
                        <span>{formatPrice(Math.round(tax * 100) / 100)}</span>
                    </div>
                )}
                <div className="summary-row">
                    <span>Delivery</span>
                    <span>
                        {actualDelivery === 0
                            ? <span style={{ color: 'var(--accent)', fontWeight: 600 }}>FREE</span>
                            : formatPrice(actualDelivery)
                        }
                    </span>
                </div>
                <div className="summary-row total">
                    <span>Total</span>
                    <span>{formatPrice(Math.round(grandTotal * 100) / 100)}</span>
                </div>
            </div>

            {state.settings?.minimum_order_amount && cartTotal < state.settings.minimum_order_amount && (
                <p style={{
                    textAlign: 'center', fontSize: 13, color: 'var(--warning)',
                    fontWeight: 600, marginBottom: 12,
                }}>
                    Minimum order: {formatPrice(state.settings.minimum_order_amount)}
                </p>
            )}

            <button
                className="btn btn-primary btn-full"
                onClick={handleCheckout}
                disabled={state.settings?.minimum_order_amount ? cartTotal < state.settings.minimum_order_amount : false}
                style={{ padding: '16px', fontSize: 16, borderRadius: 'var(--radius-lg)' }}
            >
                Proceed to Checkout — {formatPrice(Math.round(grandTotal * 100) / 100)}
            </button>
        </div>
    );
}
