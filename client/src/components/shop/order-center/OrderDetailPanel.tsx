import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    User, Phone, MapPin, Package, Check, ShoppingCart, XCircle, Printer,
    ExternalLink, Mic, FileText, Banknote, Truck,
} from 'lucide-react';
import { getFullImageUrl } from '../../../config/apiUrl';
import { orderCenterApi, type OrderCenterDetail } from '../../../services/orderCenterApi';
import type { MobileOrder } from '../../../services/mobileOrdersApi';
import type { VoiceOrder } from '../../../services/voiceOrdersApi';
import { VoiceAudioPlayer } from './VoiceAudioPlayer';
import { VoiceCancelModal } from './VoiceCancelModal';
import { nextCartStatus, isRiderFulfillmentLocked, shopCanAdvanceCartStatus } from './orderCenterUtils';
import { CartCollectPaymentModal } from './CartCollectPaymentModal';
import { useOrderCenter } from '../../../context/OrderCenterContext';
import { useMobileOrders } from '../../../context/MobileOrdersContext';
import { CartRiderAssign } from './CartRiderAssign';
import { OrderCenterChat } from './OrderCenterChat';
import type { PosRidersOverview } from '../../../services/mobileOrdersApi';

const VOICE_STATUS: Record<string, { label: string; color: string }> = {
    Pending: { label: 'Received', color: 'bg-violet-100 text-violet-800' },
    Received: { label: 'Reviewing', color: 'bg-blue-100 text-blue-800' },
    Preparing: { label: 'Reviewing', color: 'bg-indigo-100 text-indigo-800' },
    InvoiceCreated: { label: 'Converted', color: 'bg-emerald-100 text-emerald-800' },
    Cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
};

interface Props {
    detail: OrderCenterDetail | null;
    loading: boolean;
    onRefresh: () => void;
    ridersOverview: PosRidersOverview | null;
    onRidersRefresh: () => void;
}

export function OrderDetailPanel({ detail, loading, onRefresh, ridersOverview, onRidersRefresh }: Props) {
    const navigate = useNavigate();
    const { refreshQueue } = useOrderCenter();
    const [cancelOpen, setCancelOpen] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    if (loading) {
        return (
            <div className="flex-1 p-6 space-y-4">
                <div className="h-8 w-48 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                <div className="h-32 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
            </div>
        );
    }

    if (!detail) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
                <Package size={56} className="opacity-25 mb-4" />
                <p className="text-center font-medium">Select an order from the queue</p>
                <p className="text-sm text-center mt-1">Use arrow keys to navigate · Enter to open</p>
            </div>
        );
    }

    if (detail.kind === 'voice') {
        return (
            <VoiceDetail
                order={detail.order}
                cancelOpen={cancelOpen}
                setCancelOpen={setCancelOpen}
                actionLoading={actionLoading}
                setActionLoading={setActionLoading}
                onRefresh={onRefresh}
                refreshQueue={refreshQueue}
                navigate={navigate}
            />
        );
    }

    return (
        <CartDetail
            order={detail.order}
            actionLoading={actionLoading}
            setActionLoading={setActionLoading}
            onRefresh={onRefresh}
            refreshQueue={refreshQueue}
            navigate={navigate}
            ridersOverview={ridersOverview}
            onRidersRefresh={onRidersRefresh}
        />
    );
}

