import React, { useEffect, useState } from 'react';
import { Receipt, History, Clock, StickyNote } from 'lucide-react';
import { orderCenterApi, type OrderCenterDetail } from '../../../services/orderCenterApi';
import type { MobileOrder } from '../../../services/mobileOrdersApi';
import type { VoiceOrder } from '../../../services/voiceOrdersApi';
import { useShopTimezone } from '../../../context/ShopTimezoneContext';
import { formatOrderTime } from '../../../utils/orderTimeFormat';

type Tab = 'bill' | 'history' | 'timeline' | 'notes';

interface Props {
    detail: OrderCenterDetail | null;
}

export function OrderOperationsPanel({ detail }: Props) {
    const [tab, setTab] = useState<Tab>('bill');
    const [history, setHistory] = useState<{
        previous_orders: { order_number: string; status: string; grand_total: number; created_at: string; kind: string }[];
        total_spending: number;
        cancel_count: number;
        last_order_at: string | null;
    } | null>(null);

    const customerId =
        detail?.kind === 'cart'
            ? detail.order.customer_id
            : detail?.kind === 'voice'
              ? detail.order.customer_id
              : undefined;

    useEffect(() => {
        if (!customerId) {
            setHistory(null);
            return;
        }
        orderCenterApi.getCustomerHistory(customerId).then(setHistory).catch(() => setHistory(null));
    }, [customerId]);

    const tabs: { id: Tab; label: string; icon: typeof Receipt }[] = [
        { id: 'bill', label: 'Bill', icon: Receipt },
        { id: 'history', label: 'History', icon: History },
        { id: 'timeline', label: 'Timeline', icon: Clock },
        { id: 'notes', label: 'Notes', icon: StickyNote },
    ];

    return (
        <div className="flex flex-col h-full min-h-0 bg-slate-50/80 dark:bg-slate-950/50 border-l border-slate-200 dark:border-slate-800">
            <div className="flex border-b border-slate-200 dark:border-slate-800 shrink-0 overflow-x-auto">
                {tabs.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        className={`flex-1 min-w-0 px-2 py-3 text-[11px] font-semibold flex flex-col items-center gap-0.5 ${
                            tab === t.id
                                ? 'text-primary-600 border-b-2 border-primary-600 bg-white dark:bg-slate-900'
                                : 'text-muted-foreground'
                        }`}
                    >
                        <t.icon size={14} />
                        {t.label}
                    </button>
                ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4 text-sm">
                {!detail && <p className="text-muted-foreground text-center py-8">Select an order</p>}
                {detail && tab === 'bill' && <BillTab detail={detail} />}
                {detail && tab === 'history' && <HistoryTab history={history} />}
                {detail && tab === 'timeline' && <TimelineTab detail={detail} />}
                {detail && tab === 'notes' && <NotesTab detail={detail} />}
            </div>
        </div>
    );
}

function BillTab({ detail }: { detail: OrderCenterDetail }) {
    if (detail.kind === 'cart') {
        const o = detail.order;
        return (
            <div className="space-y-2">
                {(o.items || []).map((line) => (
                    <div key={line.id} className="flex justify-between gap-2 py-1 border-b border-slate-100 dark:border-slate-800">
                        <span className="truncate">{line.product_name}</span>
                        <span className="shrink-0 tabular-nums">
                            {line.quantity} × Rs. {Number(line.unit_price).toLocaleString()}
                        </span>
                    </div>
                ))}
                <div className="pt-3 font-bold flex justify-between">
                    <span>Grand total</span>
                    <span>Rs. {Number(o.grand_total).toLocaleString()}</span>
                </div>
            </div>
        );
    }
    const o = detail.order as VoiceOrder & { invoice_items?: { product_name: string; quantity: number; subtotal: number }[] };
    const lines = o.invoice_items || [];
    if (!lines.length) return <p className="text-muted-foreground">Create invoice in POS to see bill lines</p>;
    return (
        <div className="space-y-2">
            {lines.map((line, i) => (
                <div key={i} className="flex justify-between gap-2 py-1 border-b border-slate-100 dark:border-slate-800">
                    <span>{line.product_name}</span>
                    <span className="tabular-nums">
                        {line.quantity} — Rs. {Number(line.subtotal).toLocaleString()}
                    </span>
                </div>
            ))}
            {o.invoice_grand_total != null && (
                <div className="pt-3 font-bold flex justify-between">
                    <span>Grand total</span>
                    <span>Rs. {Number(o.invoice_grand_total).toLocaleString()}</span>
                </div>
            )}
        </div>
    );
}

function HistoryTab({
    history,
}: {
    history: {
        previous_orders: { order_number: string; status: string; grand_total: number; created_at: string; kind: string }[];
        total_spending: number;
        cancel_count: number;
        last_order_at: string | null;
    } | null;
}) {
    if (!history) return <p className="text-muted-foreground">Loading…</p>;
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
                <Stat label="Total spent" value={`Rs. ${history.total_spending.toLocaleString()}`} />
                <Stat label="Cancels" value={String(history.cancel_count)} />
            </div>
            <p className="text-xs text-muted-foreground">
                Last order: {history.last_order_at ? new Date(history.last_order_at).toLocaleDateString() : '—'}
            </p>
            <ul className="space-y-2">
                {history.previous_orders.map((o, i) => (
                    <li key={i} className="text-xs p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                        <span className="font-mono font-semibold">{o.order_number}</span>
                        <span className="mx-1">·</span>
                        {o.status}
                        {o.grand_total > 0 && <span className="float-right">Rs. {o.grand_total.toLocaleString()}</span>}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function TimelineTab({ detail }: { detail: OrderCenterDetail }) {
    const { timezone } = useShopTimezone();
    const events =
        detail.kind === 'cart'
            ? (detail.order.status_history || []).map((h) => ({
                  label: h.to_status,
                  at: h.created_at,
                  note: h.note,
              }))
            : (detail.order.status_history || []).map((h) => ({
                  label: h.to_status,
                  at: h.created_at,
                  note: h.note,
              }));

    if (!events.length) {
        return (
            <ul className="space-y-3 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-slate-200 dark:before:bg-slate-700 pl-6">
                <li>
                    <span className="font-semibold">Order received</span>
                    <p className="text-xs text-muted-foreground">{formatOrderTime(String(detail.order.created_at), timezone)}</p>
                </li>
            </ul>
        );
    }

    return (
        <ul className="space-y-3 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-slate-200 dark:before:bg-slate-700 pl-6">
            {events.map((e, i) => (
                <li key={i}>
                    <span className="absolute -left-[17px] w-2.5 h-2.5 rounded-full bg-primary-500" />
                    <span className="font-semibold">{e.label}</span>
                    <p className="text-xs text-muted-foreground">{formatOrderTime(String(e.at), timezone)}</p>
                    {e.note && <p className="text-xs mt-0.5">{e.note}</p>}
                </li>
            ))}
        </ul>
    );
}

function NotesTab({ detail }: { detail: OrderCenterDetail }) {
    const notes =
        detail.kind === 'cart'
            ? detail.order.delivery_notes
            : detail.order.notes;
    const cancelled =
        detail.kind === 'voice' && detail.order.status === 'Cancelled'
            ? (detail.order as VoiceOrder & { cancelled_reason?: string; cancelled_note?: string })
            : null;
    return (
        <div className="space-y-3">
            {notes ? <p className="p-3 rounded-xl bg-white dark:bg-slate-900 border">{notes}</p> : <p className="text-muted-foreground italic">No notes</p>}
            {cancelled && (cancelled as { cancelled_reason?: string }).cancelled_reason && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 text-red-800 text-xs">
                    <strong>Cancelled:</strong> {(cancelled as { cancelled_reason: string }).cancelled_reason}
                    {(cancelled as { cancelled_note?: string }).cancelled_note && (
                        <p className="mt-1">{(cancelled as { cancelled_note: string }).cancelled_note}</p>
                    )}
                </div>
            )}
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
            <p className="text-[10px] uppercase text-muted-foreground font-semibold">{label}</p>
            <p className="font-bold text-sm">{value}</p>
        </div>
    );
}
