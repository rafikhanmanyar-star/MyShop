import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { customerApi } from '../api';
import { useOnline } from '../hooks/useOnline';
import { placeOrderOfflineFirst } from '../services/orderSyncService';
import { getCurrentGeoPosition, reverseGeocodeApprox } from '../utils/deliveryLocation';
import GoogleMapPickerModal from '../components/GoogleMapPickerModal';

type PaymentChoice = 'COD' | 'SelfCollection' | 'EasypaisaJazzcashOnline';
type DeliveryAddressChoice = 'permanent' | 'current';

export default function Checkout() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const { state, dispatch, cartTotal, cartTax, showToast, refreshLoyalty } = useApp();
    const online = useOnline();

    const [address, setAddress] = useState('');
    const [deliveryAddressType, setDeliveryAddressType] = useState<DeliveryAddressChoice>('permanent');
    const deliveryAddressTypeRef = useRef<DeliveryAddressChoice>('permanent');
    const [notes, setNotes] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<PaymentChoice>('COD');
    const [loading, setLoading] = useState(false);
    const [deliveryLat, setDeliveryLat] = useState<number | null>(null);
    const [deliveryLng, setDeliveryLng] = useState<number | null>(null);
    const [locating, setLocating] = useState(false);
    const [mapOpen, setMapOpen] = useState(false);
    const defaultAddressFetched = useRef(false);
    const permanentAddressRef = useRef('');

    const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

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
                permanentAddressRef.current = defaultAddr;
                if (deliveryAddressTypeRef.current === 'permanent') {
                    setAddress(defaultAddr);
                }
            })
            .catch(() => {});
    }, [online, state.customerId]);

    useEffect(() => {
        if (paymentMethod === 'SelfCollection') {
            setDeliveryLat(null);
            setDeliveryLng(null);
        }
    }, [paymentMethod]);

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

    const clearDeliveryPin = () => {
        setDeliveryLat(null);
        setDeliveryLng(null);
    };

    const setDeliveryAddressTypeChoice = (choice: DeliveryAddressChoice) => {
        deliveryAddressTypeRef.current = choice;
        setDeliveryAddressType(choice);
        if (choice === 'permanent') {
            setMapOpen(false);
            setAddress(permanentAddressRef.current);
            setDeliveryLat(null);
            setDeliveryLng(null);
        } else {
            setAddress('');
            setDeliveryLat(null);
            setDeliveryLng(null);
        }
    };

    const handleUseGps = async () => {
        setLocating(true);
        try {
            const pos = await getCurrentGeoPosition();
            setDeliveryLat(pos.latitude);
            setDeliveryLng(pos.longitude);
            const approx = await reverseGeocodeApprox(pos.latitude, pos.longitude);
            if (approx) setAddress(approx);
            else if (!address.trim()) setAddress(`${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}`);
            showToast('Location captured');
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : 'Could not get location');
        } finally {
            setLocating(false);
        }
    };

    const handlePlaceOrder = async () => {
        if (!isPickup && deliveryAddressType === 'current' && (!address.trim() || deliveryLat == null || deliveryLng == null)) {
            showToast('Please set your current location with GPS or the map');
            return;
        }
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
                ...(!isPickup &&
                deliveryLat != null &&
                deliveryLng != null &&
                Number.isFinite(deliveryLat) &&
                Number.isFinite(deliveryLng)
                    ? { deliveryLat, deliveryLng }
                    : {}),
            };

            const result = await placeOrderOfflineFirst(shopSlug!, payload);

            if (result.synced && result.orderId) {
                dispatch({ type: 'CLEAR_CART' });
                void refreshLoyalty({ force: true });
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

    const canSubmit =
        isPickup ||
        (deliveryAddressType === 'current'
            ? address.trim().length > 0 &&
              deliveryLat != null &&
              deliveryLng != null &&
              Number.isFinite(deliveryLat) &&
              Number.isFinite(deliveryLng)
            : address.trim().length > 0);

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

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                        <button
                            type="button"
                            onClick={() => setDeliveryAddressTypeChoice('permanent')}
                            style={optionCard(deliveryAddressType === 'permanent')}
                        >
                            <div style={{
                                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                                border: '2px solid var(--primary)', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                            }}>
                                {deliveryAddressType === 'permanent' && (
                                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--primary)' }} />
                                )}
                            </div>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 14 }}>Permanent address</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                    Deliver to the address saved on your account. You can edit it below for this order only.
                                </div>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => setDeliveryAddressTypeChoice('current')}
                            style={optionCard(deliveryAddressType === 'current')}
                        >
                            <div style={{
                                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                                border: '2px solid var(--primary)', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                            }}>
                                {deliveryAddressType === 'current' && (
                                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--primary)' }} />
                                )}
                            </div>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 14 }}>Current address</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                    Deliver where you are now. Use GPS or the map to set your location and address.
                                </div>
                            </div>
                        </button>
                    </div>

                    <textarea
                        className="input"
                        placeholder={
                            deliveryAddressType === 'permanent'
                                ? 'Enter your full delivery address'
                                : 'Address will be filled from your location, or type it here'
                        }
                        rows={3}
                        value={address}
                        onChange={e => setAddress(e.target.value)}
                        style={{ resize: 'none' }}
                    />
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                        {deliveryAddressType === 'permanent'
                            ? 'Your default address from registration is shown. You can edit it for this order.'
                            : 'Tap “Use my location” or “Choose on map” to set your current delivery point. You can adjust the address text if needed.'}
                    </p>

                    <div
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 8,
                            marginTop: 12,
                            alignItems: 'center',
                        }}
                    >
                        <button
                            type="button"
                            className="btn"
                            onClick={() => void handleUseGps()}
                            disabled={locating || deliveryAddressType === 'permanent'}
                            style={{ fontSize: 13, padding: '8px 12px' }}
                        >
                            {locating ? 'Getting location…' : 'Use my location'}
                        </button>
                        {mapsApiKey ? (
                            <button
                                type="button"
                                className="btn"
                                onClick={() => setMapOpen(true)}
                                disabled={deliveryAddressType === 'permanent'}
                                style={{ fontSize: 13, padding: '8px 12px' }}
                            >
                                Choose on map
                            </button>
                        ) : null}
                        {deliveryAddressType === 'current' && deliveryLat != null && deliveryLng != null && (
                            <button
                                type="button"
                                onClick={clearDeliveryPin}
                                style={{
                                    fontSize: 12,
                                    color: 'var(--text-muted)',
                                    background: 'none',
                                    border: 'none',
                                    textDecoration: 'underline',
                                    cursor: 'pointer',
                                    padding: 0,
                                }}
                            >
                                Clear pin
                            </button>
                        )}
                    </div>
                    {deliveryAddressType === 'current' && deliveryLat != null && deliveryLng != null && (
                        <p style={{ fontSize: 12, color: 'var(--accent)', marginTop: 8, marginBottom: 0 }}>
                            Current delivery pin set ({deliveryLat.toFixed(5)}, {deliveryLng.toFixed(5)})
                        </p>
                    )}

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
                    {state.isLoggedIn && (
                        <div className="summary-row" style={{ marginBottom: 6 }}>
                            <span>Available points</span>
                            <span style={{ fontWeight: 700 }}>
                                {state.loyalty.fetchFailed && state.loyalty.totalPoints == null
                                    ? '—'
                                    : (state.loyalty.totalPoints ?? 0).toLocaleString()}
                            </span>
                        </div>
                    )}
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

            {mapsApiKey && !isPickup && (
                <GoogleMapPickerModal
                    apiKey={mapsApiKey}
                    open={mapOpen}
                    initialLat={deliveryLat}
                    initialLng={deliveryLng}
                    onClose={() => setMapOpen(false)}
                    onConfirm={(lat, lng) => {
                        setDeliveryLat(lat);
                        setDeliveryLng(lng);
                        void (async () => {
                            const approx = await reverseGeocodeApprox(lat, lng);
                            if (approx) setAddress(approx);
                            else if (!address.trim()) setAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
                            showToast('Location saved from map');
                        })();
                    }}
                />
            )}
        </div>
    );
}
