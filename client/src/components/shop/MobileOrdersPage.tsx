import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMobileOrders } from '../../context/MobileOrdersContext';
import { mobileOrdersApi, MobileOrder, PosRidersOverview, MobileOnlineUser, MobileUsersStats } from '../../services/mobileOrdersApi';
import { QRCodeSVG } from 'qrcode.react';
import {
    Smartphone, RefreshCw, Package, Truck, Check, X, Clock,
    ChevronRight, WifiOff, Wifi, Bike, CloudUpload,
    Eye, Bell, MapPin, Phone, User, FileText, ShoppingBag,
    Printer, Copy, CheckCircle, Store,
    Banknote, Building2, Wallet, ExternalLink, Navigation, Users,
    ShoppingCart, Activity, UserCheck, Globe, CircleDot, BookOpen, BadgeCheck,
} from 'lucide-react';
import { shopApi } from '../../services/shopApi';
import { getFullImageUrl } from '../../config/apiUrl';
import {
    formatPasswordResetWhatsAppMessage,
    openWhatsAppDesktopWithMessage,
    buildWhatsAppWebSendUrl,
} from '../../utils/whatsappManualSend';
import { MobileOrdersLiveMap } from './MobileOrdersLiveMap';

interface ShopBranchOption {
    id: string;
    name: string;
    code: string;
    location?: string;
}

