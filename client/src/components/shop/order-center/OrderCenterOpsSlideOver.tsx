import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Map, Bike, Settings, RefreshCw } from 'lucide-react';
import { useMobileOrders } from '../../../context/MobileOrdersContext';
import { mobileOrdersApi, type MobileOrder, type PosRidersOverview } from '../../../services/mobileOrdersApi';
import { MobileOrdersLiveMap } from '../MobileOrdersLiveMap';
import { MobileSettingsPanel } from '../MobileOrdersPage';
import { fetchRidersOverview } from './CartRiderAssign';

export type OpsSlideTab = 'map' | 'riders' | 'settings';

interface Props {
    open: boolean;
    tab: OpsSlideTab;
    onClose: () => void;
    onTabChange: (tab: OpsSlideTab) => void;
    /** Selected cart order for live map + rider assign from slide-over */
    mapOrder: MobileOrder | null;
    onMapOrderRefresh: () => void;
}

function shouldPollDelivery(order: MobileOrder | null): boolean {
    if (!order?.delivery_order_id) return false;
    return String(order.delivery_status || '').toUpperCase() !== 'DELIVERED';
}

export function OrderCenterOpsSlideOver({
    open,
    tab,
    onClose,
    onTabChange,
    mapOrder,
    onMapOrderRefresh,
}: Props) {
    const { branding, loadBranding, loadSettings } = useMobileOrders();
    const [ridersOverview, setRidersOverview] = useState<PosRidersOverview | null>(null);
    const [ridersLoading, setRidersLoading] = useState(false);
    const [liveMapOrder, setLiveMapOrder] = useState<MobileOrder | null>(mapOrder);

    const loadRiders = useCallback(async () => {
        setRidersLoading(true);
        try {
            setRidersOverview(await fetchRidersOverview());
        } finally {
            setRidersLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!open) return;
        void loadBranding();
        void loadSettings();
        void loadRiders();
    }, [open, loadBranding, loadSettings, loadRiders]);

    useEffect(() => {
        setLiveMapOrder(mapOrder);
    }, [mapOrder]);

    useEffect(() => {
        if (!open || tab !== 'map' || !mapOrder?.id) return;
        const refresh = () => {
            mobileOrdersApi
                .getOrder(mapOrder.id)
                .then((o) => {
                    setLiveMapOrder(o);
                    onMapOrderRefresh();
                })
                .catch(() => {});
        };
        refresh();
        if (!shouldPollDelivery(mapOrder)) return;
        const id = window.setInterval(refresh, 12_000);
        return () => clearInterval(id);
    }, [open, tab, mapOrder?.id, mapOrder?.delivery_order_id, mapOrder?.delivery_status, onMapOrderRefresh]);

    const tabs: { id: OpsSlideTab; label: string; icon: typeof Map }[] = [
        { id: 'map', label: 'Live map', icon: Map },
        { id: 'riders', label: 'Riders', icon: Bike },
        { id: 'settings', label: 'Mobile settings', icon: Settings },
    ];

    const widePanel = tab === 'map';

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />
                    <motion.aside
                        className={`fixed top-0 right-0 z-50 h-full flex flex-col bg-white dark:bg-slate-950 shadow-2xl border-l border-slate-200 dark:border-slate-800 ${
                            widePanel ? 'w-full max-w-[min(100vw,920px)]' : 'w-full max-w-[min(100vw,520px)]'
                        }`}
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                    >
                        <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90">
                            <div className="flex gap-1 overflow-x-auto">
                                {tabs.map((t) => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => onTabChange(t.id)}
                                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                                            tab === t.id
                                                ? 'bg-primary-600 text-white shadow-sm'
                                                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                                        }`}
                                    >
                                        <t.icon className="w-3.5 h-3.5" />
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                {(tab === 'riders' || tab === 'map') && (
                                    <button
                                        type="button"
                                        onClick={() => void loadRiders()}
                                        className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800"
                                        title="Refresh riders"
                                    >
                                        <RefreshCw className={`w-4 h-4 ${ridersLoading ? 'animate-spin' : ''}`} />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800"
                                    aria-label="Close panel"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                            {tab === 'map' && (
                                <div className="flex-1 min-h-0 flex flex-col p-3 gap-2">
                                    {!liveMapOrder ? (
                                        <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground p-8">
                                            <Map className="w-12 h-12 opacity-25 mb-3" />
                                            <p className="font-medium">Select a delivery cart order</p>
                                            <p className="text-sm mt-1 max-w-xs">
                                                Choose an order with a delivery address from the queue to view customer and rider on the map.
                                            </p>
                                        </div>
                                    ) : liveMapOrder.payment_method === 'SelfCollection' ? (
                                        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-6">
                                            This order is pickup — no delivery map.
                                        </div>
                                    ) : (
                                        <>
                                            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 px-1 shrink-0">
                                                {liveMapOrder.order_number} · {liveMapOrder.customer_name}
                                            </p>
                                            <div className="flex-1 min-h-[min(50vh,480px)] rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                                                <MobileOrdersLiveMap
                                                    branding={branding}
                                                    selectedOrder={liveMapOrder}
                                                    riders={ridersOverview?.riders ?? []}
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {tab === 'riders' && (
                                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                    {ridersOverview?.stats && (
                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                            <StatCard label="Available" value={ridersOverview.stats.available} tone="emerald" />
                                            <StatCard label="Busy" value={ridersOverview.stats.busy} tone="amber" />
                                            <StatCard label="Offline" value={ridersOverview.stats.offline} tone="slate" />
                                            <StatCard label="Open deliveries" value={ridersOverview.stats.open_deliveries} tone="blue" />
                                        </div>
                                    )}
                                    <div>
                                        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                                            Active riders
                                        </h3>
                                        <ul className="space-y-2">
                                            {(ridersOverview?.riders || [])
                                                .filter((r) => r.is_active)
                                                .map((r) => (
                                                    <li
                                                        key={r.id}
                                                        className="flex items-center justify-between gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50"
                                                    >
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-sm truncate">{r.name}</p>
                                                            <p className="text-xs text-muted-foreground">{r.phone_number}</p>
                                                        </div>
                                                        <span
                                                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                                                String(r.status).toUpperCase() === 'AVAILABLE'
                                                                    ? 'bg-emerald-100 text-emerald-800'
                                                                    : String(r.status).toUpperCase() === 'BUSY'
                                                                      ? 'bg-amber-100 text-amber-800'
                                                                      : 'bg-slate-100 text-slate-600'
                                                            }`}
                                                        >
                                                            {r.status}
                                                        </span>
                                                    </li>
                                                ))}
                                            {!ridersLoading && (ridersOverview?.riders || []).filter((r) => r.is_active).length === 0 && (
                                                <li className="text-sm text-muted-foreground py-4 text-center">No active rider accounts</li>
                                            )}
                                        </ul>
                                    </div>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        Assign riders from the order detail panel when a delivery order is selected. Rider assignment mode is configured under Mobile settings.
                                    </p>
                                </div>
                            )}

                            {tab === 'settings' && (
                                <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                                    <MobileSettingsPanel />
                                </div>
                            )}
                        </div>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
}

function StatCard({
    label,
    value,
    tone,
}: {
    label: string;
    value: number;
    tone: 'emerald' | 'amber' | 'slate' | 'blue';
}) {
    const tones = {
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
        amber: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
        slate: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
        blue: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200',
    };
    return (
        <div className={`rounded-xl border p-3 ${tones[tone]}`}>
            <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">{label}</p>
            <p className="text-2xl font-bold tabular-nums mt-0.5">{value}</p>
        </div>
    );
}
