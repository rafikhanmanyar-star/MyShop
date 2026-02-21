import React, { useEffect, useState, useCallback, useRef } from 'react';
import { MobileOrdersProvider, useMobileOrders } from '../../context/MobileOrdersContext';
import { mobileOrdersApi, MobileOrder } from '../../services/mobileOrdersApi';
import { QRCodeSVG } from 'qrcode.react';
import {
    Smartphone, RefreshCw, Package, Truck, Check, X, Clock,
    ChevronRight, WifiOff, Wifi, QrCode, Settings as SettingsIcon,
    Filter, Eye, Bell, MapPin, Phone, User, FileText, ShoppingBag,
    Printer, Download, Copy, CheckCircle,
} from 'lucide-react';

// ─── Status Config ────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
    Pending: { label: 'Pending', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: Clock },
    Confirmed: { label: 'Confirmed', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: Check },
    Packed: { label: 'Packed', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', icon: Package },
    OutForDelivery: { label: 'Out for Delivery', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: Truck },
    Delivered: { label: 'Delivered', color: 'text-green-700', bg: 'bg-green-50 border-green-200', icon: Check },
    Cancelled: { label: 'Cancelled', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: X },
};

const NEXT_STATUS: Record<string, string> = {
    Pending: 'Confirmed',
    Confirmed: 'Packed',
    Packed: 'OutForDelivery',
    OutForDelivery: 'Delivered',
};

const STATUS_FILTERS = ['All', 'Pending', 'Confirmed', 'Packed', 'OutForDelivery', 'Delivered', 'Cancelled'];