// ─── Status Config ────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
    Pending: { label: 'Pending', color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 border-amber-200 dark:bg-amber-950/50 dark:border-amber-800', icon: Clock },
    Confirmed: { label: 'Confirmed', color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-50 border-blue-200 dark:bg-blue-950/50 dark:border-blue-800', icon: Check },
    Packed: { label: 'Packed', color: 'text-indigo-700 dark:text-indigo-300', bg: 'bg-indigo-50 border-indigo-200 dark:bg-indigo-950/50 dark:border-indigo-800', icon: Package },
    OutForDelivery: { label: 'Out for Delivery', color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/50 dark:border-emerald-800', icon: Truck },
    Delivered: { label: 'Delivered', color: 'text-green-700 dark:text-green-300', bg: 'bg-green-50 border-green-200 dark:bg-green-950/50 dark:border-green-800', icon: Check },
    Unpaid: { label: 'Unpaid', color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-50 border-orange-200 dark:bg-orange-950/50 dark:border-orange-800', icon: Banknote },
    Cancelled: { label: 'Cancelled', color: 'text-red-700 dark:text-red-300', bg: 'bg-red-50 border-red-200 dark:bg-red-950/50 dark:border-red-800', icon: X },
};

function MobileOrderCustomerVerifiedBadge() {
    return (
        <span
            className="inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-px text-[0.65rem] font-bold uppercase tracking-wide text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 shrink-0"
            title="Mobile customer verified in loyalty"
        >
            <BadgeCheck className="w-3 h-3 shrink-0" aria-hidden />
            Verified
        </span>
    );
}

const NEXT_STATUS: Record<string, string> = {
    Pending: 'Confirmed',
    Confirmed: 'Packed',
    Packed: 'OutForDelivery',
    OutForDelivery: 'Delivered',
};

/** Self-collection orders skip the courier step: Packed → Delivered. */
function getNextMobileOrderStatus(order: Pick<MobileOrder, 'status' | 'payment_method'>): string | undefined {
    if (order.status === 'Packed' && order.payment_method === 'SelfCollection') {
        return 'Delivered';
    }
    return NEXT_STATUS[order.status];
}

function formatMobilePaymentMethod(pm: string | undefined): string {
    if (pm === 'SelfCollection') return 'Self collection';
    if (pm === 'COD') return 'Cash on delivery';
    if (pm === 'EasypaisaJazzcashOnline') return 'Easypaisa/Jazzcash/Online';
    return pm || '—';
}

/** Stage 8: poll order detail while courier delivery is in progress. */
function shouldPollDetailDelivery(order: MobileOrder | null): boolean {
    if (!order?.delivery_order_id) return false;
    const ds = String(order.delivery_status || '').toUpperCase();
    return ds !== 'DELIVERED';
}

function formatCourierDeliveryStatus(ds: string | null | undefined): string {
    if (!ds) return '—';
    const u = ds.toUpperCase();
    const map: Record<string, string> = {
        ASSIGNED: 'Assigned',
        PICKED: 'Picked up',
        ON_THE_WAY: 'On the way',
        DELIVERED: 'Delivered',
    };
    return map[u] || ds.replace(/_/g, ' ');
}

function formatRiderOperationalStatus(s: string | null | undefined): string {
    if (!s) return '—';
    const u = s.toUpperCase();
    const map: Record<string, string> = { AVAILABLE: 'Available', BUSY: 'Busy', OFFLINE: 'Offline' };
    return map[u] || s;
}

/** Home delivery with a courier assignment — fulfillment steps are driven by the rider app. */
function isRiderAssignedDelivery(order: Pick<MobileOrder, 'payment_method' | 'rider_id' | 'delivery_order_id'>): boolean {
    if (order.payment_method === 'SelfCollection') return false;
    return !!(order.rider_id || order.delivery_order_id);
}

const STATUS_FILTERS = ['All', 'Pending', 'Confirmed', 'Packed', 'OutForDelivery', 'Delivered', 'Unpaid', 'Cancelled'];
const LIVE_MAP_TAB = 'LiveMap';
const MOBILE_USERS_TAB = 'MobileUsers';

const PAGE_LABELS: Record<string, { label: string; color: string }> = {
    home: { label: 'Home', color: 'text-slate-600 dark:text-slate-300' },
    browsing_products: { label: 'Browsing Products', color: 'text-blue-600 dark:text-blue-400' },
    viewing_product: { label: 'Viewing Product', color: 'text-blue-700 dark:text-blue-300' },
    viewing_cart: { label: 'Viewing Cart', color: 'text-amber-600 dark:text-amber-400' },
    checkout: { label: 'Checkout', color: 'text-emerald-600 dark:text-emerald-400' },
    browsing_offers: { label: 'Browsing Offers', color: 'text-purple-600 dark:text-purple-400' },
    viewing_offer: { label: 'Viewing Offer', color: 'text-purple-700 dark:text-purple-300' },
    viewing_orders: { label: 'My Orders', color: 'text-indigo-600 dark:text-indigo-400' },
    viewing_order: { label: 'Order Detail', color: 'text-indigo-700 dark:text-indigo-300' },
    tracking_order: { label: 'Tracking Order', color: 'text-cyan-600 dark:text-cyan-400' },
    account_settings: { label: 'Account', color: 'text-slate-500 dark:text-slate-400' },
    budget: { label: 'Budget', color: 'text-teal-600 dark:text-teal-400' },
    notifications: { label: 'Notifications', color: 'text-rose-600 dark:text-rose-400' },
};

function formatPageLabel(page: string | null): { label: string; color: string } {
    if (!page) return { label: 'Unknown', color: 'text-muted-foreground' };
    const found = PAGE_LABELS[page];
    if (found) return found;
    return { label: page.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), color: 'text-muted-foreground' };
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return 'Just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m ago`;
}

// ─── Main Page ────────────────────────────────────────────
function MobileOrdersPageContent() {
    const {
        orders, loading, error, sseConnected, newOrderCount, branding, settings, userActivityTick,
        loadOrders, clearNewOrderCount, updateOrderStatus, collectPayment, loadBranding, loadSettings
    } = useMobileOrders();

    useEffect(() => {
        loadBranding();
        loadSettings();
    }, [loadBranding, loadSettings]);

    const [searchParams, setSearchParams] = useSearchParams();
    const orderIdFromUrl = searchParams.get('order');

    const [statusFilter, setStatusFilter] = useState<string>('All');
    const liveMapAutoSelectDone = useRef(false);
    const [detailOrder, setDetailOrder] = useState<MobileOrder | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState('');
    const [bankAccounts, setBankAccounts] = useState<any[]>([]);
    const [paymentModal, setPaymentModal] = useState<{ orderId: string; orderNumber: string; grandTotal: number; customerId?: string; customerName?: string } | null>(null);
    const [selectedBankAccount, setSelectedBankAccount] = useState('');
    const [paymentType, setPaymentType] = useState<'bank' | 'khata'>('bank');
    const [paymentLoading, setPaymentLoading] = useState(false);
    const [passwordResetRequests, setPasswordResetRequests] = useState<
        { id: string; phone_number: string; status: string; created_at: string }[]
    >([]);
    const [passwordResetActionId, setPasswordResetActionId] = useState<string | null>(null);
    const [passwordResetWhatsAppAssist, setPasswordResetWhatsAppAssist] = useState<{
        phoneE164: string;
        newPassword: string;
        message: string;
    } | null>(null);
    const [ridersOverview, setRidersOverview] = useState<PosRidersOverview | null>(null);
    const [ridersOverviewLoading, setRidersOverviewLoading] = useState(false);
    const [assignLoadingOrderId, setAssignLoadingOrderId] = useState<string | null>(null);
    const [onlineUsers, setOnlineUsers] = useState<MobileOnlineUser[]>([]);
    const [onlineUsersStats, setOnlineUsersStats] = useState<MobileUsersStats | null>(null);
    const [onlineUsersLoading, setOnlineUsersLoading] = useState(false);

    const loadRidersOverview = useCallback(async () => {
        setRidersOverviewLoading(true);
        try {
            const data = await mobileOrdersApi.getRidersOverview();
            setRidersOverview(data);
        } catch {
            setRidersOverview(null);
        } finally {
            setRidersOverviewLoading(false);
        }
    }, []);

    const loadOnlineUsers = useCallback(async () => {
        setOnlineUsersLoading(true);
        try {
            const data = await mobileOrdersApi.getOnlineUsers(5);
            setOnlineUsers(data.users);
            setOnlineUsersStats(data.stats);
        } catch {
            setOnlineUsers([]);
            setOnlineUsersStats(null);
        } finally {
            setOnlineUsersLoading(false);
        }
    }, []);

    useEffect(() => {
        shopApi.getBankAccounts().then(setBankAccounts).catch(() => {});
    }, []);

    useEffect(() => {
        loadRidersOverview();
        loadOnlineUsers();
    }, [loadRidersOverview, loadOnlineUsers]);

    useEffect(() => {
        let cancelled = false;
        const load = () => {
            mobileOrdersApi
                .getPasswordResetRequests()
                .then((rows) => {
                    if (!cancelled) setPasswordResetRequests(Array.isArray(rows) ? rows : []);
                })
                .catch(() => {
                    if (!cancelled) setPasswordResetRequests([]);
                });
        };
        load();
        const interval = window.setInterval(load, 45_000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    useEffect(() => {
        if (statusFilter === MOBILE_USERS_TAB) {
            loadOnlineUsers();
        } else if (statusFilter === LIVE_MAP_TAB) {
            loadOrders(undefined);
        } else {
            loadOrders(statusFilter === 'All' ? undefined : statusFilter);
        }
        clearNewOrderCount();
    }, [statusFilter]);

    useEffect(() => {
        if (statusFilter !== MOBILE_USERS_TAB) return;
        const id = window.setInterval(() => void loadOnlineUsers(), 15_000);
        return () => clearInterval(id);
    }, [statusFilter, loadOnlineUsers]);

    useEffect(() => {
        if (statusFilter === MOBILE_USERS_TAB && userActivityTick > 0) {
            loadOnlineUsers();
        }
    }, [userActivityTick]);

    useEffect(() => {
        if (statusFilter !== LIVE_MAP_TAB) return;
        const id = window.setInterval(() => {
            void loadRidersOverview();
            void loadOrders(undefined);
        }, 15_000);
        return () => clearInterval(id);
    }, [statusFilter, loadRidersOverview, loadOrders]);

    useEffect(() => {
        if (newOrderCount > 0) {
            loadOrders(
                statusFilter === LIVE_MAP_TAB || statusFilter === 'All' ? undefined : statusFilter
            );
        }
    }, [newOrderCount]);

    useEffect(() => {
        if (!orderIdFromUrl) {
            setDetailOrder(null);
            setDetailLoading(false);
            return;
        }
        let cancelled = false;
        setDetailLoading(true);
        mobileOrdersApi.getOrder(orderIdFromUrl).then((detail) => {
            if (!cancelled) setDetailOrder(detail);
        }).catch(() => {
            if (!cancelled) setDetailOrder(null);
        }).finally(() => {
            if (!cancelled) setDetailLoading(false);
        });
        return () => { cancelled = true; };
    }, [orderIdFromUrl]);

    useEffect(() => {
        if (!orderIdFromUrl || !detailOrder || detailOrder.id !== orderIdFromUrl) return;
        if (!shouldPollDetailDelivery(detailOrder)) return;

        const load = () => {
            mobileOrdersApi.getOrder(orderIdFromUrl).then(setDetailOrder).catch(() => {});
        };
        load();
        const id = window.setInterval(load, 12_000);
        return () => clearInterval(id);
    }, [orderIdFromUrl, detailOrder?.id, detailOrder?.delivery_order_id, detailOrder?.delivery_status]);

    const handleViewDetail = useCallback((order: MobileOrder) => {
        setSearchParams((prev) => {
            const p = new URLSearchParams(prev);
            p.set('order', order.id);
            return p;
        }, { replace: true });
    }, [setSearchParams]);

    useEffect(() => {
        if (statusFilter !== LIVE_MAP_TAB) {
            liveMapAutoSelectDone.current = false;
            return;
        }
        if (orderIdFromUrl) {
            liveMapAutoSelectDone.current = true;
            return;
        }
        if (loading || orders.length === 0) return;
        if (!liveMapAutoSelectDone.current) {
            liveMapAutoSelectDone.current = true;
            handleViewDetail(orders[0]);
        }
    }, [statusFilter, orderIdFromUrl, loading, orders, handleViewDetail]);

    const handleAssignRider = async (orderId: string, riderId: string) => {
        if (!riderId) {
            alert('Select a rider');
            return;
        }
        setAssignLoadingOrderId(orderId);
        try {
            await mobileOrdersApi.assignRider(orderId, riderId);
            await loadRidersOverview();
            await loadOrders(
                statusFilter === LIVE_MAP_TAB || statusFilter === 'All' ? undefined : statusFilter
            );
            if (detailOrder?.id === orderId) {
                setDetailOrder(await mobileOrdersApi.getOrder(orderId));
            }
        } catch (err: any) {
            alert(err.error || err.message || 'Failed to assign rider');
        } finally {
            setAssignLoadingOrderId(null);
        }
    };

    const handlePrintUnpaidReceipt = async (order: MobileOrder) => {
        try {
            const orderToPrint = order.items?.length ? order : await mobileOrdersApi.getOrder(order.id);
            const { createThermalPrinter } = await import('../../services/printer/thermalPrinter');
            const printer = createThermalPrinter();

            await printer.printReceipt({
                storeName: branding?.company_name || 'My Shop',
                storeAddress: branding?.address || '',
                receiptNumber: orderToPrint.order_number,
                date: new Date(orderToPrint.created_at).toLocaleDateString(),
                time: new Date(orderToPrint.created_at).toLocaleTimeString(),
                cashier: 'Mobile Order',
                customer: `${orderToPrint.customer_name || ''} - ${orderToPrint.customer_phone || ''}`,
                items: (orderToPrint.items || []).map(item => ({
                    name: item.product_name,
                    quantity: parseFloat(String(item.quantity)),
                    unitPrice: parseFloat(String(item.unit_price)),
                    total: parseFloat(String(item.subtotal)),
                    discount: parseFloat(String(item.discount_amount || 0)),
                })),
                subtotal: parseFloat(String(orderToPrint.subtotal)),
                discount: 0,
                tax: parseFloat(String(orderToPrint.tax_total)),
                total: parseFloat(String(orderToPrint.grand_total)),
                payments: [
                    { method: formatMobilePaymentMethod(orderToPrint.payment_method), amount: parseFloat(String(orderToPrint.grand_total)) }
                ],
                footer: `UNPAID MOBILE ORDER\nDelivery: ${formatMobilePaymentMethod(orderToPrint.payment_method)}\nDelivery Fee: PKR ${orderToPrint.delivery_fee}\n${orderToPrint.delivery_address ? `Address: ${orderToPrint.delivery_address}\n` : ''}${orderToPrint.delivery_notes || ''}`,
                showBarcode: true,
            });
        } catch (err: any) {
            alert(err.error || err.message || 'Failed to print receipt');
        }
    };

    const handleStatusUpdate = async (orderId: string, newStatus: string) => {
        setActionLoading(orderId);
        try {
            await updateOrderStatus(orderId, newStatus);
            let updatedOrderData: MobileOrder | null = null;
            if (detailOrder?.id === orderId) {
                updatedOrderData = await mobileOrdersApi.getOrder(orderId);
                setDetailOrder(updatedOrderData);
            }

            if (newStatus === 'Confirmed') {
                const orderToPrint = updatedOrderData || await mobileOrdersApi.getOrder(orderId);
                const { createThermalPrinter } = await import('../../services/printer/thermalPrinter');
                const printer = createThermalPrinter();

                await printer.printReceipt({
                    storeName: branding?.company_name || 'My Shop',
                    storeAddress: branding?.address || '',
                    receiptNumber: orderToPrint.order_number,
                    date: new Date(orderToPrint.created_at).toLocaleDateString(),
                    time: new Date(orderToPrint.created_at).toLocaleTimeString(),
                    cashier: 'Mobile Order',
                    customer: `${orderToPrint.customer_name || ''} - ${orderToPrint.customer_phone || ''}`,
                    items: (orderToPrint.items || []).map(item => ({
                        name: item.product_name,
                        quantity: parseFloat(String(item.quantity)),
                        unitPrice: parseFloat(String(item.unit_price)),
                        total: parseFloat(String(item.subtotal)),
                        discount: parseFloat(String(item.discount_amount || 0)),
                    })),
                    subtotal: parseFloat(String(orderToPrint.subtotal)),
                    discount: 0,
                    tax: parseFloat(String(orderToPrint.tax_total)),
                    total: parseFloat(String(orderToPrint.grand_total)),
                    payments: [
                        { method: orderToPrint.payment_method, amount: parseFloat(String(orderToPrint.grand_total)) }
                    ],
                    footer: `UNPAID RECEIPT\nDelivery Fee: ${orderToPrint.delivery_fee}\n${orderToPrint.delivery_notes || ''}`,
                    showBarcode: true
                });
            }
        } catch (err: any) {
            alert(err.error || err.message || 'Failed to update status');
        }
        setActionLoading('');
    };

    const formatPrice = (p: any) => {
        const n = Number(p);
        const value = Number.isFinite(n) ? n : 0;
        return `PKR ${value.toLocaleString()}`;
    };
    const formatDate = (d: string) => new Date(d).toLocaleString('en-PK', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
    const formatFullDate = (d: string) => new Date(d).toLocaleString('en-PK', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

    const pendingCount = orders.filter(o => o.status === 'Pending').length;

    const filterCounts = STATUS_FILTERS.map((s) => ({
        key: s,
        label: s === 'All' ? 'All' : STATUS_CONFIG[s]?.label || s,
        count:
            s === 'All'
                ? orders.length
                : s === 'Unpaid'
                  ? orders.filter((o) => o.status === 'Delivered' && o.payment_status !== 'Paid').length
                  : orders.filter((o) => o.status === s).length,
    }));

    const mapReadyCount = orders.filter(
        (o) =>
            o.payment_method !== 'SelfCollection' &&
            o.delivery_lat != null &&
            o.delivery_lng != null &&
            Number.isFinite(Number(o.delivery_lat)) &&
            Number.isFinite(Number(o.delivery_lng))
    ).length;
    const isLiveMapView = statusFilter === LIVE_MAP_TAB;
    const isMobileUsersView = statusFilter === MOBILE_USERS_TAB;

    return (
        <div className="flex w-full min-w-0 flex-col h-full min-h-0 flex-1 bg-muted/80 dark:bg-slate-800">
            {/* Page header + status filters (single band) */}
            <div className="bg-card dark:bg-slate-900 border-b border-border dark:border-slate-700 shadow-sm z-10 shrink-0">
                <div className="px-4 sm:px-6 lg:px-8 pt-4 pb-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 dark:shadow-indigo-900/40">
                                <Smartphone className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-slate-200 tracking-tight">
                                        Mobile Orders
                                    </h1>
                                    <span className="flex items-center gap-1.5 text-xs font-medium">
                                        {sseConnected ? (
                                            <>
                                                <Wifi className="w-3.5 h-3.5 text-green-500 dark:text-green-400 shrink-0" />
                                                <span className="text-green-600 dark:text-green-400">Live</span>
                                            </>
                                        ) : (
                                            <>
                                                <WifiOff className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                                <span className="text-red-500 dark:text-red-400">Disconnected</span>
                                            </>
                                        )}
                                    </span>
                                    {pendingCount > 0 && (
                                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 px-2 py-0.5 rounded-full text-xs font-bold">
                                            <Bell className="w-3 h-3 shrink-0" /> {pendingCount} pending
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                                    {statusFilter === MOBILE_USERS_TAB
                                        ? 'Real-time view of mobile app customers — see who is online, browsing, or adding to cart'
                                        : statusFilter === LIVE_MAP_TAB
                                        ? 'Live positions refresh every 15s. Pick an order to see route and ETA on the map.'
                                        : 'Select an order to view the full bill on the right'}
                                </p>
                            </div>
                        </div>
                        <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-3 lg:max-w-[min(100%,52rem)] shrink-0">
                            {ridersOverview?.stats && (
                                <div
                                    className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 rounded-xl border border-border/80 bg-muted/40 px-2.5 py-1.5 sm:px-3 sm:py-2 dark:bg-slate-800/60 dark:border-slate-600/80 min-w-0"
                                    title="Delivery rider availability (same pool as the rider mobile app)"
                                >
                                    <span className="inline-flex items-center gap-1.5 text-[0.7rem] sm:text-xs font-bold text-foreground dark:text-slate-200 shrink-0">
                                        <Users className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                        Riders
                                    </span>
                                    <span className="text-[0.65rem] sm:text-xs text-muted-foreground text-right">
                                        <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                                            {ridersOverview.stats.available}
                                        </span>{' '}
                                        available
                                    </span>
                                    <span className="text-border dark:text-slate-600 hidden sm:inline">·</span>
                                    <span className="text-[0.65rem] sm:text-xs text-muted-foreground">
                                        <span className="font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                                            {ridersOverview.stats.busy}
                                        </span>{' '}
                                        busy
                                    </span>
                                    <span className="text-border dark:text-slate-600 hidden sm:inline">·</span>
                                    <span className="text-[0.65rem] sm:text-xs text-muted-foreground">
                                        <span className="font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                                            {ridersOverview.stats.offline}
                                        </span>{' '}
                                        offline
                                    </span>
                                    <span className="text-border dark:text-slate-600 hidden sm:inline">·</span>
                                    <span className="text-[0.65rem] sm:text-xs text-muted-foreground">
                                        <span className="font-semibold tabular-nums text-foreground">{ridersOverview.stats.active_accounts}</span>{' '}
                                        active accounts
                                    </span>
                                    {ridersOverview.stats.inactive_accounts > 0 && (
                                        <>
                                            <span className="text-border dark:text-slate-600 hidden sm:inline">·</span>
                                            <span className="text-[0.65rem] sm:text-xs text-muted-foreground">
                                                {ridersOverview.stats.inactive_accounts} disabled
                                            </span>
                                        </>
                                    )}
                                    <span className="text-border dark:text-slate-600 hidden md:inline">·</span>
                                    <span className="text-[0.65rem] sm:text-xs text-muted-foreground">
                                        <span className="font-semibold tabular-nums text-indigo-700 dark:text-indigo-300">
                                            {ridersOverview.stats.open_deliveries}
                                        </span>{' '}
                                        open deliveries
                                    </span>
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    if (statusFilter === MOBILE_USERS_TAB) {
                                        loadOnlineUsers();
                                    } else {
                                        loadOrders(
                                            statusFilter === LIVE_MAP_TAB || statusFilter === 'All'
                                                ? undefined
                                                : statusFilter
                                        );
                                        loadRidersOverview();
                                    }
                                }}
                                className="p-2.5 bg-muted/80 dark:bg-slate-800/80 border border-border dark:border-slate-600 rounded-xl hover:bg-muted dark:hover:bg-slate-700/80 transition-colors shrink-0"
                                title="Refresh"
                            >
                                <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading || ridersOverviewLoading || onlineUsersLoading ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    </div>
                </div>
                <div className="border-t border-border/70 dark:border-slate-700/80 px-4 sm:px-6 lg:px-8 py-2.5 -mt-px">
                    <div className="flex gap-2 overflow-x-auto overflow-y-hidden pb-0.5 custom-scrollbar [scrollbar-gutter:stable]">
                        {filterCounts.map(({ key: s, label, count }) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => setStatusFilter(s)}
                                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all border shrink-0
                                    ${
                                        statusFilter === s
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/15 dark:shadow-indigo-900/30'
                                            : 'bg-muted/50 dark:bg-slate-800/90 text-muted-foreground border-border dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-500/40'
                                    }`}
                            >
                                {label}
                                <span
                                    className={`text-[0.65rem] sm:text-xs tabular-nums px-1.5 py-0.5 rounded-full ${
                                        statusFilter === s ? 'bg-white/20' : 'bg-background/80 dark:bg-slate-900/80'
                                    }`}
                                >
                                    {count}
                                </span>
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => setStatusFilter(LIVE_MAP_TAB)}
                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all border shrink-0
                                ${
                                    statusFilter === LIVE_MAP_TAB
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/15 dark:shadow-indigo-900/30'
                                        : 'bg-muted/50 dark:bg-slate-800/90 text-muted-foreground border-border dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-500/40'
                                }`}
                        >
                            <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 opacity-90" />
                            Live Map
                            <span
                                className={`text-[0.65rem] sm:text-xs tabular-nums px-1.5 py-0.5 rounded-full ${
                                    statusFilter === LIVE_MAP_TAB ? 'bg-white/20' : 'bg-background/80 dark:bg-slate-900/80'
                                }`}
                            >
                                {mapReadyCount}
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setStatusFilter(MOBILE_USERS_TAB)}
                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all border shrink-0
                                ${
                                    statusFilter === MOBILE_USERS_TAB
                                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-500/15 dark:shadow-emerald-900/30'
                                        : 'bg-muted/50 dark:bg-slate-800/90 text-muted-foreground border-border dark:border-slate-600 hover:border-emerald-300 dark:hover:border-emerald-500/40'
                                }`}
                        >
                            <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 opacity-90" />
                            Mobile Users
                            {onlineUsersStats && onlineUsersStats.online_now > 0 && (
                                <span
                                    className={`text-[0.65rem] sm:text-xs tabular-nums px-1.5 py-0.5 rounded-full ${
                                        statusFilter === MOBILE_USERS_TAB ? 'bg-white/20' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300'
                                    }`}
                                >
                                    {onlineUsersStats.online_now}
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Content: list + bill — scrollbars only when content overflows */}
            <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden px-4 sm:px-6 lg:px-8 py-4">
                {passwordResetWhatsAppAssist && (
                    <div className="mb-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/95 dark:bg-emerald-950/35 px-4 py-3 shrink-0">
                        <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100 mb-1">
                            Password reset ready — send in WhatsApp
                        </p>
                        <p className="text-xs text-emerald-800/90 dark:text-emerald-200/90 mb-3">
                            Your installed WhatsApp should open with the message ready. If nothing opened, use{' '}
                            <span className="font-semibold">Open WhatsApp again</span> or{' '}
                            <span className="font-semibold">Open in browser (wa.me)</span>.
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                            <span className="text-xs font-semibold uppercase tracking-wide text-emerald-900/80 dark:text-emerald-200/80">
                                New password
                            </span>
                            <code className="px-2 py-1 rounded-md bg-white/80 dark:bg-emerald-950/80 text-sm font-mono font-bold text-emerald-950 dark:text-emerald-50 border border-emerald-200/80 dark:border-emerald-800">
                                {passwordResetWhatsAppAssist.newPassword}
                            </code>
                            <button
                                type="button"
                                onClick={() => {
                                    void navigator.clipboard.writeText(passwordResetWhatsAppAssist.newPassword);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-800"
                            >
                                <Copy className="w-3.5 h-3.5" />
                                Copy
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() =>
                                    openWhatsAppDesktopWithMessage(
                                        passwordResetWhatsAppAssist.phoneE164,
                                        passwordResetWhatsAppAssist.message
                                    )
                                }
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs font-bold"
                            >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Open WhatsApp again
                            </button>
                            <a
                                href={buildWhatsAppWebSendUrl(
                                    passwordResetWhatsAppAssist.phoneE164,
                                    passwordResetWhatsAppAssist.message
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-600/40 dark:border-emerald-500/40 text-emerald-900 dark:text-emerald-100 text-xs font-bold hover:bg-emerald-100/80 dark:hover:bg-emerald-900/40"
                            >
                                Open in browser (wa.me)
                            </a>
                            <button
                                type="button"
                                onClick={() => setPasswordResetWhatsAppAssist(null)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-800 dark:text-emerald-200 hover:underline"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                )}
                {passwordResetRequests.length > 0 && (
                    <div className="mb-4 rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/95 dark:bg-amber-950/40 px-4 py-3 shrink-0">
                        <p className="text-sm font-bold text-amber-900 dark:text-amber-100 mb-2 flex items-center gap-2">
                            <Bell className="w-4 h-4 shrink-0" />
                            Password reset requests (mobile app)
                        </p>
                        <ul className="space-y-2">
                            {passwordResetRequests.map((r) => (
                                <li
                                    key={r.id}
                                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-amber-950 dark:text-amber-50"
                                >
                                    <span>
                                        Request from{' '}
                                        <span className="font-mono font-semibold">{r.phone_number}</span>
                                    </span>
                                    <button
                                        type="button"
                                        disabled={passwordResetActionId === r.id}
                                        onClick={async () => {
                                            setPasswordResetActionId(r.id);
                                            try {
                                                const res = await mobileOrdersApi.completePasswordResetRequest(r.id);
                                                const message = formatPasswordResetWhatsAppMessage(res.newPassword);
                                                const phone = res.phoneE164 || r.phone_number || '';
                                                setPasswordResetWhatsAppAssist({
                                                    phoneE164: phone,
                                                    newPassword: res.newPassword,
                                                    message,
                                                });
                                                openWhatsAppDesktopWithMessage(phone, message);
                                                setPasswordResetRequests((prev) => prev.filter((x) => x.id !== r.id));
                                            } catch (err: any) {
                                                alert(err?.error || err?.message || 'Reset failed');
                                            } finally {
                                                setPasswordResetActionId(null);
                                            }
                                        }}
                                        className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold disabled:opacity-50"
                                    >
                                        {passwordResetActionId === r.id ? 'Working…' : 'Reset password'}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {isMobileUsersView ? (
                    <MobileUsersPanel
                        users={onlineUsers}
                        stats={onlineUsersStats}
                        loading={onlineUsersLoading}
                        onRefresh={loadOnlineUsers}
                    />
                ) : (
                <div
                    className={`flex min-h-0 flex-1 flex-col gap-4 ${
                        isLiveMapView ? 'xl:flex-row xl:gap-5' : 'lg:flex-row lg:gap-6'
                    }`}
                >
                {/* Orders List */}
                <div
                    className={`flex min-h-0 min-w-0 flex-col ${
                        isLiveMapView
                            ? 'flex-[1] xl:max-w-[min(100%,400px)]'
                            : 'flex-[1.15] lg:max-w-[min(100%,52%)]'
                    }`}
                >
                    <div className="min-h-0 flex-1 overflow-auto custom-scrollbar [scrollbar-gutter:stable] pr-1 space-y-3">
                    {loading && orders.length === 0 ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-400" />
                        </div>
                    ) : orders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                            <ShoppingBag className="w-16 h-16 mb-4 opacity-30" />
                            <p className="text-lg font-semibold text-muted-foreground">No orders found</p>
                            <p className="text-sm">Orders from mobile customers will appear here</p>
                        </div>
                    ) : (
                        orders.map(order => {
                            const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.Pending;
                            const StatusIcon = cfg.icon;
                            const nextStatus = getNextMobileOrderStatus(order);

                            return (
                                <div
                                    key={order.id}
                                    onClick={() => handleViewDetail(order)}
                                    className={`bg-card dark:bg-slate-900/90 rounded-2xl border p-4 sm:p-5 cursor-pointer transition-all hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-500/40 ${detailOrder?.id === order.id ? 'ring-2 ring-indigo-500 border-indigo-300 dark:ring-indigo-400 dark:border-indigo-500/60' : 'border-border dark:border-slate-600'
                                        }`}
                                >
                                    {isLiveMapView ? (
                                        <div className="flex gap-3 sm:gap-4">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-muted/50 dark:bg-slate-800/80">
                                                <Store className="h-5 w-5 text-muted-foreground" />
                                            </div>
                                            <div className="min-w-0 flex-1 space-y-1.5">
                                                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                                                    <span className="font-bold text-foreground text-sm leading-snug break-words inline-flex flex-wrap items-center gap-1.5">
                                                        {order.customer_mobile_verified && <MobileOrderCustomerVerifiedBadge />}
                                                        <span>
                                                            {(order.customer_name || 'Customer').trim()}
                                                            {order.distance_km != null && Number.isFinite(Number(order.distance_km)) && (
                                                                <span className="font-semibold text-muted-foreground">
                                                                    {' '}
                                                                    — {Number(order.distance_km).toFixed(1)} km
                                                                </span>
                                                            )}
                                                        </span>
                                                    </span>
                                                    <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400 tabular-nums shrink-0">
                                                        {formatPrice(order.grand_total)}
                                                    </span>
                                                </div>
                                                <p className="text-[0.7rem] text-muted-foreground">{formatDate(order.created_at)}</p>
                                                <p className="text-[0.7rem] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                                    <span className="font-mono font-semibold break-all">{order.order_number}</span>
                                                    <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-px text-[0.65rem] font-bold shrink-0 ${cfg.bg} ${cfg.color}`}>
                                                        <StatusIcon className="w-3 h-3 shrink-0" />
                                                        {cfg.label}
                                                    </span>
                                                    {(order.rider_name || order.delivery_order_id) && (
                                                        <span className="inline-flex items-center gap-0.5 text-[0.65rem] font-semibold text-emerald-700 dark:text-emerald-400">
                                                            <Truck className="w-3 h-3 shrink-0" />
                                                            {order.rider_name || 'Courier'}
                                                        </span>
                                                    )}
                                                </p>
                                                <div className="flex flex-col gap-1 text-[0.7rem] text-muted-foreground pt-0.5">
                                                    <span className="flex items-start gap-1.5 min-w-0">
                                                        <Phone className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                        <span className="break-all leading-snug">{order.customer_phone}</span>
                                                    </span>
                                                    <span className={`flex items-start gap-1.5 font-medium min-w-0 ${order.payment_status === 'Paid' ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                                                        <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                        <span className="break-words leading-snug">
                                                            {formatMobilePaymentMethod(order.payment_method)} ({order.payment_status || 'Unpaid'})
                                                        </span>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                                        <div className="min-w-0 flex-1 space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-bold text-foreground text-sm sm:text-base break-all">{order.order_number}</span>
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border shrink-0 ${cfg.bg} ${cfg.color}`}>
                                                    <StatusIcon className="w-3 h-3 shrink-0" />
                                                    {cfg.label}
                                                </span>
                                                {(order.rider_name || order.delivery_order_id) && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] sm:text-xs font-semibold border shrink-0 bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-300">
                                                        <Truck className="w-3 h-3 shrink-0" />
                                                        {order.rider_name || 'Courier'}
                                                        {order.rider_to_dropoff_km != null && Number.isFinite(order.rider_to_dropoff_km) && (
                                                            <span className="tabular-nums opacity-90">
                                                                · {order.rider_to_dropoff_km.toFixed(1)} km
                                                            </span>
                                                        )}
                                                    </span>
                                                )}
                                                {!isRiderAssignedDelivery(order) && order.payment_method !== 'SelfCollection' && order.status !== 'Delivered' && order.status !== 'Cancelled' && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] sm:text-xs font-semibold border shrink-0 bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-300">
                                                        <Users className="w-3 h-3 shrink-0" />
                                                        No rider
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground">{formatDate(order.created_at)}</p>
                                            <div className="flex flex-col gap-2 text-xs sm:text-sm text-muted-foreground">
                                                {order.customer_name && (
                                                    <span className="flex items-start gap-2 min-w-0">
                                                        <User className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                        <span className="break-words leading-snug inline-flex flex-wrap items-center gap-1.5">
                                                            {order.customer_mobile_verified && <MobileOrderCustomerVerifiedBadge />}
                                                            <span>{order.customer_name}</span>
                                                        </span>
                                                    </span>
                                                )}
                                                <span className="flex items-start gap-2 min-w-0">
                                                    <Phone className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                    <span className="break-all leading-snug">{order.customer_phone}</span>
                                                </span>
                                                <span className={`flex items-start gap-2 font-medium min-w-0 ${order.payment_status === 'Paid' ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                                                    <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                    <span className="break-words leading-snug">
                                                        {formatMobilePaymentMethod(order.payment_method)} ({order.payment_status || 'Unpaid'})
                                                    </span>
                                                </span>
                                            </div>
                                        </div>
                                        <span className="text-lg sm:text-xl font-bold text-indigo-600 dark:text-indigo-400 shrink-0 tabular-nums sm:text-right">
                                            {formatPrice(order.grand_total)}
                                        </span>
                                    </div>
                                    )}

                                    {/* Quick action buttons — hidden when a rider is assigned (rider app drives status) */}
                                    {!isLiveMapView && nextStatus && !isRiderAssignedDelivery(order) && (
                                        <div className="flex gap-2 mt-3 pt-3 border-t border-border/60">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleStatusUpdate(order.id, nextStatus); }}
                                                disabled={actionLoading === order.id}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                                            >
                                                {actionLoading === order.id ? (
                                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <Check className="w-3.5 h-3.5" />
                                                )}
                                                {nextStatus === 'Delivered'
                                                    ? (order.status === 'Packed' && order.payment_method === 'SelfCollection' ? 'Mark Collected' : 'Mark Delivered')
                                                    : STATUS_CONFIG[nextStatus]?.label || nextStatus}
                                            </button>
                                            {order.status === 'Pending' && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleStatusUpdate(order.id, 'Cancelled'); }}
                                                    disabled={actionLoading === order.id}
                                                    className="px-4 py-2 bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400 rounded-xl text-sm font-semibold hover:bg-red-100 dark:hover:bg-red-950/70 transition-colors border border-red-200 dark:border-red-800"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    {!isLiveMapView && isRiderAssignedDelivery(order) && order.status !== 'Delivered' && order.status !== 'Cancelled' && (
                                        <p className="mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground leading-snug">
                                            Rider assigned — order status is updated from the rider app.
                                        </p>
                                    )}
                                    {/* Collect Payment button for Delivered + Unpaid */}
                                    {!isLiveMapView && order.status === 'Delivered' && order.payment_status !== 'Paid' && (
                                        <div className="mt-3 pt-3 border-t border-border/60">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setPaymentModal({ orderId: order.id, orderNumber: order.order_number, grandTotal: parseFloat(String(order.grand_total)), customerId: order.customer_id, customerName: order.customer_name });
                                                    setSelectedBankAccount('');
                                                    setPaymentType('bank');
                                                }}
                                                className="w-full flex items-center justify-center gap-1.5 py-2 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition-colors"
                                            >
                                                <Banknote className="w-3.5 h-3.5" />
                                                Collect Payment
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                    </div>
                </div>

                {isLiveMapView && (
                    <div className="relative flex min-h-[min(52vh,440px)] min-w-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm dark:border-slate-600 dark:bg-slate-950/40 xl:min-h-0">
                        <MobileOrdersLiveMap
                            branding={branding}
                            selectedOrder={detailLoading ? null : detailOrder}
                            riders={ridersOverview?.riders ?? []}
                        />
                    </div>
                )}

                {/* Bill / detail — fixed min width for readable receipt; scrolls when needed */}
                <div
                    className={`flex min-h-0 w-full min-w-0 flex-[0.95] flex-col lg:min-w-[min(100%,22rem)] ${
                        isLiveMapView ? 'xl:max-w-md' : 'lg:max-w-xl xl:max-w-2xl'
                    }`}
                >
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card dark:border-slate-600 dark:bg-slate-900/95 shadow-sm">
                    {detailLoading ? (
                        <div className="flex flex-1 items-center justify-center p-10 min-h-[12rem]">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-400" />
                        </div>
                    ) : detailOrder ? (
                        <OrderDetailPanel
                            order={detailOrder}
                            onStatusUpdate={handleStatusUpdate}
                            onCollectPayment={(o) => {
                                setPaymentModal({ orderId: o.id, orderNumber: o.order_number, grandTotal: parseFloat(String(o.grand_total)), customerId: o.customer_id, customerName: o.customer_name });
                                setSelectedBankAccount('');
                                setPaymentType('bank');
                            }}
                            onPrintUnpaid={handlePrintUnpaidReceipt}
                            actionLoading={actionLoading}
                            formatPrice={formatPrice}
                            formatDate={formatFullDate}
                            assignableRiders={
                                (ridersOverview?.riders || []).filter(
                                    (r) => r.is_active && String(r.status).toUpperCase() === 'AVAILABLE'
                                )
                            }
                            onAssignRider={handleAssignRider}
                            assignLoadingOrderId={assignLoadingOrderId}
                            riderAssignmentMode={settings?.rider_assignment_mode || 'auto'}
                        />
                    ) : (
                        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground min-h-[12rem] lg:min-h-0">
                            <Eye className="w-12 h-12 opacity-25 shrink-0" />
                            <p className="font-semibold text-foreground/80">Bill preview</p>
                            <p className="text-sm max-w-xs leading-relaxed">Select an order from the list. Line items and totals appear here.</p>
                        </div>
                    )}
                    </div>
                </div>
            </div>
                )}

            {/* Payment Collection Modal */}
            {paymentModal && (
                <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50" onClick={() => setPaymentModal(null)}>
                    <div className="bg-card dark:bg-slate-900 rounded-2xl shadow-2xl w-[420px] overflow-hidden border border-border dark:border-slate-600" onClick={e => e.stopPropagation()}>
                        <div className="p-6 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/80 dark:to-amber-950/50 border-b border-orange-100 dark:border-orange-900/60">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-orange-100 dark:bg-orange-950/80 rounded-xl flex items-center justify-center">
                                    <Banknote className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-foreground">Collect Payment</h3>
                                    <p className="text-xs text-muted-foreground">{paymentModal.orderNumber}</p>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 space-y-5">
                            <div className="p-4 bg-muted rounded-xl flex justify-between items-center">
                                <span className="text-sm text-muted-foreground font-medium">Amount Due</span>
                                <span className="text-xl font-semibold text-foreground">{formatPrice(paymentModal.grandTotal)}</span>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Payment Type</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => { setPaymentType('bank'); }}
                                        className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                                            paymentType === 'bank'
                                                ? 'border-orange-400 bg-orange-50 text-orange-700 dark:border-orange-600 dark:bg-orange-950/40 dark:text-orange-300'
                                                : 'border-border dark:border-slate-600 text-muted-foreground hover:border-orange-200 dark:hover:border-orange-600/50'
                                        }`}
                                    >
                                        <Wallet className="w-4 h-4" />
                                        Cash / Bank
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setPaymentType('khata'); setSelectedBankAccount(''); }}
                                        className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                                            paymentType === 'khata'
                                                ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-300'
                                                : 'border-border dark:border-slate-600 text-muted-foreground hover:border-amber-200 dark:hover:border-amber-600/50'
                                        }`}
                                    >
                                        <BookOpen className="w-4 h-4" />
                                        Khata / Credit
                                    </button>
                                </div>
                            </div>

                            {paymentType === 'khata' ? (
                                <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl space-y-2">
                                    <div className="flex items-center gap-2">
                                        <BookOpen className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                        <span className="text-sm font-bold text-amber-800 dark:text-amber-300">Khata / Credit</span>
                                    </div>
                                    <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                                        Amount of <strong>{formatPrice(paymentModal.grandTotal)}</strong> will be added as a debit entry
                                        to <strong>{paymentModal.customerName || 'this customer'}</strong>&apos;s khata account.
                                    </p>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Deposit To Account</label>
                                    {bankAccounts.length === 0 ? (
                                        <p className="text-sm text-red-500 dark:text-red-400">No bank accounts found. Create one in Settings first.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {bankAccounts.map((acc: any) => (
                                                <label
                                                    key={acc.id}
                                                    className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                                                        selectedBankAccount === acc.id
                                                            ? 'border-orange-400 bg-orange-50 dark:border-orange-600 dark:bg-orange-950/40'
                                                            : 'border-border dark:border-slate-600 hover:border-orange-200 dark:hover:border-orange-600/50'
                                                    }`}
                                                >
                                                    <input
                                                        type="radio"
                                                        name="bankAccount"
                                                        value={acc.id}
                                                        checked={selectedBankAccount === acc.id}
                                                        onChange={() => setSelectedBankAccount(acc.id)}
                                                        className="sr-only"
                                                    />
                                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                                                        selectedBankAccount === acc.id ? 'bg-orange-100 text-orange-600 dark:bg-orange-950/80 dark:text-orange-400' : 'bg-muted text-muted-foreground dark:bg-slate-800'
                                                    }`}>
                                                        {acc.account_type === 'Cash' ? <Wallet className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold text-foreground truncate">{acc.name}</p>
                                                        <p className="text-xs text-muted-foreground uppercase">{acc.account_type} {acc.chart_code ? `• ${acc.chart_code}` : acc.code ? `• ${acc.code}` : ''}</p>
                                                    </div>
                                                    <span className="text-xs font-mono font-bold text-muted-foreground">
                                                        PKR {(parseFloat(acc.balance) || 0).toLocaleString()}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-border dark:border-slate-600 flex gap-3">
                            <button
                                onClick={() => setPaymentModal(null)}
                                className="flex-1 py-2.5 bg-muted dark:bg-slate-800 text-foreground rounded-xl text-sm font-semibold hover:bg-muted dark:hover:bg-slate-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    if (paymentType === 'bank' && !selectedBankAccount) { alert('Please select a deposit account'); return; }
                                    setPaymentLoading(true);
                                    try {
                                        await collectPayment(
                                            paymentModal.orderId,
                                            paymentType === 'khata' ? undefined : selectedBankAccount,
                                            paymentType === 'khata' ? 'khata' : undefined,
                                        );
                                        setPaymentModal(null);
                                        if (detailOrder?.id === paymentModal.orderId) {
                                            const updated = await mobileOrdersApi.getOrder(paymentModal.orderId);
                                            setDetailOrder(updated);
                                        }
                                    } catch (err: any) {
                                        alert(err.error || err.message || 'Failed to collect payment');
                                    }
                                    setPaymentLoading(false);
                                }}
                                disabled={(paymentType === 'bank' && !selectedBankAccount) || paymentLoading}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 ${
                                    paymentType === 'khata'
                                        ? 'bg-amber-500 hover:bg-amber-600'
                                        : 'bg-orange-500 hover:bg-orange-600'
                                }`}
                            >
                                {paymentLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                {paymentType === 'khata' ? 'Confirm Khata' : 'Confirm Payment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            </div>
        </div>
    );
}

// ─── Mobile Users Panel ──────────────────────────────────
function MobileUsersPanel({
    users,
    stats,
    loading,
    onRefresh,
}: {
    users: MobileOnlineUser[];
    stats: MobileUsersStats | null;
    loading: boolean;
    onRefresh: () => void;
}) {
    const formatPrice = (p: any) => {
        const n = Number(p);
        return `PKR ${Number.isFinite(n) ? n.toLocaleString() : '0'}`;
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-5">
            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 shrink-0">
                    <div className="bg-card dark:bg-slate-900/90 rounded-2xl border border-border dark:border-slate-700 p-4 space-y-1">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center">
                                <CircleDot className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <span className="text-xs font-medium text-muted-foreground">Online Now</span>
                        </div>
                        <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{stats.online_now}</p>
                    </div>
                    <div className="bg-card dark:bg-slate-900/90 rounded-2xl border border-border dark:border-slate-700 p-4 space-y-1">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center">
                                <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            </div>
                            <span className="text-xs font-medium text-muted-foreground">Browsing</span>
                        </div>
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">{stats.browsing}</p>
                    </div>
                    <div className="bg-card dark:bg-slate-900/90 rounded-2xl border border-border dark:border-slate-700 p-4 space-y-1">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center">
                                <ShoppingCart className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            </div>
                            <span className="text-xs font-medium text-muted-foreground">Shopping</span>
                        </div>
                        <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">{stats.shopping}</p>
                    </div>
                    <div className="bg-card dark:bg-slate-900/90 rounded-2xl border border-border dark:border-slate-700 p-4 space-y-1">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 flex items-center justify-center">
                                <Banknote className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <span className="text-xs font-medium text-muted-foreground">Cart Value</span>
                        </div>
                        <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">{formatPrice(stats.total_cart_value)}</p>
                    </div>
                    <div className="bg-card dark:bg-slate-900/90 rounded-2xl border border-border dark:border-slate-700 p-4 space-y-1">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950/60 flex items-center justify-center">
                                <Activity className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            </div>
                            <span className="text-xs font-medium text-muted-foreground">Active Today</span>
                        </div>
                        <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 tabular-nums">{stats.active_today}</p>
                    </div>
                    <div className="bg-card dark:bg-slate-900/90 rounded-2xl border border-border dark:border-slate-700 p-4 space-y-1">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                <UserCheck className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                            </div>
                            <span className="text-xs font-medium text-muted-foreground">Registered</span>
                        </div>
                        <p className="text-2xl font-bold text-foreground tabular-nums">{stats.total_registered}</p>
                    </div>
                </div>
            )}

            {/* Users List */}
            <div className="min-h-0 flex-1 overflow-auto custom-scrollbar [scrollbar-gutter:stable]">
                {loading && users.length === 0 ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 dark:border-emerald-400" />
                    </div>
                ) : users.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                        <Users className="w-16 h-16 mb-4 opacity-20" />
                        <p className="text-lg font-semibold">No mobile users online</p>
                        <p className="text-sm mt-1">When customers use the mobile app, they will appear here in real-time</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {users.map((user) => {
                            const page = formatPageLabel(user.current_page);
                            const cartItems = parseInt(String(user.cart_item_count)) || 0;
                            const cartTotal = parseFloat(String(user.cart_total)) || 0;
                            const hasCart = cartItems > 0;

                            return (
                                <div
                                    key={user.customer_id}
                                    className={`bg-card dark:bg-slate-900/90 rounded-2xl border p-4 transition-all ${
                                        hasCart
                                            ? 'border-amber-200 dark:border-amber-800/60 shadow-sm shadow-amber-100/50 dark:shadow-amber-950/30'
                                            : 'border-border dark:border-slate-700'
                                    }`}
                                >
                                    <div className="flex items-start gap-3">
                                        {/* Avatar / status indicator */}
                                        <div className="relative shrink-0">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                                hasCart
                                                    ? 'bg-amber-100 dark:bg-amber-950/60'
                                                    : 'bg-emerald-100 dark:bg-emerald-950/60'
                                            }`}>
                                                <User className={`w-5 h-5 ${
                                                    hasCart ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                                                }`} />
                                            </div>
                                            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-card dark:border-slate-900" />
                                        </div>

                                        {/* User info */}
                                        <div className="min-w-0 flex-1 space-y-1.5">
                                            <div className="flex items-baseline justify-between gap-2">
                                                <p className="text-sm font-bold text-foreground truncate">
                                                    {user.customer_name || 'Anonymous'}
                                                </p>
                                                <span className="text-[0.65rem] text-muted-foreground whitespace-nowrap shrink-0">
                                                    {timeAgo(user.last_seen_at)}
                                                </span>
                                            </div>

                                            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                                <Phone className="w-3 h-3 shrink-0" />
                                                <span className="font-mono">{user.customer_phone}</span>
                                            </p>

                                            {/* Current activity */}
                                            <div className="flex items-center gap-1.5">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] font-semibold border ${
                                                    user.current_page === 'checkout'
                                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-300'
                                                        : user.current_page === 'viewing_cart'
                                                        ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-300'
                                                        : 'bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800/50 dark:border-slate-600 dark:text-slate-300'
                                                }`}>
                                                    <CircleDot className="w-2.5 h-2.5 shrink-0" />
                                                    {page.label}
                                                </span>
                                            </div>

                                            {/* Cart info */}
                                            {hasCart && (
                                                <div className="flex items-center gap-2 mt-1 p-2 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40">
                                                    <ShoppingCart className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                                    <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                                                        {cartItems} {cartItems === 1 ? 'item' : 'items'}
                                                    </span>
                                                    <span className="text-amber-400 dark:text-amber-600">·</span>
                                                    <span className="text-xs font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                                                        {formatPrice(cartTotal)}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Order Detail Panel ───────────────────────────────────
function OrderDetailPanel({
    order, onStatusUpdate, onCollectPayment, onPrintUnpaid, actionLoading, formatPrice, formatDate,
    assignableRiders, onAssignRider, assignLoadingOrderId, riderAssignmentMode,
}: {
    order: MobileOrder;
    onStatusUpdate: (id: string, status: string) => void;
    onCollectPayment: (order: MobileOrder) => void;
    onPrintUnpaid: (order: MobileOrder) => void | Promise<void>;
    actionLoading: string;
    formatPrice: (p: any) => string;
    formatDate: (d: string) => string;
    assignableRiders: { id: string; name: string }[];
    onAssignRider: (orderId: string, riderId: string) => void | Promise<void>;
    assignLoadingOrderId: string | null;
    riderAssignmentMode: 'auto' | 'manual' | 'third_party';
}) {
    const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.Pending;
    const DetailStatusIcon = cfg.icon;
    const nextStatus = getNextMobileOrderStatus(order);
    const isUnpaid = order.status === 'Delivered' && order.payment_status !== 'Paid';
    const riderLocked = isRiderAssignedDelivery(order);
    const canManualAssign =
        order.payment_method !== 'SelfCollection' &&
        !riderLocked &&
        order.status !== 'Delivered' &&
        order.status !== 'Cancelled';
    const canPrintUnpaid = order.payment_status !== 'Paid' && order.status !== 'Cancelled';
    const [manualRiderId, setManualRiderId] = useState('');
    const [printing, setPrinting] = useState(false);

    useEffect(() => {
        setManualRiderId('');
    }, [order.id]);

    return (
        <div className="flex h-full min-h-0 flex-col">
            {/* Order header — fixed */}
            <div className="shrink-0 border-b border-indigo-100/80 bg-gradient-to-r from-indigo-50 to-purple-50 px-4 py-4 dark:border-indigo-900/50 dark:from-indigo-950/60 dark:to-purple-950/50 sm:px-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <span className="font-bold text-base sm:text-lg text-foreground dark:text-slate-200 break-all">{order.order_number}</span>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDate(order.created_at)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {isUnpaid && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950/50 dark:border-orange-800 dark:text-orange-300">
                                <Banknote className="w-3 h-3 shrink-0" />
                                Unpaid
                            </span>
                        )}
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.color}`}>
                            <DetailStatusIcon className="w-3 h-3 shrink-0" />
                            {cfg.label}
                        </span>
                    </div>
                </div>
            </div>

            {/* Scrollable body — customer, delivery, bill lines, history */}
            <div className="min-h-0 flex-1 overflow-auto custom-scrollbar [scrollbar-gutter:stable] px-4 py-4 sm:px-5">
                <div className="space-y-5">
                    {riderLocked && order.status !== 'Delivered' && order.status !== 'Cancelled' && (
                        <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/70 px-3 py-2.5 text-sm text-indigo-950 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-100">
                            A rider is assigned. Fulfillment status is updated only from the rider mobile app (pickup and delivery steps).
                        </div>
                    )}
                    <div>
                        <h4 className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground mb-2">Customer</h4>
                        <div className="space-y-2 text-sm sm:text-base text-foreground">
                            {order.customer_name && (
                                <div className="flex gap-2 min-w-0">
                                    <User className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                                    <span className="break-words leading-snug inline-flex flex-wrap items-center gap-1.5">
                                        {order.customer_mobile_verified && <MobileOrderCustomerVerifiedBadge />}
                                        <span>{order.customer_name}</span>
                                    </span>
                                </div>
                            )}
                            <div className="flex gap-2 min-w-0">
                                <Phone className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                                <span className="break-all leading-snug">{order.customer_phone}</span>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground mb-2">Payment</h4>
                        <div className="flex flex-wrap items-center gap-2 text-sm sm:text-base">
                            <span className="text-foreground break-words">{formatMobilePaymentMethod(order.payment_method)}</span>
                            <span
                                className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${
                                    order.payment_status === 'Paid'
                                        ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300'
                                        : 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300'
                                }`}
                            >
                                {order.payment_status || 'Unpaid'}
                            </span>
                        </div>
                    </div>

                    {order.delivery_address && (
                        <div>
                            <h4 className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground mb-2">Delivery</h4>
                            <div className="flex gap-2 text-sm sm:text-base text-foreground">
                                <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                                <div className="min-w-0 space-y-1">
                                    <p className="break-words leading-relaxed">{order.delivery_address}</p>
                                    {(order.assigned_branch_name || order.distance_km != null) &&
                                        order.payment_method !== 'SelfCollection' && (
                                        <p className="text-xs text-muted-foreground mt-2">
                                            {order.assigned_branch_name && (
                                                <span>
                                                    Assigned branch: <span className="font-medium text-foreground">{order.assigned_branch_name}</span>
                                                    {order.distance_km != null ? ' · ' : ''}
                                                </span>
                                            )}
                                            {order.distance_km != null && (
                                                <span>
                                                    ~{Number(order.distance_km).toFixed(2)} km from branch to customer (straight line)
                                                </span>
                                            )}
                                        </p>
                                    )}
                                    {order.delivery_lat != null &&
                                        order.delivery_lng != null &&
                                        Number.isFinite(Number(order.delivery_lat)) &&
                                        Number.isFinite(Number(order.delivery_lng)) && (
                                        <a
                                            href={`https://www.google.com/maps?q=${Number(order.delivery_lat)},${Number(order.delivery_lng)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400 mt-2"
                                        >
                                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                                            Open customer pin in Google Maps
                                        </a>
                                    )}
                                    {order.delivery_notes && (
                                        <p className="text-xs text-muted-foreground leading-relaxed break-words">
                                            Note: {order.delivery_notes}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {canManualAssign && riderAssignmentMode === 'third_party' && (
                        <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-3 text-sm text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
                            Rider logistics is set to third-party couriers. Assign and track delivery outside the in-app rider workflow when needed.
                        </div>
                    )}

                    {canManualAssign && riderAssignmentMode !== 'third_party' && (
                        <div className="rounded-xl border border-dashed border-indigo-300/80 bg-indigo-50/40 px-3 py-3 dark:border-indigo-700/50 dark:bg-indigo-950/25">
                            <h4 className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                                <Truck className="w-3.5 h-3.5 shrink-0" />
                                Assign rider
                            </h4>
                            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                                {riderAssignmentMode === 'manual'
                                    ? 'Select an available rider to deliver this order. Only riders on shift in the rider app are listed.'
                                    : 'No rider was auto-assigned at checkout. Choose an available rider here.'}
                            </p>
                            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                                <select
                                    aria-label="Choose rider for manual assignment"
                                    value={manualRiderId}
                                    onChange={(e) => setManualRiderId(e.target.value)}
                                    className="flex-1 min-w-0 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground dark:bg-slate-900 dark:border-slate-600"
                                >
                                    <option value="">Select rider…</option>
                                    {assignableRiders.map((r) => (
                                        <option key={r.id} value={r.id}>
                                            {r.name}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    disabled={!manualRiderId || assignLoadingOrderId === order.id}
                                    onClick={() => onAssignRider(order.id, manualRiderId)}
                                    className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    {assignLoadingOrderId === order.id ? 'Assigning…' : 'Assign'}
                                </button>
                            </div>
                            {assignableRiders.length === 0 && (
                                <p className="text-xs text-amber-800 dark:text-amber-200/90 mt-2">
                                    No riders are currently Available. Riders must go on shift in the rider app, or finish their current delivery.
                                </p>
                            )}
                        </div>
                    )}

                    {(order.rider_id || order.delivery_order_id) && (
                        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 px-3 py-3 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                            <h4 className="text-[0.65rem] font-bold uppercase tracking-wider text-emerald-900/80 dark:text-emerald-300/90 mb-2 flex items-center gap-1.5">
                                <Truck className="w-3.5 h-3.5 shrink-0" />
                                Rider and courier
                            </h4>
                            <div className="space-y-2 text-sm text-foreground">
                                {(order.rider_name || order.rider_phone) && (
                                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                                        {order.rider_name && (
                                            <span className="flex items-center gap-1.5 min-w-0">
                                                <User className="w-4 h-4 text-muted-foreground shrink-0" />
                                                <span className="font-medium break-words">{order.rider_name}</span>
                                            </span>
                                        )}
                                        {order.rider_phone && (
                                            <span className="flex items-center gap-1.5 min-w-0">
                                                <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                                                <span className="break-all">{order.rider_phone}</span>
                                            </span>
                                        )}
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm">
                                    <span>
                                        <span className="text-muted-foreground">Courier status: </span>
                                        <span className="font-semibold">{formatCourierDeliveryStatus(order.delivery_status)}</span>
                                    </span>
                                    <span>
                                        <span className="text-muted-foreground">Rider: </span>
                                        <span className="font-semibold">{formatRiderOperationalStatus(order.rider_operational_status)}</span>
                                    </span>
                                </div>
                                {order.rider_to_dropoff_km != null && Number.isFinite(order.rider_to_dropoff_km) && (
                                    <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                                        <Navigation className="w-4 h-4 shrink-0" />
                                        ~{order.rider_to_dropoff_km.toFixed(2)} km to drop-off
                                    </p>
                                )}
                                {(() => {
                                    const rlat = order.rider_latitude != null ? Number(order.rider_latitude) : NaN;
                                    const rlng = order.rider_longitude != null ? Number(order.rider_longitude) : NaN;
                                    const dlat = order.delivery_lat != null ? Number(order.delivery_lat) : NaN;
                                    const dlng = order.delivery_lng != null ? Number(order.delivery_lng) : NaN;
                                    if (![rlat, rlng, dlat, dlng].every((n) => Number.isFinite(n))) return null;
                                    const href = `https://www.google.com/maps/dir/?api=1&origin=${rlat},${rlng}&destination=${dlat},${dlng}`;
                                    return (
                                        <a
                                            href={href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                                        >
                                            <ExternalLink className="w-4 h-4 shrink-0" />
                                            Open directions (rider → customer)
                                        </a>
                                    );
                                })()}
                            </div>
                        </div>
                    )}

                    <div>
                        <h4 className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground mb-3">
                            Bill — {order.items?.length || 0} line{order.items?.length === 1 ? '' : 's'}
                        </h4>
                        <ul className="divide-y divide-border/80 border border-dashed border-border/70 rounded-xl bg-muted/30 dark:bg-slate-800/40">
                            {(order.items || []).map((item) => (
                                <li key={item.id} className="flex gap-3 px-3 py-3 sm:px-4 sm:py-3.5">
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <p className="text-sm sm:text-base font-semibold text-foreground leading-snug break-words">
                                            {item.product_name}
                                        </p>
                                        <p className="text-xs sm:text-sm text-muted-foreground break-all">
                                            {item.product_sku ? `${item.product_sku} · ` : ''}
                                            {item.quantity} × {formatPrice(item.unit_price)}
                                            {parseFloat(String(item.discount_amount || 0)) > 0 && (
                                                <span className="text-amber-600 dark:text-amber-400"> · disc {formatPrice(item.discount_amount)}</span>
                                            )}
                                        </p>
                                    </div>
                                    <span className="shrink-0 text-sm sm:text-base font-bold tabular-nums text-foreground text-right">
                                        {formatPrice(item.subtotal)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {order.status_history && order.status_history.length > 0 && (
                        <div>
                            <h4 className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground mb-2">History</h4>
                            <div className="space-y-2.5 text-xs sm:text-sm">
                                {order.status_history.map((h) => (
                                    <div key={h.id} className="flex flex-wrap gap-x-2 gap-y-0.5 text-muted-foreground">
                                        <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-indigo-400 dark:bg-indigo-500 mt-1.5" />
                                        <span className="font-medium text-foreground">{h.to_status}</span>
                                        <span className="text-muted-foreground">· {formatDate(h.created_at)}</span>
                                        {h.note && <span className="w-full pl-4 text-muted-foreground break-words sm:pl-0 sm:inline">— {h.note}</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Totals — fixed above actions */}
            <div className="shrink-0 border-t border-border bg-muted/50 px-4 py-3 dark:bg-slate-800/90 sm:px-5">
                <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between gap-4 text-muted-foreground">
                        <span>Subtotal</span>
                        <span className="tabular-nums">{formatPrice(order.subtotal)}</span>
                    </div>
                    {parseFloat(String(order.tax_total)) > 0 && (
                        <div className="flex justify-between gap-4 text-muted-foreground">
                            <span>Tax</span>
                            <span className="tabular-nums">{formatPrice(order.tax_total)}</span>
                        </div>
                    )}
                    {parseFloat(String(order.delivery_fee)) > 0 && (
                        <div className="flex justify-between gap-4 text-muted-foreground">
                            <span>Delivery</span>
                            <span className="tabular-nums">{formatPrice(order.delivery_fee)}</span>
                        </div>
                    )}
                    <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-bold text-foreground">
                        <span>Total</span>
                        <span className="tabular-nums text-indigo-600 dark:text-indigo-400">{formatPrice(order.grand_total)}</span>
                    </div>
                </div>
            </div>

            {/* Action buttons */}
            <div className="shrink-0 border-t border-border p-3 sm:p-4 space-y-2">
                {/* Print receipt — always available for unpaid/active orders */}
                {canPrintUnpaid && (
                    <button
                        type="button"
                        disabled={printing}
                        onClick={async () => {
                            setPrinting(true);
                            try { await onPrintUnpaid(order); } finally { setPrinting(false); }
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 py-2.5 text-sm font-bold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-950/70"
                    >
                        {printing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                        Print Unpaid Receipt
                    </button>
                )}

                {/* Status progression */}
                {nextStatus && !riderLocked && (
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => onStatusUpdate(order.id, nextStatus)}
                            disabled={actionLoading === order.id}
                            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {actionLoading === order.id ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                                <Check className="h-4 w-4" />
                            )}
                            {nextStatus === 'Delivered'
                                ? order.status === 'Packed' && order.payment_method === 'SelfCollection'
                                    ? 'Mark Collected'
                                    : 'Mark Delivered'
                                : `Mark as ${STATUS_CONFIG[nextStatus]?.label || nextStatus}`}
                        </button>
                        {order.status === 'Pending' && (
                            <button
                                type="button"
                                onClick={() => onStatusUpdate(order.id, 'Cancelled')}
                                disabled={actionLoading === order.id}
                                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400 dark:hover:bg-red-950/70"
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                )}

                {/* Collect payment */}
                {isUnpaid && (
                    <button
                        type="button"
                        onClick={() => onCollectPayment(order)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600"
                    >
                        <Banknote className="h-4 w-4 shrink-0" />
                        Collect payment — {formatPrice(order.grand_total)}
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Settings Panel (exported for use in Settings page) ───
export function MobileSettingsPanel({ onBack }: { onBack?: () => void }) {
    const { settings, branding, loadSettings, loadBranding, updateSettings, updateBranding } = useMobileOrders();
    const [branches, setBranches] = useState<ShopBranchOption[]>([]);
    const [selectedBranchId, setSelectedBranchId] = useState<string>('');
    const [qrData, setQrData] = useState<{ slug: string; url: string } | null>(null);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [localSettings, setLocalSettings] = useState<any>(null);
    const [localBranding, setLocalBranding] = useState<any>(null);
    const [copied, setCopied] = useState(false);
    const qrRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadSettings();
        loadBranding();
        shopApi.getBranches().then((list: any[]) => {
            setBranches(list.map((b: any) => ({ id: b.id, name: b.name, code: b.code, location: b.location })));
        }).catch(() => {});
    }, []);

    useEffect(() => {
        if (settings) setLocalSettings({ ...settings });
    }, [settings]);

    useEffect(() => {
        if (branding && !selectedBranchId) setLocalBranding({ ...branding });
    }, [branding, selectedBranchId]);

    // When branch selection changes, load branding and QR for that branch (or tenant default)
    useEffect(() => {
        const branchId = selectedBranchId || undefined;
        mobileOrdersApi.getBranding(branchId).then((b) => {
            setLocalBranding({ ...b });
        }).catch(() => {});
        mobileOrdersApi.getQRCode(branchId).then(setQrData).catch(() => setQrData(null));
    }, [selectedBranchId]);

    const handleDiscard = async () => {
        try {
            await loadSettings();
            await loadBranding();
            const branchId = selectedBranchId || undefined;
            const [b, qr] = await Promise.all([
                mobileOrdersApi.getBranding(branchId),
                mobileOrdersApi.getQRCode(branchId).catch(() => null),
            ]);
            if (b) setLocalBranding({ ...b });
            if (qr) setQrData(qr);
        } catch {
            alert('Failed to discard changes.');
        }
    };

    const handleSaveConfiguration = async () => {
        setSaving(true);
        try {
            if (localSettings) {
                await updateSettings(localSettings);
            }
            if (localBranding) {
                const payload = { ...localBranding };
                if (selectedBranchId) payload.branchId = selectedBranchId;
                await mobileOrdersApi.updateBranding(payload);
                await loadBranding();
                mobileOrdersApi.getQRCode(selectedBranchId || undefined).then(setQrData).catch(() => {});
            }
            alert('Configuration saved.');
        } catch (err: any) {
            alert(err?.error || err?.message || 'Failed to save configuration.');
        }
        setSaving(false);
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !localBranding) return;

        try {
            setUploading(true);
            const res = await shopApi.uploadImage(file);
            setLocalBranding({ ...localBranding, logo_url: res.imageUrl });
        } catch (error) {
            console.error('Logo upload failed', error);
            alert('Failed to upload logo.');
        } finally {
            setUploading(false);
        }
    };

    const handleCopyUrl = () => {
        if (!qrData) return;
        navigator.clipboard.writeText(qrData.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handlePrintSticker = () => {
        if (!qrRef.current || !qrData) return;
        const svg = qrRef.current.querySelector('svg');
        if (!svg) return;

        const svgData = new XMLSerializer().serializeToString(svg);
        const svgBase64 = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
        const shopName = localBranding?.company_name || branding?.company_name || 'Our Shop';
        const brandColor = localBranding?.brand_color || branding?.brand_color || '#4F46E5';

        const printWindow = window.open('', '_blank', 'width=400,height=600');
        if (!printWindow) return;

        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>QR Sticker - ${shopName}</title>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Inter:wght@600;800&display=swap');
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f8f9fa; }
              .sticker {
                width: 80mm; padding: 6mm;
                background: white; border-radius: 4mm;
                text-align: center;
                border: 0.3mm dashed #ccc;
              }
              .sticker h2 { font-size: 16pt; font-weight: 800; margin-bottom: 3mm; color: ${brandColor}; }
              .sticker img { width: 50mm; height: 50mm; margin: 3mm auto; display: block; }
              .sticker .scan-text { font-size: 11pt; font-weight: 600; color: #333; margin: 2mm 0; }
              .sticker .url { font-size: 7pt; color: #999; word-break: break-all; margin-top: 2mm; }
              @media print {
                body { background: none; }
                .sticker { border: none; page-break-inside: avoid; }
              }
            </style>
          </head>
          <body>
            <div class="sticker">
              <h2>${shopName}</h2>
              <img src="${svgBase64}" alt="QR Code" />
              <p class="scan-text">📱 Scan to Order Online</p>
              <p class="url">${qrData.url}</p>
            </div>
            <script>setTimeout(() => { window.print(); }, 500);</script>
          </body>
          </html>
        `);
        printWindow.document.close();
    };

    const MB_PRIMARY = '#004494';
    const MB_ACCENT = '#FF8C00';

    const shopUrlPrefix = (() => {
        if (!qrData?.url) return '';
        try {
            const u = new URL(qrData.url);
            return `${u.host}/`;
        } catch {
            return '';
        }
    })();

    const primaryHex = localBranding?.primary_color || localBranding?.brand_color || MB_PRIMARY;
    const accentHex = localBranding?.accent_color || MB_ACCENT;

    const logoFileLabel = (() => {
        const url = localBranding?.logo_url;
        if (!url) return 'vantage_logo_dark.png';
        const clean = url.split('?')[0];
        const base = clean.split('/').pop();
        return base && base.length > 0 ? base : 'logo.png';
    })();

    const riderMode = localSettings?.rider_assignment_mode || 'auto';

    return (
        <div className="w-full min-w-0 space-y-10 pb-2">
            {onBack && (
                <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronRight className="w-4 h-4 rotate-180" />
                    Back
                </button>
            )}

            {/* —— Mobile Branding —— */}
            <section>
                <h2 className="text-2xl font-bold text-foreground tracking-tight text-balance">Mobile Branding</h2>

                <div className="mt-6 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-8 xl:gap-10">
                    <div className="space-y-6 min-w-0">
                        {/* Shop Access QR */}
                        <div className="rounded-2xl border border-slate-200/90 bg-card p-5 shadow-sm dark:border-slate-600 dark:bg-slate-900/90">
                            {qrData ? (
                                <div className="flex flex-col sm:flex-row gap-5 sm:items-center">
                                    <div className="flex flex-col items-center shrink-0">
                                        <div ref={qrRef} className="bg-black rounded-xl p-3 shadow-inner">
                                            <QRCodeSVG
                                                value={qrData.url}
                                                size={140}
                                                level="H"
                                                includeMargin={false}
                                                bgColor="#FFFFFF"
                                                fgColor="#0f172a"
                                            />
                                            <p className="text-center text-[10px] font-extrabold tracking-[0.35em] text-white pt-2">SHOP</p>
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-3">
                                        <div>
                                            <h3 className="text-lg font-bold text-foreground">Shop Access QR</h3>
                                            <p className="text-sm text-muted-foreground mt-0.5">Instant customer access to your mobile shop.</p>
                                        </div>
                                        <div className="flex flex-wrap gap-3">
                                            <button
                                                type="button"
                                                onClick={handlePrintSticker}
                                                className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 min-w-[8rem] rounded-xl bg-[#004494] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#003a7a]"
                                            >
                                                <Printer className="w-4 h-4 shrink-0" />
                                                Print Code
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleCopyUrl}
                                                className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 min-w-[8rem] rounded-xl border-2 border-[#004494] bg-card px-5 py-2.5 text-sm font-semibold text-[#004494] transition-colors hover:bg-[#004494]/5"
                                            >
                                                {copied ? <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" /> : <Copy className="w-4 h-4 shrink-0" />}
                                                {copied ? 'Copied' : 'Copy URL'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col sm:flex-row gap-5 items-center justify-center py-8 text-center">
                                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#004494] border-t-transparent" />
                                    <p className="text-sm text-muted-foreground">Generating QR code…</p>
                                </div>
                            )}
                        </div>

                        {localBranding ? (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="sm:col-span-2">
                                        <label htmlFor="mobile-branding-branch" className="block text-sm font-medium text-foreground mb-1.5">Branch (QR &amp; orders)</label>
                                        <select
                                            id="mobile-branding-branch"
                                            value={selectedBranchId}
                                            onChange={e => setSelectedBranchId(e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 bg-[#F4F4F9] px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-[#004494] focus:ring-2 focus:ring-[#004494]/20 dark:border-slate-600 dark:bg-slate-800/80"
                                        >
                                            <option value="">Default (first branch)</option>
                                            {branches.map(b => (
                                                <option key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ''}</option>
                                            ))}
                                        </select>
                                        {(localBranding.branch_name || localBranding.branch_location) && (
                                            <p className="text-xs text-muted-foreground mt-1 truncate">
                                                {[localBranding.branch_name, localBranding.branch_location].filter(Boolean).join(' · ')}
                                            </p>
                                        )}
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label htmlFor="mobile-branding-shop-slug" className="block text-sm font-medium text-foreground mb-1.5">Shop URL</label>
                                        <div className="flex rounded-xl border border-slate-200 bg-[#F4F4F9] overflow-hidden dark:border-slate-600 dark:bg-slate-800/80">
                                            {shopUrlPrefix && (
                                                <span className="shrink-0 px-3 py-2.5 text-sm text-muted-foreground border-r border-slate-200/80 dark:border-slate-600">
                                                    {shopUrlPrefix}
                                                </span>
                                            )}
                                            <input
                                                id="mobile-branding-shop-slug"
                                                type="text"
                                                value={localBranding.slug || ''}
                                                onChange={e => setLocalBranding({ ...localBranding, slug: e.target.value })}
                                                placeholder="your-shop-slug"
                                                className="flex-1 min-w-0 bg-transparent border-0 px-3 py-2.5 text-sm text-foreground outline-none font-mono"
                                            />
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1">Orders from this link go to the selected branch&apos;s POS.</p>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1.5">Logo Upload</label>
                                    <div className="flex items-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-[#F4F4F9] px-4 py-4 dark:border-slate-600 dark:bg-slate-800/50">
                                        <CloudUpload className="w-8 h-8 shrink-0 text-[#004494]/80" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-foreground truncate">{logoFileLabel}</p>
                                            <input
                                                type="file"
                                                ref={fileInputRef}
                                                onChange={handleLogoUpload}
                                                className="hidden"
                                                accept="image/*"
                                                aria-label="Upload shop logo image file"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={uploading}
                                                className="mt-0.5 text-sm font-semibold text-[#004494] hover:underline disabled:opacity-50"
                                            >
                                                {uploading ? 'Uploading…' : 'Replace'}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="mobile-branding-address" className="block text-sm font-medium text-foreground mb-1.5">Business Address</label>
                                    <textarea
                                        id="mobile-branding-address"
                                        value={localBranding.address || ''}
                                        onChange={e => setLocalBranding({ ...localBranding, address: e.target.value })}
                                        placeholder="123 Precision Way, Suite 400..."
                                        rows={2}
                                        className="w-full rounded-2xl border border-slate-200 bg-[#F4F4F9] px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-[#004494] focus:ring-2 focus:ring-[#004494]/20 resize-y min-h-[3rem] dark:border-slate-600 dark:bg-slate-800/80"
                                    />
                                </div>

                                <details className="rounded-xl border border-slate-200/80 bg-muted/30 px-3 py-2 text-sm dark:border-slate-600">
                                    <summary className="cursor-pointer font-medium text-muted-foreground">Map coordinates (optional)</summary>
                                    <div className="grid grid-cols-2 gap-2 mt-3 pb-1">
                                        <input
                                            type="number"
                                            step="any"
                                            value={localBranding.lat ?? ''}
                                            onChange={e => setLocalBranding({ ...localBranding, lat: e.target.value ? parseFloat(e.target.value) : null })}
                                            placeholder="Latitude"
                                            className="rounded-lg border border-slate-200 bg-card px-2.5 py-2 text-xs font-mono dark:border-slate-600"
                                        />
                                        <input
                                            type="number"
                                            step="any"
                                            value={localBranding.lng ?? ''}
                                            onChange={e => setLocalBranding({ ...localBranding, lng: e.target.value ? parseFloat(e.target.value) : null })}
                                            placeholder="Longitude"
                                            className="rounded-lg border border-slate-200 bg-card px-2.5 py-2 text-xs font-mono dark:border-slate-600"
                                        />
                                    </div>
                                </details>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-1">
                                    <div>
                                        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Primary Color</label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="color"
                                                value={primaryHex}
                                                onChange={e => setLocalBranding({
                                                    ...localBranding,
                                                    primary_color: e.target.value,
                                                    brand_color: e.target.value,
                                                    secondary_color: localBranding.secondary_color || e.target.value,
                                                })}
                                                className="h-10 w-10 shrink-0 cursor-pointer rounded-full border-2 border-white shadow-md p-0"
                                                aria-label="Primary color"
                                            />
                                            <input
                                                type="text"
                                                value={primaryHex}
                                                onChange={e => setLocalBranding({
                                                    ...localBranding,
                                                    primary_color: e.target.value,
                                                    brand_color: e.target.value,
                                                })}
                                                className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-[#F4F4F9] px-3 py-2 text-sm font-mono uppercase dark:border-slate-600 dark:bg-slate-800/80"
                                                aria-label="Primary color hex value"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Accent Color</label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="color"
                                                value={accentHex}
                                                onChange={e => setLocalBranding({ ...localBranding, accent_color: e.target.value })}
                                                className="h-10 w-10 shrink-0 cursor-pointer rounded-full border-2 border-white shadow-md p-0"
                                                aria-label="Accent color"
                                            />
                                            <input
                                                type="text"
                                                value={accentHex}
                                                onChange={e => setLocalBranding({ ...localBranding, accent_color: e.target.value })}
                                                className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-[#F4F4F9] px-3 py-2 text-sm font-mono uppercase dark:border-slate-600 dark:bg-slate-800/80"
                                                aria-label="Accent color hex value"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                                <RefreshCw className="w-5 h-5 animate-spin text-[#004494]" />
                                <span>Loading branding…</span>
                            </div>
                        )}
                    </div>

                    {/* Live Preview */}
                    <div className="rounded-2xl border border-slate-200/90 bg-[#F4F4F9] p-5 shadow-sm dark:border-slate-600 dark:bg-slate-900/40 xl:sticky xl:top-4 h-fit">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4">
                            <Smartphone className="w-4 h-4 text-[#004494]" />
                            Live Preview
                        </div>
                        <div
                            className="mx-auto flex w-[260px] flex-col overflow-hidden rounded-[2rem] border-[10px] border-slate-800 bg-white shadow-xl dark:border-slate-700"
                            style={{ minHeight: '420px' }}
                        >
                            <div
                                className="flex shrink-0 flex-col items-center justify-center px-4 pt-8 pb-6"
                                style={{ backgroundColor: primaryHex }}
                            >
                                <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-white shadow-md ring-4 ring-white/30 overflow-hidden">
                                    {localBranding?.logo_url ? (
                                        <img src={getFullImageUrl(localBranding.logo_url)} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                        <Store className="w-9 h-9 text-slate-400" />
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-1 flex-col gap-3 bg-white px-4 pb-6 pt-4">
                                <div className="h-2.5 w-3/4 rounded-full bg-slate-200" />
                                <div className="h-2.5 w-1/2 rounded-full bg-slate-100" />
                                <div className="mt-2 space-y-2">
                                    <div className="h-16 rounded-xl bg-slate-100" />
                                    <div className="h-16 rounded-xl bg-slate-100" />
                                </div>
                                <div className="mt-auto pt-6">
                                    <div
                                        className="w-full rounded-2xl py-3.5 text-center text-sm font-bold text-white shadow-md"
                                        style={{ backgroundColor: accentHex }}
                                    >
                                        Check Out
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* —— Ordering Parameters —— */}
            {localSettings && (
                <section>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <h2 className="text-2xl font-bold text-foreground tracking-tight">Ordering Parameters</h2>
                            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                                Configure fulfillment logic, fees, and operational windows for your mobile storefront.
                            </p>
                        </div>
                        <button
                            type="button"
                            className="flex items-center gap-3 shrink-0"
                            onClick={() => setLocalSettings({ ...localSettings, is_enabled: !localSettings.is_enabled })}
                            aria-pressed={localSettings.is_enabled}
                            aria-label="Mobile ordering active"
                        >
                            <div className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${localSettings.is_enabled ? 'bg-[#004494]' : 'bg-slate-300 dark:bg-slate-600'}`}>
                                <span
                                    className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${localSettings.is_enabled ? 'left-7' : 'left-1'}`}
                                />
                            </div>
                            <span className="text-sm font-semibold text-foreground whitespace-nowrap">Mobile Ordering Active</span>
                        </button>
                    </div>

                    <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="rounded-2xl bg-[#F4F4F9] p-5 sm:p-6 dark:bg-slate-800/40">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="mobile-order-min" className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Minimum Order Value</label>
                                    <input
                                        id="mobile-order-min"
                                        type="number"
                                        value={localSettings.minimum_order_amount ?? 0}
                                        onChange={e => setLocalSettings({ ...localSettings, minimum_order_amount: parseFloat(e.target.value) })}
                                        className="w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none ring-1 ring-slate-200/80 focus:ring-2 focus:ring-[#004494] dark:bg-slate-900 dark:ring-slate-600"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="mobile-order-delivery-fee" className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Standard Delivery Fee</label>
                                    <input
                                        id="mobile-order-delivery-fee"
                                        type="number"
                                        value={localSettings.delivery_fee ?? 0}
                                        onChange={e => setLocalSettings({ ...localSettings, delivery_fee: parseFloat(e.target.value) })}
                                        className="w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none ring-1 ring-slate-200/80 focus:ring-2 focus:ring-[#004494] dark:bg-slate-900 dark:ring-slate-600"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="mobile-order-free-threshold" className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Free Delivery Threshold</label>
                                    <input
                                        id="mobile-order-free-threshold"
                                        type="number"
                                        value={localSettings.free_delivery_above ?? ''}
                                        onChange={e => setLocalSettings({ ...localSettings, free_delivery_above: e.target.value ? parseFloat(e.target.value) : null })}
                                        placeholder="—"
                                        className="w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none ring-1 ring-slate-200/80 focus:ring-2 focus:ring-[#004494] dark:bg-slate-900 dark:ring-slate-600"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="mobile-order-est-mins" className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Est. Delivery Time</label>
                                    <div className="flex rounded-xl bg-white shadow-sm ring-1 ring-slate-200/80 focus-within:ring-2 focus-within:ring-[#004494] dark:bg-slate-900 dark:ring-slate-600">
                                        <input
                                            id="mobile-order-est-mins"
                                            type="number"
                                            min={1}
                                            value={localSettings.estimated_delivery_minutes ?? 45}
                                            onChange={e => setLocalSettings({ ...localSettings, estimated_delivery_minutes: parseInt(e.target.value, 10) || 0 })}
                                            className="w-full min-w-0 rounded-l-xl border-0 bg-transparent px-3.5 py-2.5 text-sm outline-none"
                                        />
                                        <span className="flex items-center pr-3 text-xs font-bold text-muted-foreground tabular-nums">MINS</span>
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="mobile-order-from" className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Accept Orders From</label>
                                    <div className="relative">
                                        <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <input
                                            id="mobile-order-from"
                                            type="time"
                                            value={localSettings.order_acceptance_start || '09:00'}
                                            onChange={e => setLocalSettings({ ...localSettings, order_acceptance_start: e.target.value })}
                                            className="w-full rounded-xl border-0 bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm outline-none ring-1 ring-slate-200/80 focus:ring-2 focus:ring-[#004494] dark:bg-slate-900 dark:ring-slate-600"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="mobile-order-until" className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Orders Until</label>
                                    <div className="relative">
                                        <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <input
                                            id="mobile-order-until"
                                            type="time"
                                            value={localSettings.order_acceptance_end || '22:00'}
                                            onChange={e => setLocalSettings({ ...localSettings, order_acceptance_end: e.target.value })}
                                            className="w-full rounded-xl border-0 bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm outline-none ring-1 ring-slate-200/80 focus:ring-2 focus:ring-[#004494] dark:bg-slate-900 dark:ring-slate-600"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div
                            className="rounded-2xl p-5 sm:p-6 text-white shadow-md"
                            style={{ backgroundColor: MB_PRIMARY }}
                        >
                            <div className="flex items-start gap-3">
                                <Bike className="w-6 h-6 shrink-0 opacity-95" />
                                <div>
                                    <h3 className="text-lg font-bold">Rider Logistics</h3>
                                    <p className="text-sm text-white/85 mt-0.5">Select how order assignments are handled for delivery.</p>
                                </div>
                            </div>

                            <div className="mt-5 space-y-3">
                                {([
                                    { id: 'auto' as const, title: 'Automatic Dispatch', sub: 'Nearest available rider notified' },
                                    { id: 'manual' as const, title: 'Manual Assignment', sub: 'Administrator assigns each trip' },
                                    { id: 'third_party' as const, title: 'Third Party Only', sub: 'Redirect to external couriers' },
                                ]).map(opt => (
                                    <label
                                        key={opt.id}
                                        className={`flex cursor-pointer gap-3 rounded-xl border-2 px-4 py-3 transition-colors ${
                                            riderMode === opt.id
                                                ? 'border-white bg-white/15 shadow-inner'
                                                : 'border-transparent bg-white/10 hover:bg-white/15'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="rider_mode_settings"
                                            className="mt-1 h-4 w-4 shrink-0 border-white/50 text-white focus:ring-white/50"
                                            checked={riderMode === opt.id}
                                            onChange={() => setLocalSettings({ ...localSettings, rider_assignment_mode: opt.id })}
                                        />
                                        <span>
                                            <span className="block text-sm font-bold">{opt.title}</span>
                                            <span className="block text-xs text-white/80 mt-0.5">{opt.sub}</span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
            )}

            <div className="flex flex-wrap items-center justify-end gap-4 border-t border-slate-200 pt-6 dark:border-slate-700">
                <button
                    type="button"
                    onClick={handleDiscard}
                    disabled={saving}
                    className="text-sm font-semibold text-slate-600 hover:text-foreground transition-colors disabled:opacity-50 dark:text-slate-400"
                >
                    Discard Changes
                </button>
                <button
                    type="button"
                    onClick={handleSaveConfiguration}
                    disabled={saving || !localBranding || !localSettings}
                    className="min-w-[200px] rounded-xl bg-[#004494] px-8 py-3 text-sm font-bold text-white shadow-md transition-colors hover:bg-[#003a7a] disabled:opacity-50"
                >
                    {saving ? 'Saving…' : 'Save Configuration'}
                </button>
            </div>
        </div>
    );
}

export default MobileOrdersPageContent;