function VoiceDetail({
    order,
    cancelOpen,
    setCancelOpen,
    actionLoading,
    setActionLoading,
    onRefresh,
    refreshQueue,
    navigate,
}: {
    order: VoiceOrder;
    cancelOpen: boolean;
    setCancelOpen: (v: boolean) => void;
    actionLoading: boolean;
    setActionLoading: (v: boolean) => void;
    onRefresh: () => void;
    refreshQueue: () => Promise<void>;
    navigate: ReturnType<typeof useNavigate>;
}) {
    const cfg = VOICE_STATUS[order.status] || VOICE_STATUS.Pending;
    const canCancel = !['Delivered', 'Cancelled'].includes(order.status);

    const markReceived = async () => {
        setActionLoading(true);
        try {
            await orderCenterApi.updateVoiceStatus(order.id, 'Received');
            onRefresh();
            await refreshQueue();
        } finally {
            setActionLoading(false);
        }
    };

    const createInvoice = () => {
        sessionStorage.setItem('myshop_pending_voice_order_id', order.id);
        sessionStorage.setItem('myshop_pending_voice_order_notes', order.transcription_text || order.notes || '');
        sessionStorage.setItem('myshop_pending_voice_delivery_mode', order.delivery_mode || 'delivery');
        if (order.customer_phone) sessionStorage.setItem('myshop_pending_voice_order_phone', order.customer_phone);
        navigate('/pos');
    };

    const handleCancel = async (data: { reason: string; note?: string; notifyCustomer: boolean }) => {
        setActionLoading(true);
        try {
            await orderCenterApi.cancelVoiceOrder(order.id, data);
            onRefresh();
            await refreshQueue();
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            <VoiceCancelModal open={cancelOpen} onClose={() => setCancelOpen(false)} onConfirm={handleCancel} loading={actionLoading} />
            <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold tracking-tight">{order.order_number}</h2>
                <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${cfg.color}`}>{cfg.label}</span>
                {order.created_invoice_id && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-violet-100 text-violet-800 font-semibold">
                        Converted from voice
                    </span>
                )}
            </div>
            <CustomerBlock name={order.customer_name} phone={order.customer_phone} address={order.delivery_address} branch={order.branch_name} />
            {order.notes && <p className="text-sm bg-amber-50 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-200/50">{order.notes}</p>}
            {order.audio_url ? (
                <VoiceAudioPlayer
                    key={`${order.id}:${order.audio_url}`}
                    src={getFullImageUrl(order.audio_url) || order.audio_url}
                    duration={Number(order.audio_duration_seconds || order.audio_duration)}
                />
            ) : (
                <p className="text-sm text-muted-foreground italic rounded-xl border border-dashed p-4">
                    No voice recording attached to this order.
                </p>
            )}
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-4 bg-slate-50/50 dark:bg-slate-900/30">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">AI transcription</h3>
                {order.transcription_text ? (
                    <p className="text-sm whitespace-pre-wrap">{order.transcription_text}</p>
                ) : (
                    <p className="text-sm text-muted-foreground italic">Transcription will appear here when enabled</p>
                )}
            </div>
            {order.transcription_text && (
                <div className="rounded-xl border p-4 bg-white dark:bg-slate-900">
                    <h3 className="font-semibold flex items-center gap-2 mb-2"><FileText size={16} /> Transcript</h3>
                    <p className="text-sm whitespace-pre-wrap">{order.transcription_text}</p>
                </div>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
                {order.status === 'Pending' && (
                    <button type="button" className="btn btn-primary" disabled={actionLoading} onClick={() => void markReceived()}>
                        <Check size={16} /> Mark reviewing
                    </button>
                )}
                {!order.created_invoice_id && ['Received', 'Preparing', 'Pending'].includes(order.status) && (
                    <button type="button" className="btn btn-primary" onClick={createInvoice}>
                        <ShoppingCart size={16} /> Create invoice
                    </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={createInvoice}>
                    <ExternalLink size={16} /> Open in POS
                </button>
                {canCancel && (
                    <button type="button" className="btn bg-red-50 text-red-700 border border-red-200" onClick={() => setCancelOpen(true)}>
                        <XCircle size={16} /> Cancel voice order
                    </button>
                )}
            </div>
            {order.created_invoice_id && (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30 p-4 space-y-2">
                    <p className="text-sm text-emerald-800 dark:text-emerald-200 font-medium">
                        Invoice {order.invoice_number} — Rs. {Number(order.invoice_grand_total || 0).toLocaleString()}
                    </p>
                    {order.status === 'InvoiceCreated' && (
                        <p className="text-sm text-amber-800 dark:text-amber-200">
                            Waiting for the customer to approve this invoice in the mobile app.
                        </p>
                    )}
                    {order.mobile_order_id && (
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() =>
                                navigate(`/order-center?order=${encodeURIComponent(order.mobile_order_id!)}&kind=cart`)
                            }
                        >
                            <ExternalLink size={16} /> Process delivery in Order Center
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

function CartDetail({
    order,
    actionLoading,
    setActionLoading,
    onRefresh,
    refreshQueue,
    navigate,
    ridersOverview,
    onRidersRefresh,
}: {
    order: MobileOrder;
    actionLoading: boolean;
    setActionLoading: (v: boolean) => void;
    onRefresh: () => void;
    refreshQueue: () => Promise<void>;
    navigate: ReturnType<typeof useNavigate>;
    ridersOverview: PosRidersOverview | null;
    onRidersRefresh: () => void;
}) {
    const { settings } = useMobileOrders();
    const [paymentOpen, setPaymentOpen] = useState(false);
    const next = nextCartStatus(order.status, order.payment_method);
    const terminal = ['Delivered', 'Cancelled'].includes(order.status);
    const fromVoice = !!order.converted_from_voice_order_id;
    const voiceAwaitingApproval = fromVoice && order.voice_order_status === 'InvoiceCreated';
    const voiceCustomerApproved = fromVoice && order.voice_order_status === 'Accepted';
    const canConfirm = next === 'Confirmed' && !voiceAwaitingApproval;
    const riderLocked = isRiderFulfillmentLocked(order);
    const canAdvance = shopCanAdvanceCartStatus(order, next);
    const isUnpaidDelivered = order.status === 'Delivered' && order.payment_status !== 'Paid';

    const advance = async () => {
        if (!next) return;
        setActionLoading(true);
        try {
            await orderCenterApi.updateCartStatus(order.id, next);
            onRefresh();
            await refreshQueue();
        } finally {
            setActionLoading(false);
        }
    };

    const cancel = async () => {
        if (!confirm('Cancel this order?')) return;
        setActionLoading(true);
        try {
            await orderCenterApi.updateCartStatus(order.id, 'Cancelled', 'Cancelled from Order Center');
            onRefresh();
            await refreshQueue();
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            <CartCollectPaymentModal
                open={paymentOpen}
                orderId={order.id}
                orderNumber={order.order_number}
                grandTotal={Number(order.grand_total)}
                customerName={order.customer_name}
                onClose={() => setPaymentOpen(false)}
                onSuccess={() => {
                    onRefresh();
                    void refreshQueue();
                }}
            />
            <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold tracking-tight">{order.order_number}</h2>
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold">{order.status}</span>
                {order.converted_from_voice_order_id && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-violet-100 text-violet-800 font-semibold flex items-center gap-1">
                        <Mic size={12} /> From voice order
                    </span>
                )}
            </div>
            <CustomerBlock
                name={order.customer_name}
                phone={order.customer_phone}
                address={order.delivery_address}
                branch={order.assigned_branch_name || undefined}
            />
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/80">
                        <tr>
                            <th className="text-left p-2 font-semibold">Item</th>
                            <th className="text-right p-2 font-semibold">Qty</th>
                            <th className="text-right p-2 font-semibold">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(order.items || []).map((line) => (
                            <tr key={line.id} className="border-t border-slate-100 dark:border-slate-800">
                                <td className="p-2">{line.product_name}</td>
                                <td className="p-2 text-right tabular-nums">{line.quantity}</td>
                                <td className="p-2 text-right tabular-nums">Rs. {Number(line.subtotal).toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="p-3 border-t bg-slate-50/80 dark:bg-slate-900/50 text-sm space-y-1">
                    <div className="flex justify-between"><span>Subtotal</span><span>Rs. {Number(order.subtotal).toLocaleString()}</span></div>
                    <div className="flex justify-between"><span>Tax</span><span>Rs. {Number(order.tax_total).toLocaleString()}</span></div>
                    <div className="flex justify-between font-bold text-base"><span>Total</span><span>Rs. {Number(order.grand_total).toLocaleString()}</span></div>
                    <div className="flex justify-between text-muted-foreground">
                        <span>Payment</span>
                        <span>{order.payment_status} · {order.payment_method}</span>
                    </div>
                </div>
            </div>
            {order.delivery_notes && <p className="text-sm"><strong>Notes:</strong> {order.delivery_notes}</p>}
            {voiceAwaitingApproval && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 text-sm text-amber-900 dark:text-amber-100">
                    <strong>Customer approval pending.</strong> The invoice was sent to the customer&apos;s app. After they
                    approve, use <strong>Mark Confirmed</strong> to start packing.
                </div>
            )}
            {voiceCustomerApproved && next === 'Confirmed' && (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-sm text-emerald-900 dark:text-emerald-100">
                    <strong>Customer approved the invoice.</strong> Use <strong>Mark Confirmed</strong> to start packing.
                </div>
            )}
            {riderLocked && !terminal && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/80 dark:border-blue-900 dark:bg-blue-950/40 px-3 py-2.5 text-sm text-blue-950 dark:text-blue-100 flex items-start gap-2">
                    <Truck className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                        A rider is on this delivery. Use the <strong>Live map</strong> panel and the rider app for dispatch and delivery completion.
                    </span>
                </div>
            )}
            <CartRiderAssign
                order={order}
                ridersOverview={ridersOverview}
                riderAssignmentMode={settings?.rider_assignment_mode || 'auto'}
                onAssigned={() => {
                    onRefresh();
                    void refreshQueue();
                    onRidersRefresh();
                }}
            />
            {order.delivery_order_id && order.payment_method !== 'SelfCollection' ? (
                <OrderCenterChat
                    orderId={order.id}
                    riderName={order.rider_name ?? order.rider_id ?? undefined}
                />
            ) : null}
            <div className="flex flex-wrap gap-2">
                {isUnpaidDelivered && (
                    <button type="button" className="btn bg-orange-600 text-white hover:bg-orange-700" onClick={() => setPaymentOpen(true)}>
                        <Banknote size={16} /> Collect payment
                    </button>
                )}
                {next && !terminal && canAdvance && (
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={actionLoading || (next === 'Confirmed' && !canConfirm)}
                        title={voiceAwaitingApproval ? 'Waiting for customer to approve invoice in the app' : undefined}
                        onClick={() => void advance()}
                    >
                        <Check size={16} /> {next === 'Delivered' && order.payment_method === 'SelfCollection' ? 'Mark delivered' : `Mark ${next}`}
                    </button>
                )}
                {!terminal && (
                    <button type="button" className="btn btn-secondary" onClick={() => void cancel()} disabled={actionLoading}>
                        <XCircle size={16} /> Cancel
                    </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={() => navigate('/pos')}>
                    <ExternalLink size={16} /> Open in POS
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
                    <Printer size={16} /> Print
                </button>
            </div>
        </div>
    );
}

function CustomerBlock({
    name,
    phone,
    address,
    branch,
}: {
    name?: string;
    phone?: string;
    address?: string;
    branch?: string;
}) {
    return (
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><User size={14} /> {name}</span>
            {phone && (
                <a href={`tel:${phone}`} className="flex items-center gap-1 text-primary-600">
                    <Phone size={14} /> {phone}
                </a>
            )}
            {branch && <span className="flex items-center gap-1"><MapPin size={14} /> {branch}</span>}
            {address && <span className="w-full text-foreground/80">{address}</span>}
        </div>
    );
}
