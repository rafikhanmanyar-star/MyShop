import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getFullImageUrl } from '../api';

export default function Cart() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const { state, dispatch, cartTotal, cartCount } = useApp();

    const formatPrice = (p: number | string | null | undefined) => {
        if (p === null || p === undefined) return 'Rs. 0';
        const num = typeof p === 'string' ? parseFloat(p) : p;
        return `Rs. ${isNaN(num) ? '0' : num.toLocaleString()}`;
    };

    const deliveryFee = state.settings?.delivery_fee || 0;
    const freeAbove = state.settings?.free_delivery_above;
    const actualDelivery = freeAbove && cartTotal >= freeAbove ? 0 : deliveryFee;
    const tax = state.cart.reduce((sum, i) => sum + i.price * i.quantity * (i.tax_rate / 100), 0);
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

    if (state.cart.length === 0) {
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
            <div className="page-header">
                <h1>Cart ({cartCount})</h1>
            </div>

            {/* Cart Items */}
            <div style={{
                background: 'white', borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-light)', padding: '4px 16px', marginBottom: 16,
            }}>
                {state.cart.map(item => (
                    <div key={item.productId} className="cart-item">
                        <div className="item-image">
                            {item.image_url ? (
                                <img src={getFullImageUrl(item.image_url)} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius)' }} />
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /></svg>
                            )}
                        </div>
                        <div className="item-details">
                            <div className="item-name">{item.name}</div>
                            <div className="item-price">{formatPrice(item.price * item.quantity)}</div>
                        </div>
                        <div className="qty-controls">
                            <button onClick={() => dispatch({ type: 'UPDATE_QTY', productId: item.productId, quantity: item.quantity - 1 })}>
                                {item.quantity === 1 ? '🗑' : '−'}
                            </button>
                            <span>{item.quantity}</span>
                            <button
                                onClick={() => dispatch({ type: 'UPDATE_QTY', productId: item.productId, quantity: item.quantity + 1 })}
                                disabled={item.quantity >= item.available_stock}
                            >+</button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Summary */}
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

            {/* Minimum order warning */}
            {state.settings?.minimum_order_amount && cartTotal < state.settings.minimum_order_amount && (
                <p style={{
                    textAlign: 'center', fontSize: 13, color: 'var(--warning)',
                    fontWeight: 600, marginBottom: 12,
                }}>
                    Minimum order: {formatPrice(state.settings.minimum_order_amount)}
                </p>
            )}

            {/* Checkout Button */}
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
