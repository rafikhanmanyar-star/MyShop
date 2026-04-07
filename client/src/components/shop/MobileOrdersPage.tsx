import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMobileOrders } from '../../context/MobileOrdersContext';
import { mobileOrdersApi, MobileOrder } from '../../services/mobileOrdersApi';
import { QRCodeSVG } from 'qrcode.react';
import {
    Smartphone, RefreshCw, Package, Truck, Check, X, Clock,
    ChevronRight, WifiOff, Wifi, QrCode, Settings as SettingsIcon,
    Filter, Eye, Bell, MapPin, Phone, User, FileText, ShoppingBag,
    Printer, Download, Copy, CheckCircle, Upload, Palette, Monitor, Store,
    Banknote, Building2, Wallet,
} from 'lucide-react';
import { shopApi } from '../../services/shopApi';
import { getFullImageUrl } from '../../config/apiUrl';

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

const STATUS_FILTERS = ['All', 'Pending', 'Confirmed', 'Packed', 'OutForDelivery', 'Delivered', 'Unpaid', 'Cancelled'];

// ─── Main Page ────────────────────────────────────────────
function MobileOrdersPageContent() {
    const {
        orders, loading, error, sseConnected, newOrderCount, branding,
        loadOrders, clearNewOrderCount, updateOrderStatus, collectPayment, loadBranding
    } = useMobileOrders();

    useEffect(() => {
        loadBranding();
    }, [loadBranding]);

    const [searchParams, setSearchParams] = useSearchParams();
    const orderIdFromUrl = searchParams.get('order');

    const [statusFilter, setStatusFilter] = useState('All');
    const [detailOrder, setDetailOrder] = useState<MobileOrder | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState('');
    const [bankAccounts, setBankAccounts] = useState<any[]>([]);
    const [paymentModal, setPaymentModal] = useState<{ orderId: string; orderNumber: string; grandTotal: number } | null>(null);
    const [selectedBankAccount, setSelectedBankAccount] = useState('');
    const [paymentLoading, setPaymentLoading] = useState(false);

    useEffect(() => {
        shopApi.getBankAccounts().then(setBankAccounts).catch(() => {});
    }, []);

    useEffect(() => {
        loadOrders(statusFilter === 'All' ? undefined : statusFilter);
        clearNewOrderCount();
    }, [statusFilter]);

    useEffect(() => {
        if (newOrderCount > 0) {
            loadOrders(statusFilter === 'All' ? undefined : statusFilter);
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

    const handleViewDetail = useCallback((order: MobileOrder) => {
        setSearchParams((prev) => {
            const p = new URLSearchParams(prev);
            p.set('order', order.id);
            return p;
        }, { replace: true });
    }, [setSearchParams]);

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

    return (
        <div className="flex w-full min-w-0 flex-col h-full min-h-0 flex-1 bg-muted/80 dark:bg-slate-800">
            <div className="bg-card dark:bg-slate-900 border-b border-border dark:border-slate-700 px-6 sm:px-8 pt-6 pb-4 shadow-sm z-10">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 shrink-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 dark:shadow-indigo-900/40">
                            <Smartphone className="w-6 h-6 text-white" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-2xl font-bold text-foreground dark:text-slate-200 tracking-tight">Mobile Orders</h1>
                            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                <span className="flex items-center gap-1.5 text-xs font-medium">
                                    {sseConnected ? (
                                        <><Wifi className="w-3.5 h-3.5 text-green-500 dark:text-green-400" /><span className="text-green-600 dark:text-green-400">Live</span></>
                                    ) : (
                                        <><WifiOff className="w-3.5 h-3.5 text-red-400" /><span className="text-red-500 dark:text-red-400">Disconnected</span></>
                                    )}
                                </span>
                                {pendingCount > 0 && (
                                    <span className="flex items-center gap-1 bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 px-2 py-0.5 rounded-full text-xs font-bold">
                                        <Bell className="w-3 h-3" /> {pendingCount} pending
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => loadOrders(statusFilter === 'All' ? undefined : statusFilter)}
                            className="p-2.5 bg-card dark:bg-slate-800/80 border border-border dark:border-slate-600 rounded-xl hover:bg-muted dark:hover:bg-slate-700/80 transition-colors"
                            title="Refresh"
                        >
                            <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex flex-1 min-h-0 flex-col overflow-hidden p-6 sm:p-8 gap-6">
            {/* Status Filter */}
            <div className="flex shrink-0 gap-2 overflow-x-auto pb-1">
                {STATUS_FILTERS.map(s => {
                    const cfg = STATUS_CONFIG[s];
                    const count = s === 'All'
                        ? orders.length
                        : s === 'Unpaid'
                            ? orders.filter(o => o.status === 'Delivered' && o.payment_status !== 'Paid').length
                            : orders.filter(o => o.status === s).length;
                    return (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all border
                ${statusFilter === s
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-500/20 dark:shadow-indigo-900/40'
                                    : 'bg-card dark:bg-slate-900/80 text-muted-foreground border-border dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-500/40'
                                }`}
                        >
                            {s === 'All' ? 'All' : cfg?.label || s}
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusFilter === s ? 'bg-card/20' : 'bg-muted'}`}>
                                {count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Content area — list scrolls; page does not */}
            <div className="flex min-h-0 flex-1 gap-6">
                {/* Orders List */}
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 space-y-3">
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
                                    className={`bg-card dark:bg-slate-900/90 rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-500/40 ${detailOrder?.id === order.id ? 'ring-2 ring-indigo-500 border-indigo-300 dark:ring-indigo-400 dark:border-indigo-500/60' : 'border-border dark:border-slate-600'
                                        }`}
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-foreground">{order.order_number}</span>
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.color}`}>
                                                    <StatusIcon className="w-3 h-3" />
                                                    {cfg.label}
                                                </span>
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">{formatDate(order.created_at)}</p>
                                        </div>
                                        <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{formatPrice(order.grand_total)}</span>
                                    </div>

                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                        {order.customer_name && (
                                            <span className="flex items-center gap-1">
                                                <User className="w-3 h-3" />{order.customer_name}
                                            </span>
                                        )}
                                        <span className="flex items-center gap-1">
                                            <Phone className="w-3 h-3" />{order.customer_phone}
                                        </span>
                                        <span className={`flex items-center gap-1 font-medium ${order.payment_status === 'Paid' ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                                            <FileText className="w-3 h-3" />{formatMobilePaymentMethod(order.payment_method)} ({order.payment_status || 'Unpaid'})
                                        </span>
                                    </div>

                                    {/* Quick action buttons */}
                                    {nextStatus && (
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
                                    {/* Collect Payment button for Delivered + Unpaid */}
                                    {order.status === 'Delivered' && order.payment_status !== 'Paid' && (
                                        <div className="mt-3 pt-3 border-t border-border/60">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setPaymentModal({ orderId: order.id, orderNumber: order.order_number, grandTotal: parseFloat(String(order.grand_total)) });
                                                    setSelectedBankAccount('');
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

                {/* Order Detail Panel */}
                <div className="flex w-[400px] shrink-0 flex-col min-h-0 overflow-y-auto">
                    {detailLoading ? (
                        <div className="bg-card dark:bg-slate-900/90 rounded-2xl border border-border dark:border-slate-600 p-8 flex items-center justify-center h-96">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-400" />
                        </div>
                    ) : detailOrder ? (
                        <OrderDetailPanel
                            order={detailOrder}
                            onStatusUpdate={handleStatusUpdate}
                            onCollectPayment={(o) => {
                                setPaymentModal({ orderId: o.id, orderNumber: o.order_number, grandTotal: parseFloat(String(o.grand_total)) });
                                setSelectedBankAccount('');
                            }}
                            actionLoading={actionLoading}
                            formatPrice={formatPrice}
                            formatDate={formatFullDate}
                        />
                    ) : (
                        <div className="bg-card dark:bg-slate-900/90 rounded-2xl border border-border dark:border-slate-600 p-8 flex flex-col items-center justify-center h-96 text-muted-foreground">
                            <Eye className="w-12 h-12 mb-3 opacity-30" />
                            <p className="font-semibold text-muted-foreground">Select an order</p>
                            <p className="text-sm">Click on an order to view details</p>
                        </div>
                    )}
                </div>
            </div>

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
                                    if (!selectedBankAccount) { alert('Please select a deposit account'); return; }
                                    setPaymentLoading(true);
                                    try {
                                        await collectPayment(paymentModal.orderId, selectedBankAccount);
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
                                disabled={!selectedBankAccount || paymentLoading}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 transition-colors disabled:opacity-50"
                            >
                                {paymentLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                Confirm Payment
                            </button>
                        </div>
                    </div>
                </div>
            )}
            </div>
        </div>
    );
}

// ─── Order Detail Panel ───────────────────────────────────
function OrderDetailPanel({
    order, onStatusUpdate, onCollectPayment, actionLoading, formatPrice, formatDate,
}: {
    order: MobileOrder;
    onStatusUpdate: (id: string, status: string) => void;
    onCollectPayment: (order: MobileOrder) => void;
    actionLoading: string;
    formatPrice: (p: any) => string;
    formatDate: (d: string) => string;
}) {
    const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.Pending;
    const nextStatus = getNextMobileOrderStatus(order);
    const isUnpaid = order.status === 'Delivered' && order.payment_status !== 'Paid';

    return (
        <div className="bg-card dark:bg-slate-900/90 rounded-2xl border border-border dark:border-slate-600 overflow-hidden shadow-sm relative">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/60 dark:to-purple-950/50 border-b border-indigo-100 dark:border-indigo-900/50">
                <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-lg text-foreground dark:text-slate-200">{order.order_number}</span>
                    <div className="flex items-center gap-2">
                        {isUnpaid && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950/50 dark:border-orange-800 dark:text-orange-300">
                                <Banknote className="w-3 h-3" />
                                Unpaid
                            </span>
                        )}
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.color}`}>
                            <cfg.icon className="w-3 h-3" />
                            {cfg.label}
                        </span>
                    </div>
                </div>
                <p className="text-xs text-muted-foreground">{formatDate(order.created_at)}</p>
            </div>

            <div className="p-5 space-y-5">
                {/* Customer */}
                <div>
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Customer</h4>
                    <div className="space-y-1.5 text-sm">
                        {order.customer_name && (
                            <div className="flex items-center gap-2 text-foreground">
                                <User className="w-4 h-4 text-muted-foreground" />{order.customer_name}
                            </div>
                        )}
                        <div className="flex items-center gap-2 text-foreground">
                            <Phone className="w-4 h-4 text-muted-foreground" />{order.customer_phone}
                        </div>
                    </div>
                </div>

                {/* Payment Status */}
                <div>
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Payment</h4>
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-foreground">{formatMobilePaymentMethod(order.payment_method)}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${order.payment_status === 'Paid' ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300'}`}>
                            {order.payment_status || 'Unpaid'}
                        </span>
                    </div>
                </div>

                {/* Delivery */}
                {order.delivery_address && (
                    <div>
                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Delivery</h4>
                        <div className="flex items-start gap-2 text-sm text-foreground">
                            <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                            <div>
                                <p>{order.delivery_address}</p>
                                {order.delivery_notes && <p className="text-xs text-muted-foreground mt-1">Note: {order.delivery_notes}</p>}
                            </div>
                        </div>
                    </div>
                )}

                {/* Items */}
                <div>
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                        Items ({order.items?.length || 0})
                    </h4>
                    <div className="space-y-2">
                        {order.items?.map(item => (
                            <div key={item.id} className="flex justify-between items-center py-2 border-b border-border/60 last:border-0">
                                <div>
                                    <p className="text-sm font-medium text-foreground">{item.product_name}</p>
                                    <p className="text-xs text-muted-foreground">{item.product_sku} × {item.quantity}</p>
                                </div>
                                <span className="text-sm font-bold text-foreground">{formatPrice(item.subtotal)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Totals */}
                <div className="bg-muted dark:bg-slate-800/80 -mx-5 px-5 py-3 space-y-1.5 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                        <span>Subtotal</span><span>{formatPrice(order.subtotal)}</span>
                    </div>
                    {parseFloat(String(order.tax_total)) > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                            <span>Tax</span><span>{formatPrice(order.tax_total)}</span>
                        </div>
                    )}
                    {parseFloat(String(order.delivery_fee)) > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                            <span>Delivery</span><span>{formatPrice(order.delivery_fee)}</span>
                        </div>
                    )}
                    <div className="flex justify-between font-bold text-foreground text-base pt-1.5 border-t border-border">
                        <span>Total</span><span>{formatPrice(order.grand_total)}</span>
                    </div>
                </div>

                {/* Status History */}
                {order.status_history && order.status_history.length > 0 && (
                    <div>
                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">History</h4>
                        <div className="space-y-2">
                            {order.status_history.map(h => (
                                <div key={h.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <div className="w-2 h-2 rounded-full bg-indigo-400 dark:bg-indigo-500" />
                                    <span className="font-medium text-foreground">{h.to_status}</span>
                                    <span>•</span>
                                    <span>{formatDate(h.created_at)}</span>
                                    {h.note && <span className="text-muted-foreground">— {h.note}</span>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Actions */}
            {nextStatus && (
                <div className="p-4 border-t border-border flex gap-2">
                    <button
                        onClick={() => onStatusUpdate(order.id, nextStatus)}
                        disabled={actionLoading === order.id}
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
                    >
                        {actionLoading === order.id ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <Check className="w-4 h-4" />
                        )}
                        {nextStatus === 'Delivered'
                            ? (order.status === 'Packed' && order.payment_method === 'SelfCollection' ? 'Mark Collected' : 'Mark Delivered')
                            : `Mark as ${STATUS_CONFIG[nextStatus]?.label || nextStatus}`}
                    </button>
                    {order.status === 'Pending' && (
                        <button
                            onClick={() => onStatusUpdate(order.id, 'Cancelled')}
                            disabled={actionLoading === order.id}
                            className="px-4 py-3 bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400 rounded-xl font-semibold text-sm hover:bg-red-100 dark:hover:bg-red-950/70 transition-colors border border-red-200 dark:border-red-800"
                        >
                            Cancel
                        </button>
                    )}
                </div>
            )}
            {isUnpaid && (
                <div className="p-4 border-t border-border">
                    <button
                        onClick={() => onCollectPayment(order)}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500 text-white rounded-xl font-bold text-sm hover:bg-orange-600 transition-colors"
                    >
                        <Banknote className="w-4 h-4" />
                        Collect Payment — {formatPrice(order.grand_total)}
                    </button>
                </div>
            )}

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

    const handleSaveSettings = async () => {
        if (!localSettings) return;
        setSaving(true);
        try {
            await updateSettings(localSettings);
        } catch (err: any) {
            alert(err.error || 'Failed to save');
        }
        setSaving(false);
    };

    const handleSaveBranding = async () => {
        if (!localBranding) return;
        setSaving(true);
        try {
            const payload = { ...localBranding };
            if (selectedBranchId) payload.branchId = selectedBranchId;
            await mobileOrdersApi.updateBranding(payload);
            await loadBranding();
            if (selectedBranchId) {
                mobileOrdersApi.getQRCode(selectedBranchId).then(setQrData).catch(() => {});
            }
            alert('Branding updated successfully!');
        } catch (err: any) {
            alert((err as any)?.error || 'Failed to save');
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

    const handleDownloadQR = () => {
        if (!qrRef.current) return;
        const svg = qrRef.current.querySelector('svg');
        if (!svg) return;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        const svgData = new XMLSerializer().serializeToString(svg);
        const img = new Image();

        canvas.width = 1024;
        canvas.height = 1024;

        img.onload = () => {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, 1024, 1024);
            ctx.drawImage(img, 0, 0, 1024, 1024);
            const a = document.createElement('a');
            a.download = `qr-${qrData?.slug || 'shop'}.png`;
            a.href = canvas.toDataURL('image/png');
            a.click();
        };
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
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

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                {onBack && (
                    <button onClick={onBack} className="p-2 bg-card dark:bg-slate-900/90 border border-border dark:border-slate-600 rounded-xl hover:bg-muted dark:hover:bg-slate-800 transition-colors">
                        <ChevronRight className="w-5 h-5 text-muted-foreground rotate-180" />
                    </button>
                )}
                <div>
                    <h1 className="text-2xl font-bold text-foreground dark:text-slate-200">Mobile branding</h1>
                    <p className="text-sm text-muted-foreground">Configure your mobile ordering experience</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                {/* QR Code Card */}
                <div className="bg-card dark:bg-slate-900/90 rounded-2xl border border-border dark:border-slate-600 p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <QrCode className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        <h2 className="text-lg font-bold text-foreground dark:text-slate-200">Shop QR Code</h2>
                    </div>

                    <p className="text-xs text-muted-foreground mb-4">
                        Print this QR code on stickers and place them in your shop. Customers scan it with their phone camera to open your mobile ordering page.
                    </p>

                    {qrData ? (
                        <div className="text-center">
                            {/* Real scannable QR code */}
                            <div ref={qrRef} className="inline-block bg-white p-4 rounded-2xl border-2 border-border mx-auto mb-4 dark:bg-white">
                                <QRCodeSVG
                                    value={qrData.url}
                                    size={200}
                                    level="H"
                                    includeMargin={false}
                                    bgColor="#FFFFFF"
                                    fgColor="#0f172a"
                                />
                            </div>

                            <p className="text-sm font-bold text-foreground mb-0.5">{qrData.url}</p>
                            <p className="text-xs text-muted-foreground mb-5">
                                Slug: <code className="bg-muted dark:bg-slate-800 px-2 py-0.5 rounded font-mono text-indigo-600 dark:text-indigo-400">{qrData.slug}</code>
                            </p>

                            {/* Action buttons */}
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={handlePrintSticker}
                                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors"
                                >
                                    <Printer className="w-4 h-4" />
                                    Print QR Sticker
                                </button>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleDownloadQR}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-muted dark:bg-slate-800 text-foreground rounded-xl text-sm font-semibold hover:bg-muted dark:hover:bg-slate-700 transition-colors"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        Download PNG
                                    </button>
                                    <button
                                        onClick={handleCopyUrl}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-muted dark:bg-slate-800 text-foreground rounded-xl text-sm font-semibold hover:bg-muted dark:hover:bg-slate-700 transition-colors"
                                    >
                                        {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                                        {copied ? 'Copied!' : 'Copy URL'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto mb-3" />
                            <p className="text-sm text-muted-foreground">Generating QR code...</p>
                            <p className="text-xs text-muted-foreground mt-1">Make sure you have set a shop slug in the Branding section</p>
                        </div>
                    )}
                </div>

                {/* Branding Card */}
                <div className="bg-card dark:bg-slate-900/90 rounded-2xl border border-border dark:border-slate-600 p-6 shadow-sm overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Palette className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            <h2 className="text-lg font-bold text-foreground dark:text-slate-200">App Branding</h2>
                        </div>
                        <button
                            onClick={handleSaveBranding}
                            disabled={saving}
                            className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>

                    {localBranding ? (
                        <div className="space-y-6 overflow-y-auto pr-2 max-h-[70vh]">
                            {/* Branch selector: link URL slug to branch for QR at door */}
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Branch (for QR & orders)</label>
                                <select
                                    value={selectedBranchId}
                                    onChange={e => setSelectedBranchId(e.target.value)}
                                    className="w-full px-3 py-2 border border-border dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-card dark:bg-slate-800/80 text-foreground"
                                >
                                    <option value="">Default (first branch)</option>
                                    {branches.map(b => (
                                        <option key={b.id} value={b.id}>{b.name} {b.code ? `(${b.code})` : ''}</option>
                                    ))}
                                </select>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Select the branch whose door QR and URL you are configuring. Orders from that URL will go to this branch&apos;s POS.
                                </p>
                                {(localBranding.branch_name || localBranding.branch_location) && (
                                    <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
                                        {[localBranding.branch_name, localBranding.branch_location].filter(Boolean).join(' · ')}
                                    </p>
                                )}
                            </div>

                            {/* Slug Input */}
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Shop URL Slug</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={localBranding.slug || ''}
                                        onChange={e => setLocalBranding({ ...localBranding, slug: e.target.value })}
                                        placeholder="my-shop"
                                        className="flex-1 px-3 py-2 border border-border dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-indigo-600 dark:text-indigo-400 bg-background dark:bg-slate-800/80"
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">This determines your shop address: {qrData?.url}</p>
                            </div>

                            {/* Shop Address & Coordinates */}
                            <div className="space-y-4 pt-2 border-t border-border/60">
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Shop Address</label>
                                    <textarea
                                        value={localBranding.address || ''}
                                        onChange={e => setLocalBranding({ ...localBranding, address: e.target.value })}
                                        placeholder="Enter full shop address"
                                        rows={2}
                                        className="w-full px-3 py-2 border border-border dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-background dark:bg-slate-800/80 text-foreground"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Latitude</label>
                                        <input
                                            type="number"
                                            step="any"
                                            value={localBranding.lat || ''}
                                            onChange={e => setLocalBranding({ ...localBranding, lat: e.target.value ? parseFloat(e.target.value) : null })}
                                            placeholder="e.g. 24.8607"
                                            className="w-full px-3 py-2 border border-border dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono bg-background dark:bg-slate-800/80 text-foreground"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Longitude</label>
                                        <input
                                            type="number"
                                            step="any"
                                            value={localBranding.lng || ''}
                                            onChange={e => setLocalBranding({ ...localBranding, lng: e.target.value ? parseFloat(e.target.value) : null })}
                                            placeholder="e.g. 67.0011"
                                            className="w-full px-3 py-2 border border-border dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono bg-background dark:bg-slate-800/80 text-foreground"
                                        />
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground">These coordinates will help the mobile app find your nearest branch automatically.</p>
                            </div>

                            {/* Logo Upload */}
                            <div className="p-4 bg-muted dark:bg-slate-800/60 rounded-2xl border-2 border-dashed border-border dark:border-slate-600">
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 rounded-xl bg-card dark:bg-slate-900 shadow-sm border border-border dark:border-slate-600 overflow-hidden flex items-center justify-center flex-shrink-0">
                                        {localBranding.logo_url ? (
                                            <img src={getFullImageUrl(localBranding.logo_url)} alt="Logo" className="w-full h-full object-cover" />
                                        ) : (
                                            <Store className="w-8 h-8 text-muted-foreground" />
                                        )}
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <p className="text-xs font-bold text-foreground">App Logo</p>
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            onChange={handleLogoUpload}
                                            className="hidden"
                                            accept="image/*"
                                        />
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={uploading}
                                            className="px-3 py-1.5 bg-card dark:bg-slate-800 border border-border dark:border-slate-600 rounded-lg text-xs font-bold text-foreground hover:bg-muted dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                                        >
                                            {uploading ? 'Uploading...' : 'Upload New'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Colors */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Primary Color</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={localBranding.primary_color || localBranding.brand_color || '#4F46E5'}
                                            onChange={e => setLocalBranding({ ...localBranding, primary_color: e.target.value, brand_color: e.target.value })}
                                            className="w-8 h-8 rounded border-0 p-0 cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={localBranding.primary_color || localBranding.brand_color || '#4F46E5'}
                                            onChange={e => setLocalBranding({ ...localBranding, primary_color: e.target.value, brand_color: e.target.value })}
                                            className="flex-1 px-2 py-1.5 border border-border dark:border-slate-600 rounded-lg text-xs font-mono bg-background dark:bg-slate-800/80 text-foreground"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Accent Color</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={localBranding.accent_color || '#f59e0b'}
                                            onChange={e => setLocalBranding({ ...localBranding, accent_color: e.target.value })}
                                            className="w-8 h-8 rounded border-0 p-0 cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={localBranding.accent_color || '#f59e0b'}
                                            onChange={e => setLocalBranding({ ...localBranding, accent_color: e.target.value })}
                                            className="flex-1 px-2 py-1.5 border border-border dark:border-slate-600 rounded-lg text-xs font-mono bg-background dark:bg-slate-800/80 text-foreground"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Theme Mode */}
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">App Theme</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['light', 'dark', 'auto'].map(mode => (
                                        <button
                                            key={mode}
                                            onClick={() => setLocalBranding({ ...localBranding, theme_mode: mode })}
                                            className={`px-3 py-2 rounded-xl text-xs font-bold capitalize border transition-all ${localBranding.theme_mode === mode
                                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/60 dark:border-indigo-700 dark:text-indigo-300'
                                                : 'bg-card dark:bg-slate-800/80 border-border dark:border-slate-600 text-muted-foreground hover:border-border dark:hover:border-slate-500'
                                                }`}
                                        >
                                            {mode}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Live Preview (Mini) */}
                            <div className="pt-4 border-t border-border/60">
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Mobile Preview</label>
                                <div className="w-full aspect-[9/16] max-w-[200px] mx-auto border-4 border-gray-800 dark:border-slate-600 rounded-[2rem] overflow-hidden bg-card shadow-lg flex flex-col"
                                    style={{ backgroundColor: localBranding.theme_mode === 'dark' ? '#1e293b' : 'white' }}>
                                    <div className="h-8 flex items-center px-4 justify-between border-b border-border/60"
                                        style={{ backgroundColor: localBranding.theme_mode === 'dark' ? '#0f172a' : 'white', borderColor: localBranding.theme_mode === 'dark' ? '#1e293b' : '#f1f5f9' }}>
                                        <div className="w-4 h-4 rounded bg-muted flex items-center justify-center">
                                            {localBranding.logo_url ? (
                                                <img src={getFullImageUrl(localBranding.logo_url)} className="w-full h-full object-cover rounded" />
                                            ) : (
                                                <div className="w-full h-full bg-indigo-500 rounded" style={{ backgroundColor: localBranding.primary_color || localBranding.brand_color }} />
                                            )}
                                        </div>
                                        <div className="w-4 h-4 rounded-full bg-gray-200" style={{ backgroundColor: localBranding.secondary_color || '#10b981' }} />
                                    </div>
                                    <div className="flex-1 p-3 space-y-3">
                                        <div className="h-10 rounded-lg" style={{ background: `linear-gradient(135deg, ${localBranding.primary_color || localBranding.brand_color || '#4338ca'}, ${localBranding.secondary_color || '#10b981'})` }} />
                                        <div className="space-y-1.5">
                                            <div className="h-2 w-12 rounded bg-muted" style={{ backgroundColor: localBranding.theme_mode === 'dark' ? '#334155' : '#f1f5f9' }} />
                                            <div className="flex gap-1.5">
                                                <div className="h-4 w-8 rounded-full bg-indigo-500" style={{ backgroundColor: localBranding.primary_color || localBranding.brand_color }} />
                                                <div className="h-4 w-8 rounded-full bg-muted" style={{ backgroundColor: localBranding.theme_mode === 'dark' ? '#334155' : '#f1f5f9' }} />
                                            </div>
                                        </div>
                                        <div className="p-2 rounded-lg border border-border/60 space-y-1.5" style={{ backgroundColor: localBranding.theme_mode === 'dark' ? '#0f172a' : 'white', borderColor: localBranding.theme_mode === 'dark' ? '#1e293b' : '#f1f5f9' }}>
                                            <div className="h-2 w-16 rounded bg-muted" style={{ backgroundColor: localBranding.theme_mode === 'dark' ? '#334155' : '#f1f5f9' }} />
                                            <div className="flex justify-end"><div className="w-3 h-3 rounded-full bg-amber-500" style={{ backgroundColor: localBranding.accent_color || '#f59e0b' }} /></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12">
                            <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mb-4" />
                            <p className="text-sm text-muted-foreground">Loading branding...</p>
                        </div>
                    )}
                </div>

                {/* Ordering Settings */}
                <div className="col-span-2 bg-card dark:bg-slate-900/90 rounded-2xl border border-border dark:border-slate-600 p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <SettingsIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        <h2 className="text-lg font-bold text-foreground dark:text-slate-200">Ordering Settings</h2>
                    </div>

                    {localSettings && (
                        <div className="grid grid-cols-3 gap-6">
                            <div className="col-span-3">
                                <div
                                    className="flex items-center gap-3 cursor-pointer"
                                    onClick={() => setLocalSettings({ ...localSettings, is_enabled: !localSettings.is_enabled })}
                                >
                                    <div className={`w-12 h-7 rounded-full transition-colors relative ${localSettings.is_enabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-slate-600'}`}>
                                        <div className={`absolute top-0.5 w-6 h-6 bg-white dark:bg-slate-200 rounded-full shadow transition-transform ${localSettings.is_enabled ? 'left-5' : 'left-0.5'}`} />
                                    </div>
                                    <span className="font-bold text-foreground dark:text-slate-200">Mobile Ordering Enabled</span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Min Order Amount (PKR)</label>
                                <input
                                    type="number"
                                    value={localSettings.minimum_order_amount || 0}
                                    onChange={e => setLocalSettings({ ...localSettings, minimum_order_amount: parseFloat(e.target.value) })}
                                    className="w-full px-3 py-2 border border-border dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-background dark:bg-slate-800/80 text-foreground"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Delivery Fee (PKR)</label>
                                <input
                                    type="number"
                                    value={localSettings.delivery_fee || 0}
                                    onChange={e => setLocalSettings({ ...localSettings, delivery_fee: parseFloat(e.target.value) })}
                                    className="w-full px-3 py-2 border border-border dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-background dark:bg-slate-800/80 text-foreground"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Free Delivery Above (PKR)</label>
                                <input
                                    type="number"
                                    value={localSettings.free_delivery_above || ''}
                                    onChange={e => setLocalSettings({ ...localSettings, free_delivery_above: e.target.value ? parseFloat(e.target.value) : null })}
                                    placeholder="No free delivery"
                                    className="w-full px-3 py-2 border border-border dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-background dark:bg-slate-800/80 text-foreground"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Est. Delivery (mins)</label>
                                <input
                                    type="number"
                                    value={localSettings.estimated_delivery_minutes || 60}
                                    onChange={e => setLocalSettings({ ...localSettings, estimated_delivery_minutes: parseInt(e.target.value) })}
                                    className="w-full px-3 py-2 border border-border dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-background dark:bg-slate-800/80 text-foreground"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Accept Orders From</label>
                                <input
                                    type="time"
                                    value={localSettings.order_acceptance_start || '09:00'}
                                    onChange={e => setLocalSettings({ ...localSettings, order_acceptance_start: e.target.value })}
                                    className="w-full px-3 py-2 border border-border dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-background dark:bg-slate-800/80 text-foreground"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Accept Orders Until</label>
                                <input
                                    type="time"
                                    value={localSettings.order_acceptance_end || '21:00'}
                                    onChange={e => setLocalSettings({ ...localSettings, order_acceptance_end: e.target.value })}
                                    className="w-full px-3 py-2 border border-border dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-background dark:bg-slate-800/80 text-foreground"
                                />
                            </div>

                            <div className="col-span-3 flex items-center gap-3">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={localSettings.auto_confirm_orders}
                                        onChange={e => setLocalSettings({ ...localSettings, auto_confirm_orders: e.target.checked })}
                                        className="w-4 h-4 rounded border-gray-300 dark:border-slate-600 dark:bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-sm font-medium text-foreground">Auto-confirm incoming orders (skip manual approval)</span>
                                </label>
                            </div>

                            <div className="col-span-3">
                                <button
                                    onClick={handleSaveSettings}
                                    disabled={saving}
                                    className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                                >
                                    {saving ? 'Saving...' : 'Save Settings'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default MobileOrdersPageContent;
