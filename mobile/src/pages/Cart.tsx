import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { customerApi } from '../api';
import CachedImage from '../components/CachedImage';
import VoiceOrderForm from '../components/VoiceOrderForm';
import { useOnline } from '../hooks/useOnline';
import { haversineDistanceKm, estimatedDeliveryRangeMinutes } from '../utils/deliveryLocation';

type OrderMode = 'cart' | 'voice';

function parseProfileCoord(v: unknown): number | null {
    if (v == null) return null;
    const n = parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
}

function OrderModeTabs({ mode, onChange }: { mode: OrderMode; onChange: (m: OrderMode) => void }) {
    return (
        <div className="order-mode-tabs">
            <button
                type="button"
                className={`order-mode-tab ${mode === 'cart' ? 'order-mode-tab--active' : ''}`}
                onClick={() => onChange('cart')}
            >
                <span className="order-mode-tab__icon" aria-hidden>🛒</span>
                <span>Cart order</span>
            </button>
            <button
                type="button"
                className={`order-mode-tab ${mode === 'voice' ? 'order-mode-tab--active' : ''}`}
                onClick={() => onChange('voice')}
            >
                <span className="order-mode-tab__icon" aria-hidden>🎤</span>
                <span>Voice order</span>
            </button>
        </div>
    );
}

export default function Cart() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { state, dispatch, cartTotal, cartTax, cartCount } = useApp();
    const online = useOnline();
    const [searchParams] = useSearchParams();
    const modeFromUrl = searchParams.get('mode') === 'voice' ? 'voice' : 'cart';
    const [orderMode, setOrderMode] = useState<OrderMode>(modeFromUrl);

    useEffect(() => {
        try {
            const stored = sessionStorage.getItem('myshop_cart_order_mode');
            if (stored === 'voice') {
                setOrderMode('voice');
                sessionStorage.removeItem('myshop_cart_order_mode');
            }
        } catch { /* ignore */ }
    }, []);
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
        navigate(`/${shopSlug}/products/${productId}`, { state: { from: location.pathname } });
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

    if (orderMode === 'voice') {
        return (
            <div className="page page--cart slide-up">
                <div className="page-header">
                    <h1>Order</h1>
                    <p className="cart-page-subtitle">
                        Record what you need — no need to add items to cart
                    </p>
                </div>
                <OrderModeTabs mode={orderMode} onChange={setOrderMode} />
                <div className="cart-panel cart-panel--padded">
                    <VoiceOrderForm compact requireLogin onSwitchToCart={() => setOrderMode('cart')} />
                </div>
            </div>
        );
    }

    if (isEmpty) {
        return (
            <div className="page page--cart fade-in">
                <div className="page-header">
                    <h1>Order</h1>
                </div>
                <OrderModeTabs mode={orderMode} onChange={setOrderMode} />
                <div className="empty-state">
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></svg>
                    <h3>Your cart is empty</h3>
                    <p>Add products to cart, or place a voice order below</p>
                    <button type="button" className="btn btn-primary" onClick={() => navigate(`/${shopSlug}/products`)}>
                        Browse products
                    </button>
                </div>
                <div className="cart-voice-hint">
                    <p className="cart-voice-hint__title">Prefer voice?</p>
                    <p className="cart-voice-hint__text">
                        Tap Voice order above to record your list like a WhatsApp message.
                    </p>
                    <button type="button" className="btn btn-primary btn-full" onClick={() => setOrderMode('voice')}>
                        🎤 Place voice order
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="page page--cart slide-up">
            <div className="page-header">
                <h1>Order</h1>
            </div>
            <OrderModeTabs mode={orderMode} onChange={setOrderMode} />

            <div className="cart-panel">
                <div className="cart-panel__header">
                    <h2 className="cart-panel__title">
                        Cart ({cartCount})
                    </h2>
                    {etaLine && (
                        <div
                            className="cart-panel__eta"
                            title="Based on your saved address and bike travel, plus 15 min for packing"
                        >
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                aria-hidden
                            >
                                <circle cx="12" cy="12" r="9" />
                                <path d="M12 7v5l3 2" />
                            </svg>
                            <span>Est. {etaLine}</span>
                        </div>
                    )}
                </div>
                <div className="cart-panel__items">
                {state.offerBundles.map(o => {
                    const line = (o.merchandisePerBundle + o.taxPerBundle) * o.quantity;
                    return (
                        <div
                            key={o.offerId}
                            className="cart-item cart-item--navigable cart-item--offer"
                            onClick={() => openOfferDetail(o.offerId)}
                        >
                            <div className="item-image item-image--offer">
                                %
                            </div>
                            <div className="item-details">
                                <div className="item-name">{o.title}</div>
                                <div className="cart-item__offer-badge">
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

            <div className="cart-panel cart-summary-panel">
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
                            ? <span className="summary-row__free">FREE</span>
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
                <p className="cart-minimum-notice">
                    Minimum order: {formatPrice(state.settings.minimum_order_amount)}
                </p>
            )}

            <button
                className="btn btn-primary btn-full cart-checkout-btn"
                onClick={handleCheckout}
                disabled={state.settings?.minimum_order_amount ? cartTotal < state.settings.minimum_order_amount : false}
            >
                Proceed to Checkout — {formatPrice(Math.round(grandTotal * 100) / 100)}
            </button>
        </div>
    );
}
