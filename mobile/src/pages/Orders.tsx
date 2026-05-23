import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { customerApi } from '../api';
import {
    orderChannel,
    orderChannelLabel,
    orderDetailPath,
    orderStatusLabel,
    statusBadgeClass,
    type OrderHistoryRow,
} from '../utils/orderHistoryLabels';

function formatOrderPaymentMethod(pm: string | undefined): string {
    if (pm === 'SelfCollection') return 'Self collection';
    if (pm === 'COD') return 'Cash on delivery';
    if (pm === 'EasypaisaJazzcashOnline') return 'Easypaisa/Jazzcash/Online';
    return pm || '—';
}

function ChannelBadge({ channel }: { channel: 'cart' | 'voice' }) {
    const isVoice = channel === 'voice';
    return (
        <span
            className={`order-channel-badge ${isVoice ? 'order-channel-voice' : 'order-channel-cart'}`}
            aria-label={`${orderChannelLabel(channel)} order`}
        >
            {isVoice ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <circle cx="9" cy="21" r="1" />
                    <circle cx="20" cy="21" r="1" />
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                </svg>
            )}
            {orderChannelLabel(channel)}
        </span>
    );
}

export default function Orders() {
    const { shopSlug } = useParams();
    const navigate = useNavigate();
    const { state, showToast } = useApp();

    const [orders, setOrders] = useState<OrderHistoryRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [cursor, setCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);

    useEffect(() => {
        if (!state.isLoggedIn) {
            navigate(`/${shopSlug}/login?redirect=orders`, { replace: true });
            return;
        }
        loadOrders();
    }, [state.isLoggedIn]);

    const loadOrders = async (nextCursor?: string) => {
        try {
            const data = await customerApi.getOrders(nextCursor);
            const items = (data.items || []) as OrderHistoryRow[];
            if (nextCursor) {
                setOrders(prev => [...prev, ...items]);
            } else {
                setOrders(items);
            }
            setCursor(data.nextCursor);
            setHasMore(data.hasMore);
        } catch (err: any) {
            showToast(err.message);
        } finally {
            setLoading(false);
        }
    };

    const formatPrice = (p: number | string | null | undefined) => {
        if (p === null || p === undefined) return 'Rs. 0';
        const num = typeof p === 'string' ? parseFloat(p) : p;
        return `Rs. ${isNaN(num) ? '0' : num.toLocaleString()}`;
    };
    const formatDate = (d: string) => new Date(d).toLocaleDateString('en-PK', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    if (loading) {
        return (
            <div className="page fade-in">
                <div className="page-header"><h1>My Orders</h1></div>
                {[1, 2, 3].map(i => (
                    <div key={i} className="skeleton order-history-card-skeleton" />
                ))}
            </div>
        );
    }

    return (
        <div className="page fade-in">
            <div className="page-header">
                <h1>My Orders</h1>
                <p className="orders-page-subtitle">
                    Cart and voice orders in one place
                </p>
            </div>

            {orders.length === 0 ? (
                <div className="empty-state">
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z" /><path d="M15 3v4a2 2 0 0 0 2 2h4" /></svg>
                    <h3>No orders yet</h3>
                    <p>Place a cart order or record a voice order to see it here</p>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
                        <Link to={`/${shopSlug}/products`} className="btn btn-primary">Browse Products</Link>
                        {state.settings?.voice_ordering_enabled !== false && (
                            <Link to={`/${shopSlug}/voice-order`} className="btn btn-outline">Voice order</Link>
                        )}
                    </div>
                </div>
            ) : (
                <div className="orders-list">
                    {orders.map((order) => {
                        const channel = orderChannel(order);
                        const detailPath = orderDetailPath(shopSlug!, order);
                        const isPickupRow = order.payment_method === 'SelfCollection';
                        const pendingInvoice = order.status === 'InvoiceCreated';
                        return (
                        <Link key={`${channel}-${order.id}`} to={detailPath} className="card order-history-card">
                            <div className="order-history-card__top">
                                <div className="order-history-card__main">
                                    <div className="order-history-card__id-row">
                                        <ChannelBadge channel={channel} />
                                        <span className="order-history-card__number">{order.order_number}</span>
                                    </div>
                                    <div className="order-history-card__date">{formatDate(order.created_at)}</div>
                                </div>
                                <span className={`status-badge ${statusBadgeClass(order.status)}`}>
                                    {orderStatusLabel(order)}
                                </span>
                            </div>
                            {!isPickupRow && order.estimated_delivery_at && (
                                <div className="order-history-card__notice order-history-card__notice--delivery">
                                    📅 Requested: {formatDate(order.estimated_delivery_at)}
                                </div>
                            )}
                            {pendingInvoice && (
                                <div className="order-history-card__notice order-history-card__notice--invoice">
                                    Tap to review and approve your invoice
                                </div>
                            )}
                            <div className="order-history-card__footer">
                                <span className="order-history-card__payment">{formatOrderPaymentMethod(order.payment_method)}</span>
                                <span className="order-history-card__total">
                                    {order.grand_total != null
                                        ? formatPrice(order.grand_total)
                                        : channel === 'voice'
                                          ? 'Pending invoice'
                                          : formatPrice(0)}
                                </span>
                            </div>
                            {order.payment_method !== 'SelfCollection' && order.delivery_order_id && order.status === 'OutForDelivery' && (
                                <div className="order-history-card__rider">
                                    🛵 {order.rider_name ? `${order.rider_name} · ` : ''}
                                    {String(order.delivery_status || '').toUpperCase() === 'ON_THE_WAY' ? 'On the way' : 'Out for delivery'}
                                </div>
                            )}
                        </Link>
                        );
                    })}

                    {hasMore && (
                        <button className="btn btn-outline btn-sm" onClick={() => loadOrders(cursor!)}>
                            Load More
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
