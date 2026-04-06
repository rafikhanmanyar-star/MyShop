import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { customerApi } from '../api';
import { useOnline } from '../hooks/useOnline';
import { placeOrderOfflineFirst } from '../services/orderSyncService';

type PaymentChoice = 'COD' | 'SelfCollection' | 'EasypaisaJazzcashOnline';

export default function Checkout() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const { state, dispatch, cartTotal, cartTax, showToast } = useApp();
    const online = useOnline();

    const [address, setAddress] = useState('');
    const [notes, setNotes] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<PaymentChoice>('COD');
    const [loading, setLoading] = useState(false);
    const defaultAddressFetched = useRef(false);

    // Populate delivery address with user's default address from registration (only when online)
    useEffect(() => {
        if (!online || !state.customerId || defaultAddressFetched.current) return;
        defaultAddressFetched.current = true;
        customerApi.getProfile()
            .then((profile: { address_line1?: string; address_line2?: string; city?: string; postal_code?: string }) => {
                const parts = [
                    profile.address_line1,
                    profile.address_line2,
                    profile.city,
                    profile.postal_code,
                ].filter(Boolean);
                const defaultAddr = parts.join(', ').trim();
                if (defaultAddr) setAddress(defaultAddr);
            })
            .catch(() => {});
    }, [online, state.customerId]);

    const deliveryFee = state.settings?.delivery_fee || 0;
    const freeAbove = state.settings?.free_delivery_above;
    const isPickup = paymentMethod === 'SelfCollection';
    const actualDelivery = isPickup
        ? 0
        : (freeAbove && cartTotal >= freeAbove ? 0 : deliveryFee);
    const tax = cartTax;
    const grandTotal = cartTotal + tax + actualDelivery;

    const formatPrice = (p: number | string | null | undefined) => {
        if (p === null || p === undefined) return 'Rs. 0';
        const num = typeof p === 'string' ? parseFloat(p) : p;
        return `Rs. ${isNaN(num) ? '0' : num.toLocaleString()}`;
    };

    const selfCollectionAddress = () => {
        const branch = state.shop?.branchName || state.shop?.company_name || 'the branch';
        const loc = state.shop?.address ? ` ${state.shop.address}` : '';
        return `Self collection — ${branch}.${loc}`.trim();
    };

    const handlePlaceOrder = async () => {
        if (!isPickup && !address.trim()) {
            showToast('Please enter your delivery address');
            return;
        }

        setLoading(true);
        try {
            const idempotencyKey = `order_${state.customerId ?? 'guest'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const deliveryAddress = isPickup ? selfCollectionAddress() : address.trim();
            const payload = {
                items: state.cart.map(i => ({ productId: i.productId, quantity: i.quantity })),
                offerBundles: state.offerBundles.map(o => ({ offerId: o.offerId, quantity: o.quantity })),
                deliveryAddress,
                deliveryNotes: notes || undefined,
                paymentMethod,
                idempotencyKey,
                ...(state.branchId ? { branchId: state.branchId } : {}),
            };

            const result = await placeOrderOfflineFirst(shopSlug!, payload);

            if (result.synced && result.orderId) {
                dispatch({ type: 'CLEAR_CART' });
                const q =
                    paymentMethod === 'SelfCollection'
                        ? '?pickup=1'
                        : paymentMethod === 'EasypaisaJazzcashOnline'
                          ? '?online=1'
                          : '';
                navigate(`/${shopSlug}/order-confirmed/${result.orderId}${q}`, { replace: true });
            } else if (result.localId) {
                dispatch({ type: 'CLEAR_CART' });
                showToast('Order saved. We\'ll send it when you\'re back online.');
                navigate(`/${shopSlug}`, { replace: true });
            } else {
                showToast(result.error || 'Failed to place order');
            }
        } catch (err: any) {
            showToast(err.message || 'Failed to place order');
        } finally {
            setLoading(false);
        }
    };

    const canSubmit = isPickup || address.trim().length > 0;

    if (state.cart.length === 0 && state.offerBundles.length === 0) {
        navigate(`/${shopSlug}/cart`, { replace: true });
        return null;
    }

    const optionCard = (active: boolean) => ({
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '12px', background: 'var(--bg)', borderRadius: 'var(--radius)',
        border: active ? '2px solid var(--primary)' : '1px solid var(--border-light)',
        cursor: 'pointer',
        textAlign: 'left' as const,
        width: '100%',
    });

    return (
        <div className="page slide-up">
            <div className="page-header">
                <button onClick={() => navigate(-1)} style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
                </button>
                <h1>Checkout</h1>
            </div>

            {/* Payment / fulfillment — choose before address so copy matches */}
            <div style={{
                background: 'white', borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-light)', padding: 16, marginBottom: 16,
            }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>💳 How do you want to receive your order?</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button type="button" onClick={() => setPaymentMethod('COD')} style={optionCard(paymentMethod === 'COD')}>
                        <div style={{
                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                            border: '2px solid var(--primary)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                        }}>
                            {paymentMethod === 'COD' && (
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--primary)' }} />
                            )}
                        </div>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>Cash on delivery</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                We deliver to your address. Pay when the order arrives.
                            </div>
                        </div>
                    </button>
                    <button type="button" onClick={() => setPaymentMethod('EasypaisaJazzcashOnline')} style={optionCard(paymentMethod === 'EasypaisaJazzcashOnline')}>
                        <div style={{
                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                            border: '2px solid var(--primary)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                        }}>
                            {paymentMethod === 'EasypaisaJazzcashOnline' && (
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--primary)' }} />
                            )}
                        </div>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>Easypaisa/Jazzcash/Online</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                We deliver to your address. Pay online via Easypaisa, Jazzcash, or bank transfer before delivery (the shop will share payment details).
                            </div>
                        </div>
                    </button>
                    <button type="button" onClick={() => setPaymentMethod('SelfCollection')} style={optionCard(paymentMethod === 'SelfCollection')}>
                        <div style={{
                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                            border: '2px solid var(--primary)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                        }}>
                            {paymentMethod === 'SelfCollection' && (
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--primary)' }} />
                            )}
                        </div>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>Self collection</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                The branch will pack your items. You visit the branch, pay the bill, and collect your order.
                            </div>
                        </div>
                    </button>
                </div>
            </div>

            {isPickup ? (
                <div style={{
                    background: 'white', borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border-light)', padding: 16, marginBottom: 16,
                }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>🏪 Pickup</h3>
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        No delivery fee. When your order is ready, come to the branch to pay and pick up your items.
                    </p>
                    {(state.shop?.branchName || state.shop?.address) && (
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 10 }}>
                            {state.shop?.branchName && <strong>{state.shop.branchName}</strong>}
                            {state.shop?.address && (
                                <span>{state.shop.branchName ? ' · ' : ''}{state.shop.address}</span>
                            )}
                        </p>
                    )}
                    <div className="input-group" style={{ marginTop: 14, marginBottom: 0 }}>
                        <label>Notes for the shop (optional)</label>
                        <input
                            className="input"
                            type="text"
                            placeholder="e.g. Call me when ready"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                        />
                    </div>
                </div>
            ) : (
                <div style={{
                    background: 'white', borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border-light)', padding: 16, marginBottom: 16,
                }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>📍 Delivery Address</h3>
                    <textarea
                        className="input"
                        placeholder="Enter your full delivery address"
                        rows={3}
                        value={address}
                        onChange={e => setAddress(e.target.value)}
                        style={{ resize: 'none' }}
                    />
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                        Your default address from registration is shown. You can edit it for this order.
                    </p>

                    <div className="input-group" style={{ marginTop: 12, marginBottom: 0 }}>
                        <label>Delivery Notes (optional)</label>
                        <input
                            className="input"
                            type="text"
                            placeholder="e.g. Ring the bell, leave at door"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                        />
                    </div>
                </div>
            )}

            {/* Order Summary */}
            <div style={{
                background: 'white', borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-light)', padding: 16, marginBottom: 16,
            }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>🧾 Order Summary</h3>

                {state.cart.map(item => (
                    <div key={item.productId} style={{
                        display: 'flex', justifyContent: 'space-between', padding: '6px 0',
                        fontSize: 14, color: 'var(--text-secondary)',
                    }}>
                        <span>{item.name} × {item.quantity}</span>
                        <span style={{ fontWeight: 600 }}>{formatPrice(item.price * item.quantity)}</span>
                    </div>
                ))}

                <div style={{ borderTop: '1px solid var(--border-light)', marginTop: 8, paddingTop: 8 }}>
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
                        <span>{isPickup ? 'Pickup' : 'Delivery'}</span>
                        <span>
                            {actualDelivery === 0
                                ? <span style={{ color: 'var(--accent)' }}>FREE</span>
                                : formatPrice(actualDelivery)}
                        </span>
                    </div>
                    <div className="summary-row total">
                        <span>Total</span>
                        <span>{formatPrice(Math.round(grandTotal * 100) / 100)}</span>
                    </div>
                </div>
            </div>

            {/* ETA — home delivery only */}
            {!isPickup && state.settings?.estimated_delivery_minutes && (
                <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                    🕐 Estimated delivery in {state.settings.estimated_delivery_minutes} minutes
                </p>
            )}

            {/* Place Order */}
            {!online && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, textAlign: 'center' }}>
                    Order will be saved and sent when you're back online.
                </p>
            )}
            <button
                className="btn btn-primary btn-full"
                onClick={handlePlaceOrder}
                disabled={loading || !canSubmit}
                style={{ padding: 16, fontSize: 16, borderRadius: 'var(--radius-lg)' }}
            >
                {loading ? (
                    <><span className="spinner" style={{ width: 20, height: 20 }} /> Placing Order...</>
                ) : online ? (
                    `Place Order — ${formatPrice(Math.round(grandTotal * 100) / 100)}`
                ) : (
                    `Save for when online — ${formatPrice(Math.round(grandTotal * 100) / 100)}`
                )}
            </button>
        </div>
    );
}