// ─── Main Page ────────────────────────────────────────────
function MobileOrdersPageContent() {
    const {
        orders, loading, error, sseConnected, newOrderCount,
        loadOrders, clearNewOrderCount, updateOrderStatus,
    } = useMobileOrders();

    const [statusFilter, setStatusFilter] = useState('All');
    const [selectedOrder, setSelectedOrder] = useState<MobileOrder | null>(null);
    const [detailOrder, setDetailOrder] = useState<MobileOrder | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [actionLoading, setActionLoading] = useState('');

    useEffect(() => {
        loadOrders(statusFilter === 'All' ? undefined : statusFilter);
        clearNewOrderCount();
    }, [statusFilter]);

    useEffect(() => {
        if (newOrderCount > 0) {
            loadOrders(statusFilter === 'All' ? undefined : statusFilter);
        }
    }, [newOrderCount]);

    const handleViewDetail = useCallback(async (order: MobileOrder) => {
        setDetailLoading(true);
        try {
            const detail = await mobileOrdersApi.getOrder(order.id);
            setDetailOrder(detail);
        } catch { }
        setDetailLoading(false);
    }, []);

    const handleStatusUpdate = async (orderId: string, newStatus: string) => {
        setActionLoading(orderId);
        try {
            await updateOrderStatus(orderId, newStatus);
            if (detailOrder?.id === orderId) {
                const updated = await mobileOrdersApi.getOrder(orderId);
                setDetailOrder(updated);
            }
        } catch (err: any) {
            alert(err.error || err.message || 'Failed to update status');
        }
        setActionLoading('');
    };

    const formatPrice = (p: any) => `PKR ${parseFloat(p).toLocaleString()}`;
    const formatDate = (d: string) => new Date(d).toLocaleString('en-PK', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
    const formatFullDate = (d: string) => new Date(d).toLocaleString('en-PK', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

    const pendingCount = orders.filter(o => o.status === 'Pending').length;

    if (showSettings) {
        return <MobileSettingsPanel onBack={() => setShowSettings(false)} />;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <Smartphone className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Mobile Orders</h1>
                        <div className="flex items-center gap-3 mt-0.5">
                            <span className="flex items-center gap-1.5 text-xs font-medium">
                                {sseConnected ? (
                                    <><Wifi className="w-3.5 h-3.5 text-green-500" /><span className="text-green-600">Live</span></>
                                ) : (
                                    <><WifiOff className="w-3.5 h-3.5 text-red-400" /><span className="text-red-500">Disconnected</span></>
                                )}
                            </span>
                            {pendingCount > 0 && (
                                <span className="flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs font-bold">
                                    <Bell className="w-3 h-3" /> {pendingCount} pending
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => loadOrders(statusFilter === 'All' ? undefined : statusFilter)}
                        className="p-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-4 h-4 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={() => setShowSettings(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
                    >
                        <SettingsIcon className="w-4 h-4" />
                        Settings
                    </button>
                </div>
            </div>

            {/* Status Filter */}
            <div className="flex gap-2 overflow-x-auto pb-1">
                {STATUS_FILTERS.map(s => {
                    const cfg = STATUS_CONFIG[s];
                    const count = s === 'All' ? orders.length : orders.filter(o => o.status === s).length;
                    return (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all border
                ${statusFilter === s
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-500/20'
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                                }`}
                        >
                            {s === 'All' ? 'All' : cfg?.label || s}
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusFilter === s ? 'bg-white/20' : 'bg-gray-100'}`}>
                                {count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Content area */}
            <div className="flex gap-6">
                {/* Orders List */}
                <div className="flex-1 space-y-3">
                    {loading && orders.length === 0 ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                        </div>
                    ) : orders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                            <ShoppingBag className="w-16 h-16 mb-4 opacity-30" />
                            <p className="text-lg font-semibold text-gray-500">No orders found</p>
                            <p className="text-sm">Orders from mobile customers will appear here</p>
                        </div>
                    ) : (
                        orders.map(order => {
                            const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.Pending;
                            const StatusIcon = cfg.icon;
                            const nextStatus = NEXT_STATUS[order.status];

                            return (
                                <div
                                    key={order.id}
                                    onClick={() => handleViewDetail(order)}
                                    className={`bg-white rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-md hover:border-indigo-200 ${detailOrder?.id === order.id ? 'ring-2 ring-indigo-500 border-indigo-300' : 'border-gray-100'
                                        }`}
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-gray-900">{order.order_number}</span>
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.color}`}>
                                                    <StatusIcon className="w-3 h-3" />
                                                    {cfg.label}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-400 mt-1">{formatDate(order.created_at)}</p>
                                        </div>
                                        <span className="text-lg font-bold text-indigo-600">{formatPrice(order.grand_total)}</span>
                                    </div>

                                    <div className="flex items-center gap-4 text-xs text-gray-500">
                                        {order.customer_name && (
                                            <span className="flex items-center gap-1">
                                                <User className="w-3 h-3" />{order.customer_name}
                                            </span>
                                        )}
                                        <span className="flex items-center gap-1">
                                            <Phone className="w-3 h-3" />{order.customer_phone}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <FileText className="w-3 h-3" />{order.payment_method}
                                        </span>
                                    </div>

                                    {/* Quick action buttons */}
                                    {nextStatus && (
                                        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
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
                                                {STATUS_CONFIG[nextStatus]?.label || nextStatus}
                                            </button>
                                            {order.status === 'Pending' && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleStatusUpdate(order.id, 'Cancelled'); }}
                                                    disabled={actionLoading === order.id}
                                                    className="px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-100 transition-colors border border-red-200"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Order Detail Panel */}
                <div className="w-[400px] flex-shrink-0">
                    {detailLoading ? (
                        <div className="bg-white rounded-2xl border border-gray-100 p-8 flex items-center justify-center h-96">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                        </div>
                    ) : detailOrder ? (
                        <OrderDetailPanel
                            order={detailOrder}
                            onStatusUpdate={handleStatusUpdate}
                            actionLoading={actionLoading}
                            formatPrice={formatPrice}
                            formatDate={formatFullDate}
                        />
                    ) : (
                        <div className="bg-white rounded-2xl border border-gray-100 p-8 flex flex-col items-center justify-center h-96 text-gray-400">
                            <Eye className="w-12 h-12 mb-3 opacity-30" />
                            <p className="font-semibold text-gray-500">Select an order</p>
                            <p className="text-sm">Click on an order to view details</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Order Detail Panel ───────────────────────────────────
function OrderDetailPanel({
    order, onStatusUpdate, actionLoading, formatPrice, formatDate,
}: {
    order: MobileOrder;
    onStatusUpdate: (id: string, status: string) => void;
    actionLoading: string;
    formatPrice: (p: any) => string;
    formatDate: (d: string) => string;
}) {
    const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.Pending;
    const nextStatus = NEXT_STATUS[order.status];

    return (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-indigo-100">
                <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-lg text-gray-900">{order.order_number}</span>
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.color}`}>
                        <cfg.icon className="w-3 h-3" />
                        {cfg.label}
                    </span>
                </div>
                <p className="text-xs text-gray-500">{formatDate(order.created_at)}</p>
            </div>

            <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
                {/* Customer */}
                <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Customer</h4>
                    <div className="space-y-1.5 text-sm">
                        {order.customer_name && (
                            <div className="flex items-center gap-2 text-gray-700">
                                <User className="w-4 h-4 text-gray-400" />{order.customer_name}
                            </div>
                        )}
                        <div className="flex items-center gap-2 text-gray-700">
                            <Phone className="w-4 h-4 text-gray-400" />{order.customer_phone}
                        </div>
                    </div>
                </div>

                {/* Delivery */}
                {order.delivery_address && (
                    <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Delivery</h4>
                        <div className="flex items-start gap-2 text-sm text-gray-700">
                            <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                            <div>
                                <p>{order.delivery_address}</p>
                                {order.delivery_notes && <p className="text-xs text-gray-500 mt-1">Note: {order.delivery_notes}</p>}
                            </div>
                        </div>
                    </div>
                )}

                {/* Items */}
                <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                        Items ({order.items?.length || 0})
                    </h4>
                    <div className="space-y-2">
                        {order.items?.map(item => (
                            <div key={item.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                                <div>
                                    <p className="text-sm font-medium text-gray-800">{item.product_name}</p>
                                    <p className="text-xs text-gray-400">{item.product_sku} × {item.quantity}</p>
                                </div>
                                <span className="text-sm font-bold text-gray-700">{formatPrice(item.subtotal)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Totals */}
                <div className="bg-gray-50 -mx-5 px-5 py-3 space-y-1.5 text-sm">
                    <div className="flex justify-between text-gray-600">
                        <span>Subtotal</span><span>{formatPrice(order.subtotal)}</span>
                    </div>
                    {parseFloat(String(order.tax_total)) > 0 && (
                        <div className="flex justify-between text-gray-600">
                            <span>Tax</span><span>{formatPrice(order.tax_total)}</span>
                        </div>
                    )}
                    {parseFloat(String(order.delivery_fee)) > 0 && (
                        <div className="flex justify-between text-gray-600">
                            <span>Delivery</span><span>{formatPrice(order.delivery_fee)}</span>
                        </div>
                    )}
                    <div className="flex justify-between font-bold text-gray-900 text-base pt-1.5 border-t border-gray-200">
                        <span>Total</span><span>{formatPrice(order.grand_total)}</span>
                    </div>
                </div>

                {/* Status History */}
                {order.status_history && order.status_history.length > 0 && (
                    <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">History</h4>
                        <div className="space-y-2">
                            {order.status_history.map(h => (
                                <div key={h.id} className="flex items-center gap-2 text-xs text-gray-500">
                                    <div className="w-2 h-2 rounded-full bg-indigo-400" />
                                    <span className="font-medium text-gray-700">{h.to_status}</span>
                                    <span>•</span>
                                    <span>{formatDate(h.created_at)}</span>
                                    {h.note && <span className="text-gray-400">— {h.note}</span>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Actions */}
            {nextStatus && (
                <div className="p-4 border-t border-gray-100 flex gap-2">
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
                        Mark as {STATUS_CONFIG[nextStatus]?.label || nextStatus}
                    </button>
                    {order.status === 'Pending' && (
                        <button
                            onClick={() => onStatusUpdate(order.id, 'Cancelled')}
                            disabled={actionLoading === order.id}
                            className="px-4 py-3 bg-red-50 text-red-600 rounded-xl font-semibold text-sm hover:bg-red-100 transition-colors border border-red-200"
                        >
                            Cancel
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Settings Panel ───────────────────────────────────────
function MobileSettingsPanel({ onBack }: { onBack: () => void }) {
    const { settings, branding, loadSettings, loadBranding, updateSettings, updateBranding } = useMobileOrders();
    const [qrData, setQrData] = useState<{ slug: string; url: string } | null>(null);
    const [saving, setSaving] = useState(false);
    const [localSettings, setLocalSettings] = useState<any>(null);
    const [localBranding, setLocalBranding] = useState<any>(null);
    const [copied, setCopied] = useState(false);
    const qrRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadSettings();
        loadBranding();
        mobileOrdersApi.getQRCode().then(setQrData).catch(() => { });
    }, []);

    useEffect(() => {
        if (settings) setLocalSettings({ ...settings });
    }, [settings]);

    useEffect(() => {
        if (branding) setLocalBranding({ ...branding });
    }, [branding]);

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
            await updateBranding(localBranding);
        } catch (err: any) {
            alert(err.error || 'Failed to save');
        }
        setSaving(false);
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
                <button onClick={onBack} className="p-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                    <ChevronRight className="w-5 h-5 text-gray-600 rotate-180" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Mobile Ordering Settings</h1>
                    <p className="text-sm text-gray-500">Configure your mobile ordering experience</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                {/* QR Code Card */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <QrCode className="w-5 h-5 text-indigo-600" />
                        <h2 className="text-lg font-bold text-gray-900">Shop QR Code</h2>
                    </div>

                    <p className="text-xs text-gray-500 mb-4">
                        Print this QR code on stickers and place them in your shop. Customers scan it with their phone camera to open your mobile ordering page.
                    </p>

                    {qrData ? (
                        <div className="text-center">
                            {/* Real scannable QR code */}
                            <div ref={qrRef} className="inline-block bg-white p-4 rounded-2xl border-2 border-gray-100 mx-auto mb-4">
                                <QRCodeSVG
                                    value={qrData.url}
                                    size={200}
                                    level="H"
                                    includeMargin={false}
                                    bgColor="#FFFFFF"
                                    fgColor="#0f172a"
                                />
                            </div>

                            <p className="text-sm font-bold text-gray-900 mb-0.5">{qrData.url}</p>
                            <p className="text-xs text-gray-400 mb-5">
                                Slug: <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-indigo-600">{qrData.slug}</code>
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
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        Download PNG
                                    </button>
                                    <button
                                        onClick={handleCopyUrl}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors"
                                    >
                                        {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                                        {copied ? 'Copied!' : 'Copy URL'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mx-auto mb-3" />
                            <p className="text-sm text-gray-500">Generating QR code...</p>
                            <p className="text-xs text-gray-400 mt-1">Make sure you have set a shop slug in the Branding section</p>
                        </div>
                    )}
                </div>

                {/* Branding Card */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <Smartphone className="w-5 h-5 text-indigo-600" />
                        <h2 className="text-lg font-bold text-gray-900">Shop Branding</h2>
                    </div>

                    {localBranding && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Shop URL Slug</label>
                                <input
                                    type="text"
                                    value={localBranding.slug || ''}
                                    onChange={e => setLocalBranding({ ...localBranding, slug: e.target.value })}
                                    placeholder="my-shop"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Logo URL</label>
                                <input
                                    type="url"
                                    value={localBranding.logo_url || ''}
                                    onChange={e => setLocalBranding({ ...localBranding, logo_url: e.target.value })}
                                    placeholder="https://..."
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Brand Color</label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="color"
                                        value={localBranding.brand_color || '#4F46E5'}
                                        onChange={e => setLocalBranding({ ...localBranding, brand_color: e.target.value })}
                                        className="w-10 h-10 border-0 rounded-lg cursor-pointer"
                                    />
                                    <input
                                        type="text"
                                        value={localBranding.brand_color || '#4F46E5'}
                                        onChange={e => setLocalBranding({ ...localBranding, brand_color: e.target.value })}
                                        className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono"
                                    />
                                </div>
                            </div>
                            <button
                                onClick={handleSaveBranding}
                                disabled={saving}
                                className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                            >
                                {saving ? 'Saving...' : 'Save Branding'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Ordering Settings */}
                <div className="col-span-2 bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <SettingsIcon className="w-5 h-5 text-indigo-600" />
                        <h2 className="text-lg font-bold text-gray-900">Ordering Settings</h2>
                    </div>

                    {localSettings && (
                        <div className="grid grid-cols-3 gap-6">
                            <div className="col-span-3">
                                <div
                                    className="flex items-center gap-3 cursor-pointer"
                                    onClick={() => setLocalSettings({ ...localSettings, is_enabled: !localSettings.is_enabled })}
                                >
                                    <div className={`w-12 h-7 rounded-full transition-colors relative ${localSettings.is_enabled ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                                        <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${localSettings.is_enabled ? 'left-5' : 'left-0.5'}`} />
                                    </div>
                                    <span className="font-bold text-gray-900">Mobile Ordering Enabled</span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Min Order Amount (PKR)</label>
                                <input
                                    type="number"
                                    value={localSettings.minimum_order_amount || 0}
                                    onChange={e => setLocalSettings({ ...localSettings, minimum_order_amount: parseFloat(e.target.value) })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Delivery Fee (PKR)</label>
                                <input
                                    type="number"
                                    value={localSettings.delivery_fee || 0}
                                    onChange={e => setLocalSettings({ ...localSettings, delivery_fee: parseFloat(e.target.value) })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Free Delivery Above (PKR)</label>
                                <input
                                    type="number"
                                    value={localSettings.free_delivery_above || ''}
                                    onChange={e => setLocalSettings({ ...localSettings, free_delivery_above: e.target.value ? parseFloat(e.target.value) : null })}
                                    placeholder="No free delivery"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Est. Delivery (mins)</label>
                                <input
                                    type="number"
                                    value={localSettings.estimated_delivery_minutes || 60}
                                    onChange={e => setLocalSettings({ ...localSettings, estimated_delivery_minutes: parseInt(e.target.value) })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Accept Orders From</label>
                                <input
                                    type="time"
                                    value={localSettings.order_acceptance_start || '09:00'}
                                    onChange={e => setLocalSettings({ ...localSettings, order_acceptance_start: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Accept Orders Until</label>
                                <input
                                    type="time"
                                    value={localSettings.order_acceptance_end || '21:00'}
                                    onChange={e => setLocalSettings({ ...localSettings, order_acceptance_end: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>

                            <div className="col-span-3 flex items-center gap-3">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={localSettings.auto_confirm_orders}
                                        onChange={e => setLocalSettings({ ...localSettings, auto_confirm_orders: e.target.checked })}
                                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-sm font-medium text-gray-700">Auto-confirm incoming orders (skip manual approval)</span>
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

// ─── Wrapper with Provider ────────────────────────────────
export default function MobileOrdersPage() {
    return (
        <MobileOrdersProvider>
            <MobileOrdersPageContent />
        </MobileOrdersProvider>
    );
}
