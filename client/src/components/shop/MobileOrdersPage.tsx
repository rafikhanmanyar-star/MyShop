import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMobileOrders } from '../../context/MobileOrdersContext';
import { mobileOrdersApi, MobileOrder, PosRidersOverview, MobileOnlineUser, MobileUsersStats } from '../../services/mobileOrdersApi';
import { QRCodeSVG } from 'qrcode.react';
import {
    Smartphone, RefreshCw, Package, Truck, Check, X, Clock,
    ChevronRight, WifiOff, Wifi, Bike, CloudUpload,
    Eye, Bell, MapPin, Phone, User, FileText, ShoppingBag,
    Printer, Copy, CheckCircle, Store, Map,
    Banknote, Building2, Wallet, ExternalLink, Navigation, Users,
    ShoppingCart, Activity, UserCheck, Globe, CircleDot, BookOpen, BadgeCheck,
    Mail, History,
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

/** Tab labels aligned with operations dashboard copy */
const FILTER_TAB_LABEL: Record<string, string> = {
    All: 'All',
    Pending: 'Pending',
    Confirmed: 'Confirmed',
    Packed: 'Packed',
    OutForDelivery: 'Out Delivery',
    Delivered: 'Delivered',
    Unpaid: 'Unpaid',
    Cancelled: 'Cancelled',
};

function formatShortTime(d: string): string {
    return new Date(d).toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' });
}

function mobileOrderPaymentBadge(order: Pick<MobileOrder, 'payment_method' | 'payment_status'>): {
    label: string;
    className: string;
} {
    const paid = order.payment_status === 'Paid';
    if (paid) {
        if (order.payment_method === 'EasypaisaJazzcashOnline') {
            return { label: 'PAID VIA WALLET', className: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800' };
        }
        if (order.payment_method === 'COD') {
            return { label: 'PAID — COD', className: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800' };
        }
        if (order.payment_method === 'SelfCollection') {
            return { label: 'PAID — PICKUP', className: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800' };
        }
        return { label: 'PAID', className: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800' };
    }
    if (order.payment_method === 'EasypaisaJazzcashOnline') {
        return { label: 'PAY ONLINE / WALLET', className: 'bg-sky-50 text-sky-900 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-800' };
    }
    if (order.payment_method === 'SelfCollection') {
        return { label: 'PAY ON PICKUP', className: 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800' };
    }
    return { label: 'COD — UNPAID', className: 'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-800' };
}

function historyTimeForStatus(history: MobileOrder['status_history'], status: string): string | null {
    const h = history?.find((x) => x.to_status === status);
    return h ? h.created_at : null;
}

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

    const handlePrintMobileInvoice = async (order: MobileOrder) => {
        try {
            const orderToPrint = order.items?.length ? order : await mobileOrdersApi.getOrder(order.id);
            const { createThermalPrinter } = await import('../../services/printer/thermalPrinter');
            const printer = createThermalPrinter();
            const paid = orderToPrint.payment_status === 'Paid';
            await printer.printReceipt({
                storeName: branding?.company_name || 'My Shop',
                storeAddress: branding?.address || '',
                receiptNumber: orderToPrint.order_number,
                date: new Date(orderToPrint.created_at).toLocaleDateString(),
                time: new Date(orderToPrint.created_at).toLocaleTimeString(),
                cashier: 'Mobile Order',
                customer: `${orderToPrint.customer_name || ''} - ${orderToPrint.customer_phone || ''}`,
                items: (orderToPrint.items || []).map((item) => ({
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
                    {
                        method: paid ? `${formatMobilePaymentMethod(orderToPrint.payment_method)} (Paid)` : formatMobilePaymentMethod(orderToPrint.payment_method),
                        amount: parseFloat(String(orderToPrint.grand_total)),
                    },
                ],
                footer: `${paid ? 'INVOICE — PAID' : 'INVOICE — UNPAID'}\nRef: ${orderToPrint.order_number}\nDelivery: ${formatMobilePaymentMethod(orderToPrint.payment_method)}\nDelivery Fee: PKR ${orderToPrint.delivery_fee}\n${orderToPrint.delivery_address ? `Address: ${orderToPrint.delivery_address}\n` : ''}${orderToPrint.delivery_notes ? `Note: ${orderToPrint.delivery_notes}\n` : ''}`,
                showBarcode: true,
            });
        } catch (err: any) {
            alert(err.error || err.message || 'Failed to print invoice');
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
        label: FILTER_TAB_LABEL[s] || STATUS_CONFIG[s]?.label || s,
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
        <div className="flex w-full min-w-0 flex-col h-full min-h-0 flex-1 bg-slate-100 dark:bg-slate-900">
            <div className="bg-white dark:bg-slate-950 border border-slate-200/90 dark:border-slate-700 shadow-sm z-10 shrink-0 mx-3 sm:mx-4 mt-3 rounded-xl overflow-hidden">
                <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200/80 dark:border-slate-800">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex flex-wrap items-center gap-3 min-w-0">
                            <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                                Mobile Orders
                            </h1>
                            {sseConnected ? (
                                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                                    Live system
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                                    <WifiOff className="w-3 h-3" />
                                    Offline
                                </span>
                            )}
                            {pendingCount > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[0.65rem] font-bold text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                                    <Bell className="w-3 h-3 shrink-0" /> {pendingCount} pending
                                </span>
                            )}
                        </div>

                        {ridersOverview?.stats && (
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.7rem] sm:text-xs">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <span className="font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Riders</span>
                                    <span className="tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                                        {ridersOverview.stats.available} available
                                    </span>
                                    <span className="text-slate-300 dark:text-slate-600">·</span>
                                    <span className="tabular-nums font-semibold text-amber-600 dark:text-amber-400">
                                        {ridersOverview.stats.busy} busy
                                    </span>
                                    <span className="text-slate-300 dark:text-slate-600">·</span>
                                    <span className="tabular-nums font-semibold text-slate-500 dark:text-slate-400">
                                        {ridersOverview.stats.offline} offline
                                    </span>
                                </div>
                                <div className="hidden sm:block w-px h-4 bg-slate-200 dark:bg-slate-700" aria-hidden />
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <span className="font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Accounts</span>
                                    <span className="tabular-nums font-semibold text-blue-600 dark:text-blue-400">
                                        {ridersOverview.stats.active_accounts} active
                                    </span>
                                    <span className="text-slate-300 dark:text-slate-600">·</span>
                                    <span className="tabular-nums font-semibold text-blue-600 dark:text-blue-400">
                                        {ridersOverview.stats.open_deliveries} open deliveries
                                    </span>
                                </div>
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2 justify-end">
                            <button
                                type="button"
                                onClick={() => setStatusFilter(LIVE_MAP_TAB)}
                                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                                    statusFilter === LIVE_MAP_TAB
                                        ? 'border-blue-600 bg-blue-600 text-white'
                                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                                }`}
                            >
                                <Map className="w-3.5 h-3.5 shrink-0" />
                                Live Map
                                <span className="tabular-nums rounded-md bg-white/15 px-1.5 py-px text-[0.65rem] opacity-90">{mapReadyCount}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setStatusFilter(MOBILE_USERS_TAB)}
                                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                                    statusFilter === MOBILE_USERS_TAB
                                        ? 'border-blue-600 bg-blue-600 text-white'
                                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                                }`}
                            >
                                <UserCheck className="w-3.5 h-3.5 shrink-0" />
                                Mobile Users
                                {onlineUsersStats != null && onlineUsersStats.online_now > 0 && (
                                    <span className="tabular-nums rounded-md bg-white/15 px-1.5 py-px text-[0.65rem]">
                                        {onlineUsersStats.online_now}
                                    </span>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (statusFilter === MOBILE_USERS_TAB) loadOnlineUsers();
                                    else {
                                        loadOrders(
                                            statusFilter === LIVE_MAP_TAB || statusFilter === 'All' ? undefined : statusFilter
                                        );
                                        loadRidersOverview();
                                    }
                                }}
                                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                                title="Refresh"
                            >
                                <RefreshCw
                                    className={`w-4 h-4 ${loading || ridersOverviewLoading || onlineUsersLoading ? 'animate-spin' : ''}`}
                                />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="px-3 sm:px-5 py-2 bg-slate-50/80 dark:bg-slate-900/50 border-b border-slate-200/80 dark:border-slate-800">
                    <div className="flex gap-1.5 overflow-x-auto overflow-y-hidden pb-0.5 custom-scrollbar [scrollbar-gutter:stable]">
                        {filterCounts.map(({ key: s, label, count }) => {
                            const active = statusFilter === s;
                            const isDeliveredTab = s === 'Delivered';
                            return (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => setStatusFilter(s)}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0 border ${
                                        active
                                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                            : isDeliveredTab
                                              ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-emerald-600 dark:text-emerald-400 hover:border-blue-300'
                                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-blue-300 dark:hover:border-blue-600/50'
                                    }`}
                                >
                                    {label}
                                    <span
                                        className={`tabular-nums text-[0.65rem] px-1.5 py-px rounded ${
                                            active ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800'
                                        }`}
                                    >
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Content: list + bill — scrollbars only when content overflows */}
            <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden px-3 sm:px-4 pb-4 pt-2">
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
                    <div className="min-h-0 flex-1 overflow-auto custom-scrollbar [scrollbar-gutter:stable] rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950 p-2 sm:p-3 space-y-2">
                    {loading && orders.length === 0 ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400" />
                        </div>
                    ) : orders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-500 dark:text-slate-400">
                            <ShoppingBag className="w-16 h-16 mb-4 opacity-30" />
                            <p className="text-lg font-semibold">No orders found</p>
                            <p className="text-sm">Orders from mobile customers will appear here</p>
                        </div>
                    ) : (
                        orders.map((order) => {
                            const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.Pending;
                            const StatusIcon = cfg.icon;
                            const selected = detailOrder?.id === order.id;
                            const deliveryPill =
                                order.payment_method === 'SelfCollection'
                                    ? {
                                          text: 'In-store pickup',
                                          pillClass:
                                              'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600',
                                      }
                                    : {
                                          text: 'Door delivery',
                                          pillClass:
                                              'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-800',
                                      };

                            return (
                                <div
                                    key={order.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => handleViewDetail(order)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            handleViewDetail(order);
                                        }
                                    }}
                                    className={`rounded-lg border bg-white dark:bg-slate-950 cursor-pointer transition-all hover:shadow-sm text-left w-full ${
                                        selected
                                            ? 'border-blue-300 shadow-md border-l-4 border-l-blue-600 dark:border-blue-800'
                                            : 'border-slate-200 dark:border-slate-700 border-l-4 border-l-transparent'
                                    }`}
                                >
                                    {isLiveMapView ? (
                                        <div className="p-3 sm:p-4 space-y-2">
                                            <div className="flex justify-between gap-2 items-start">
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="text-sm font-bold text-blue-600 dark:text-blue-400 font-mono">
                                                            {order.order_number}
                                                        </span>
                                                        <span className="text-xs text-slate-500">{formatShortTime(order.created_at)}</span>
                                                    </div>
                                                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                                                        <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                                                            {(order.customer_name || 'Customer').trim()}
                                                        </span>
                                                        {order.customer_mobile_verified && (
                                                            <BadgeCheck className="w-4 h-4 text-blue-600 shrink-0" aria-hidden />
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-slate-500 mt-1">{order.customer_phone}</p>
                                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                                        <span
                                                            className={`inline-flex rounded-full border px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide ${deliveryPill.pillClass}`}
                                                        >
                                                            {deliveryPill.text}
                                                        </span>
                                                        <span
                                                            className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-px text-[0.65rem] font-bold ${cfg.bg} ${cfg.color}`}
                                                        >
                                                            <StatusIcon className="w-3 h-3 shrink-0" />
                                                            {cfg.label}
                                                        </span>
                                                        {order.distance_km != null && Number.isFinite(Number(order.distance_km)) && (
                                                            <span className="text-[0.65rem] font-semibold text-slate-500">
                                                                {Number(order.distance_km).toFixed(1)} km
                                                            </span>
                                                        )}
                                                    </div>
                                                    {(order.rider_name || order.delivery_order_id) && (
                                                        <p className="text-[0.7rem] text-emerald-700 dark:text-emerald-400 flex items-center gap-1 mt-1">
                                                            <Truck className="w-3 h-3 shrink-0" />
                                                            {order.rider_name || 'Courier'}
                                                        </p>
                                                    )}
                                                </div>
                                                <span className="text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums shrink-0">
                                                    {formatPrice(order.grand_total)}
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-4">
                                            <div className="flex justify-between gap-3 items-start">
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                        <span className="text-sm font-bold text-blue-600 dark:text-blue-400 font-mono tracking-tight">
                                                            {order.order_number}
                                                        </span>
                                                        <span className="text-xs text-slate-500 tabular-nums">
                                                            {formatShortTime(order.created_at)}
                                                        </span>
                                                    </div>
                                                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                                                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                                                            {order.customer_name || 'Customer'}
                                                        </span>
                                                        {order.customer_mobile_verified && (
                                                            <BadgeCheck className="w-4 h-4 text-blue-600 shrink-0" aria-label="Verified customer" />
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-slate-500 mt-1 tabular-nums">{order.customer_phone}</p>
                                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                                        <span
                                                            className={`inline-flex rounded-full border px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide ${deliveryPill.pillClass}`}
                                                        >
                                                            {deliveryPill.text}
                                                        </span>
                                                        <span
                                                            className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-px text-[0.65rem] font-bold shrink-0 ${cfg.bg} ${cfg.color}`}
                                                        >
                                                            <StatusIcon className="w-3 h-3 shrink-0" />
                                                            {cfg.label}
                                                        </span>
                                                        {(order.rider_name || order.delivery_order_id) && (
                                                            <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-px text-[0.65rem] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                                                                <Truck className="w-3 h-3 shrink-0" />
                                                                {order.rider_name || 'Courier'}
                                                            </span>
                                                        )}
                                                        {!isRiderAssignedDelivery(order) &&
                                                            order.payment_method !== 'SelfCollection' &&
                                                            order.status !== 'Delivered' &&
                                                            order.status !== 'Cancelled' && (
                                                                <span className="inline-flex items-center gap-0.5 text-[0.65rem] font-semibold text-amber-700 dark:text-amber-300">
                                                                    <Users className="w-3 h-3 shrink-0" />
                                                                    No rider
                                                                </span>
                                                            )}
                                                    </div>
                                                </div>
                                                <span className="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums shrink-0">
                                                    {formatPrice(order.grand_total)}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                    </div>
                </div>

                {isLiveMapView && (
                    <div className="relative flex min-h-[min(52vh,440px)] min-w-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950 xl:min-h-0">
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
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950">
                    {detailLoading ? (
                        <div className="flex flex-1 items-center justify-center p-10 min-h-[12rem]">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400" />
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
                            onPrintInvoice={handlePrintMobileInvoice}
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

function customerNameInitials(name: string | null | undefined): string {
    const parts = (name || 'Customer').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function OrderDetailFulfillmentTimeline({ order, formatShortTime }: { order: MobileOrder; formatShortTime: (d: string) => string }) {
    const hist = order.status_history || [];
    const cancelled = order.status === 'Cancelled';
    const tConfirmed = historyTimeForStatus(hist, 'Confirmed');
    const tPacked = historyTimeForStatus(hist, 'Packed');
    const tOut = historyTimeForStatus(hist, 'OutForDelivery');
    const step3Label = order.payment_method === 'SelfCollection' ? 'Packed / ready' : 'Out for delivery';

    const step1Time = formatShortTime(order.created_at);
    const step2Done = !cancelled && !['Pending'].includes(order.status);
    const step2Time = tConfirmed ? formatShortTime(tConfirmed) : step2Done ? '—' : null;

    const isPickup = order.payment_method === 'SelfCollection';
    const step3Done = isPickup
        ? !cancelled && ['Packed', 'OutForDelivery', 'Delivered'].includes(order.status)
        : !cancelled && ['OutForDelivery', 'Delivered'].includes(order.status);
    const step3TimeRaw = isPickup ? tPacked || (order.status === 'Delivered' ? historyTimeForStatus(hist, 'Delivered') : null) : tOut;
    const step3Time = step3Done ? (step3TimeRaw ? formatShortTime(step3TimeRaw) : '—') : null;

    const dot = (done: boolean, current: boolean) =>
        `flex h-3 w-3 shrink-0 rounded-full border-2 ${
            cancelled
                ? 'border-slate-300 bg-slate-200 dark:border-slate-600 dark:bg-slate-700'
                : done
                  ? 'border-emerald-500 bg-emerald-500'
                  : current
                    ? 'border-blue-500 bg-white dark:bg-slate-950'
                    : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-950'
        }`;

    return (
        <div className="space-y-0">
            <p className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">Order timeline</p>
            {cancelled && (
                <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2">This order was cancelled.</p>
            )}
            <ul className="space-y-4">
                <li className="flex gap-3">
                    <div className="flex flex-col items-center pt-0.5">
                        <span className={dot(true, false)} />
                        <span className="w-px flex-1 min-h-[1.25rem] bg-slate-200 dark:bg-slate-700" />
                    </div>
                    <div className="min-w-0 pb-1">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Order placed</p>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 tabular-nums">{step1Time}</p>
                    </div>
                </li>
                <li className="flex gap-3">
                    <div className="flex flex-col items-center pt-0.5">
                        <span className={dot(step2Done, !step2Done && !cancelled && order.status === 'Pending')} />
                        <span className="w-px flex-1 min-h-[1.25rem] bg-slate-200 dark:bg-slate-700" />
                    </div>
                    <div className="min-w-0 pb-1">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Confirmed &amp; processing</p>
                        <p className={`text-xs tabular-nums ${step2Done ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}>
                            {step2Done ? step2Time : 'Pending'}
                        </p>
                    </div>
                </li>
                <li className="flex gap-3">
                    <div className="flex flex-col items-center pt-0.5">
                        <span className={dot(step3Done, !step3Done && step2Done && !cancelled)} />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{step3Label}</p>
                        <p className={`text-xs tabular-nums ${step3Done ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400'}`}>
                            {step3Done ? step3Time : 'Pending'}
                        </p>
                    </div>
                </li>
            </ul>
        </div>
    );
}

// ─── Order Detail Panel ───────────────────────────────────
function OrderDetailPanel({
    order,
    onStatusUpdate,
    onCollectPayment,
    onPrintUnpaid,
    onPrintInvoice,
    actionLoading,
    formatPrice,
    formatDate,
    assignableRiders,
    onAssignRider,
    assignLoadingOrderId,
    riderAssignmentMode,
}: {
    order: MobileOrder;
    onStatusUpdate: (id: string, status: string) => void;
    onCollectPayment: (order: MobileOrder) => void;
    onPrintUnpaid: (order: MobileOrder) => void | Promise<void>;
    onPrintInvoice: (order: MobileOrder) => void | Promise<void>;
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
    const [printBusy, setPrintBusy] = useState<null | 'unpaid' | 'invoice'>(null);
    const payBadge = mobileOrderPaymentBadge(order);
    const tier = order.customer_loyalty_tier?.trim();
    const orderCount = order.customer_order_count ?? 0;
    const email = order.customer_email?.trim();

    useEffect(() => {
        setManualRiderId('');
    }, [order.id]);

    return (
        <div className="flex h-full min-h-0 flex-col bg-white dark:bg-slate-950">
            <div className="shrink-0 border-b border-slate-200 dark:border-slate-800 px-4 py-3 sm:px-5 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-500">Order ID</p>
                    <p className="font-mono font-bold text-blue-600 dark:text-blue-400 break-all">{order.order_number}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{formatDate(order.created_at)}</p>
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

            <div className="min-h-0 flex-1 overflow-auto custom-scrollbar [scrollbar-gutter:stable] px-4 py-4 sm:px-5">
                <div className="space-y-5">
                    {riderLocked && order.status !== 'Delivered' && order.status !== 'Cancelled' && (
                        <div className="rounded-lg border border-blue-200 bg-blue-50/80 px-3 py-2.5 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
                            A rider is assigned. Fulfillment status is updated from the rider mobile app.
                        </div>
                    )}

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-slate-100 dark:border-slate-800 pb-5">
                        <div className="flex gap-3 min-w-0">
                            <div className="w-14 h-14 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-base font-bold text-slate-600 dark:text-slate-300 shrink-0">
                                {customerNameInitials(order.customer_name)}
                            </div>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight">
                                        {order.customer_name || 'Customer'}
                                    </h2>
                                    {tier && (
                                        <span className="rounded-md bg-blue-600 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-white">
                                            {tier}
                                        </span>
                                    )}
                                    {order.customer_mobile_verified && (
                                        <BadgeCheck className="w-5 h-5 text-blue-600 shrink-0" aria-label="Verified customer" />
                                    )}
                                </div>
                                <div className="mt-2 flex flex-col sm:flex-row sm:flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
                                    <span className="inline-flex items-center gap-1.5 min-w-0">
                                        <Phone className="w-3.5 h-3.5 shrink-0 opacity-70" />
                                        <span className="tabular-nums break-all">{order.customer_phone}</span>
                                    </span>
                                    {email && (
                                        <span className="inline-flex items-center gap-1.5 min-w-0">
                                            <Mail className="w-3.5 h-3.5 shrink-0 opacity-70" />
                                            <span className="break-all">{email}</span>
                                        </span>
                                    )}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
                                    <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                                        <ShoppingBag className="w-3.5 h-3.5 opacity-70" />
                                        {orderCount} orders total
                                    </span>
                                    {order.customer_mobile_verified && (
                                        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                                            <CheckCircle className="w-3.5 h-3.5" />
                                            Identity verified
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="text-left sm:text-right shrink-0 space-y-1">
                            <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide ${payBadge.className}`}
                            >
                                {payBadge.label}
                            </span>
                            <p className="text-[0.65rem] text-slate-500 dark:text-slate-400">
                                Ref ID · <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{order.order_number}</span>
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 p-3">
                            <p className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-500 mb-2">Delivery address</p>
                            {order.payment_method === 'SelfCollection' ? (
                                <p className="text-sm text-slate-600 dark:text-slate-400">In-store pickup — customer collects at the branch.</p>
                            ) : order.delivery_address ? (
                                <>
                                    <p className="text-sm text-slate-900 dark:text-slate-100 leading-relaxed break-words">{order.delivery_address}</p>
                                    {(order.assigned_branch_name || order.distance_km != null) && (
                                        <p className="text-xs text-slate-500 mt-2">
                                            {order.assigned_branch_name && (
                                                <span>
                                                    Branch: <span className="font-medium text-slate-700 dark:text-slate-300">{order.assigned_branch_name}</span>
                                                    {order.distance_km != null ? ' · ' : ''}
                                                </span>
                                            )}
                                            {order.distance_km != null && (
                                                <span>~{Number(order.distance_km).toFixed(2)} km (straight line)</span>
                                            )}
                                        </p>
                                    )}
                                </>
                            ) : (
                                <p className="text-sm text-slate-500">No address on file.</p>
                            )}
                            {order.delivery_lat != null &&
                                order.delivery_lng != null &&
                                Number.isFinite(Number(order.delivery_lat)) &&
                                Number.isFinite(Number(order.delivery_lng)) && (
                                    <a
                                        href={`https://www.google.com/maps?q=${Number(order.delivery_lat)},${Number(order.delivery_lng)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline mt-3 dark:text-blue-400"
                                    >
                                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                                        View on map
                                    </a>
                                )}
                        </div>
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-950">
                            <OrderDetailFulfillmentTimeline order={order} formatShortTime={formatShortTime} />
                        </div>
                    </div>

                    {order.delivery_notes && (
                        <div>
                            <p className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-500 mb-1.5">Customer note</p>
                            <p className="text-sm italic text-slate-700 dark:text-slate-300 leading-relaxed break-words border border-slate-100 dark:border-slate-800 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-900/30">
                                {order.delivery_notes}
                            </p>
                        </div>
                    )}

                    {canManualAssign && riderAssignmentMode === 'third_party' && (
                        <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-3 text-sm text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
                            Rider logistics is set to third-party couriers. Assign and track delivery outside the in-app rider workflow when needed.
                        </div>
                    )}

                    {canManualAssign && riderAssignmentMode !== 'third_party' && (
                        <div className="rounded-lg border border-dashed border-blue-300/80 bg-blue-50/30 px-3 py-3 dark:border-blue-800 dark:bg-blue-950/20">
                            <h4 className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
                                <Truck className="w-3.5 h-3.5 shrink-0" />
                                Assign rider
                            </h4>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mb-3 leading-relaxed">
                                {riderAssignmentMode === 'manual'
                                    ? 'Select an available rider to deliver this order. Only riders on shift in the rider app are listed.'
                                    : 'No rider was auto-assigned at checkout. Choose an available rider here.'}
                            </p>
                            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                                <select
                                    aria-label="Choose rider for manual assignment"
                                    value={manualRiderId}
                                    onChange={(e) => setManualRiderId(e.target.value)}
                                    className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-600"
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
                                    className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
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
                            <div className="space-y-2 text-sm text-slate-900 dark:text-slate-100">
                                {(order.rider_name || order.rider_phone) && (
                                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                                        {order.rider_name && (
                                            <span className="flex items-center gap-1.5 min-w-0">
                                                <User className="w-4 h-4 text-slate-400 shrink-0" />
                                                <span className="font-medium break-words">{order.rider_name}</span>
                                            </span>
                                        )}
                                        {order.rider_phone && (
                                            <span className="flex items-center gap-1.5 min-w-0">
                                                <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                                                <span className="break-all">{order.rider_phone}</span>
                                            </span>
                                        )}
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm">
                                    <span>
                                        <span className="text-slate-500">Courier status: </span>
                                        <span className="font-semibold">{formatCourierDeliveryStatus(order.delivery_status)}</span>
                                    </span>
                                    <span>
                                        <span className="text-slate-500">Rider: </span>
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
                                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400"
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
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <h4 className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-500">Order bill</h4>
                            {order.status !== 'Cancelled' && (order.items?.length || 0) > 0 && (
                                <button
                                    type="button"
                                    disabled={printBusy !== null}
                                    onClick={async () => {
                                        setPrintBusy('invoice');
                                        try {
                                            await onPrintInvoice(order);
                                        } finally {
                                            setPrintBusy(null);
                                        }
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                    {printBusy === 'invoice' ? (
                                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Printer className="h-3.5 w-3.5" />
                                    )}
                                    Print invoice
                                </button>
                            )}
                        </div>
                        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                            <table className="w-full min-w-[320px] text-sm">
                                <thead>
                                    <tr className="bg-slate-100/90 dark:bg-slate-900/80 text-left text-[0.65rem] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                                        <th className="px-3 py-2">Item name</th>
                                        <th className="px-3 py-2 w-[1%] whitespace-nowrap">SKU</th>
                                        <th className="px-3 py-2 w-[1%] whitespace-nowrap text-right">Qty</th>
                                        <th className="px-3 py-2 w-[1%] whitespace-nowrap text-right">Price</th>
                                        <th className="px-3 py-2 w-[1%] whitespace-nowrap text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {(order.items || []).map((item) => (
                                        <tr key={item.id} className="bg-white dark:bg-slate-950">
                                            <td className="px-3 py-2.5 align-top">
                                                <p className="font-semibold text-slate-900 dark:text-slate-100 break-words">{item.product_name}</p>
                                                {parseFloat(String(item.discount_amount || 0)) > 0 && (
                                                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                                                        Discount {formatPrice(item.discount_amount)}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5 align-top text-xs text-slate-500 font-mono whitespace-nowrap">
                                                {item.product_sku || '—'}
                                            </td>
                                            <td className="px-3 py-2.5 align-top text-right tabular-nums">{item.quantity}</td>
                                            <td className="px-3 py-2.5 align-top text-right tabular-nums whitespace-nowrap">
                                                {formatPrice(item.unit_price)}
                                            </td>
                                            <td className="px-3 py-2.5 align-top text-right font-semibold tabular-nums whitespace-nowrap">
                                                {formatPrice(item.subtotal)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {order.status_history && order.status_history.length > 0 && (
                        <details className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-sm">
                            <summary className="font-bold text-slate-700 dark:text-slate-300 cursor-pointer list-none flex items-center gap-2">
                                <History className="w-4 h-4" />
                                Status history
                            </summary>
                            <ul className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-400">
                                {order.status_history.map((h) => (
                                    <li key={h.id} className="flex flex-wrap gap-x-2">
                                        <span className="font-semibold text-slate-900 dark:text-slate-100">{h.to_status}</span>
                                        <span className="tabular-nums">{formatDate(h.created_at)}</span>
                                        {h.note && <span className="w-full text-slate-500 break-words">{h.note}</span>}
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                </div>
            </div>

            <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/80 px-4 py-3 sm:px-5">
                <div className="space-y-1.5 text-sm max-w-md ml-auto">
                    <div className="flex justify-between gap-4 text-slate-600 dark:text-slate-400">
                        <span>Subtotal</span>
                        <span className="tabular-nums">{formatPrice(order.subtotal)}</span>
                    </div>
                    {parseFloat(String(order.tax_total)) > 0 && (
                        <div className="flex justify-between gap-4 text-slate-600 dark:text-slate-400">
                            <span>Tax</span>
                            <span className="tabular-nums">{formatPrice(order.tax_total)}</span>
                        </div>
                    )}
                    <div className="flex justify-between gap-4 text-slate-600 dark:text-slate-400">
                        <span>Delivery fee</span>
                        {parseFloat(String(order.delivery_fee)) <= 0 ? (
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">FREE</span>
                        ) : (
                            <span className="tabular-nums">{formatPrice(order.delivery_fee)}</span>
                        )}
                    </div>
                    <div className="flex justify-between gap-4 border-t border-slate-200 dark:border-slate-700 pt-2 text-base font-bold text-slate-900 dark:text-slate-100">
                        <span>Total amount</span>
                        <span className="tabular-nums text-blue-600 dark:text-blue-400">{formatPrice(order.grand_total)}</span>
                    </div>
                </div>
            </div>

            <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 p-3 sm:p-4 space-y-2 bg-white dark:bg-slate-950">
                {canPrintUnpaid && (
                    <button
                        type="button"
                        disabled={printBusy !== null}
                        onClick={async () => {
                            setPrintBusy('unpaid');
                            try {
                                await onPrintUnpaid(order);
                            } finally {
                                setPrintBusy(null);
                            }
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 py-2.5 text-sm font-bold text-blue-800 transition-colors hover:bg-blue-100 disabled:opacity-50 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200 dark:hover:bg-blue-950/70"
                    >
                        {printBusy === 'unpaid' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                        Print unpaid receipt
                    </button>
                )}

                {nextStatus && !riderLocked && (
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => onStatusUpdate(order.id, nextStatus)}
                            disabled={actionLoading === order.id}
                            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                        >
                            {actionLoading === order.id ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                                <Check className="h-4 w-4" />
                            )}
                            {nextStatus === 'Delivered'
                                ? order.status === 'Packed' && order.payment_method === 'SelfCollection'
                                    ? 'Mark collected'
                                    : 'Mark delivered'
                                : `Mark as ${STATUS_CONFIG[nextStatus]?.label || nextStatus}`}
                        </button>
                        {order.status === 'Pending' && (
                            <button
                                type="button"
                                onClick={() => onStatusUpdate(order.id, 'Cancelled')}
                                disabled={actionLoading === order.id}
                                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/60"
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                )}

                {isUnpaid && (
                    <button
                        type="button"
                        onClick={() => onCollectPayment(order)}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600"
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
