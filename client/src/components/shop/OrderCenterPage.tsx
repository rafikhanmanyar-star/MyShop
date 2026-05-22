import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LayoutGrid, Wifi } from 'lucide-react';
import { OrderCenterProvider, useOrderCenter } from '../../context/OrderCenterContext';
import { orderCenterApi, type OrderCenterDetail } from '../../services/orderCenterApi';
import type { OrderCenterListItem } from '../../types/orderCenter';
import type { MobileOrder, PosRidersOverview } from '../../services/mobileOrdersApi';
import { OrderQueuePanel } from './order-center/OrderQueuePanel';
import { OrderDetailPanel } from './order-center/OrderDetailPanel';
import { OrderOperationsPanel } from './order-center/OrderOperationsPanel';
import { OrderCenterToolbar } from './order-center/OrderCenterToolbar';
import { OrderCenterOpsSlideOver, type OpsSlideTab } from './order-center/OrderCenterOpsSlideOver';
import { fetchRidersOverview } from './order-center/CartRiderAssign';

function parseSelection(params: URLSearchParams): { kind: 'cart' | 'voice'; id: string } | null {
    const order = params.get('order');
    const kind = params.get('kind') as 'cart' | 'voice' | null;
    if (order && kind) return { kind, id: order };
    if (order && !kind) return { kind: 'voice', id: order };
    return null;
}

function OrderCenterPageInner() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { items, sseConnected } = useOrderCenter();
    const [detail, setDetail] = useState<OrderCenterDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [ridersOverview, setRidersOverview] = useState<PosRidersOverview | null>(null);
    const [opsOpen, setOpsOpen] = useState(false);
    const [opsTab, setOpsTab] = useState<OpsSlideTab>('map');

    const selection = parseSelection(searchParams);
    const selectedKey = selection ? `${selection.kind}:${selection.id}` : null;
    const mapOrder: MobileOrder | null = detail?.kind === 'cart' ? detail.order : null;

    const loadRiders = useCallback(async () => {
        setRidersOverview(await fetchRidersOverview());
    }, []);

    const loadDetail = useCallback(async (kind: 'cart' | 'voice', id: string) => {
        setDetailLoading(true);
        try {
            setDetail(await orderCenterApi.getDetail(kind, id));
        } catch {
            setDetail(null);
        } finally {
            setDetailLoading(false);
        }
    }, []);

    const selectOrder = useCallback(
        (item: OrderCenterListItem) => {
            setSearchParams({ order: item.id, kind: item.kind });
        },
        [setSearchParams]
    );

    const openOps = useCallback((tab: OpsSlideTab) => {
        setOpsTab(tab);
        setOpsOpen(true);
    }, []);

    useEffect(() => {
        void loadRiders();
    }, [loadRiders]);

    useEffect(() => {
        if (!selection) {
            setDetail(null);
            return;
        }
        void loadDetail(selection.kind, selection.id);
    }, [selection?.kind, selection?.id, loadDetail]);

    useEffect(() => {
        const legacyVoice = searchParams.get('order');
        const kind = searchParams.get('kind');
        if (legacyVoice && !kind && items.length) {
            const voice = items.find((i) => i.kind === 'voice' && i.id === legacyVoice);
            if (voice) setSearchParams({ order: voice.id, kind: 'voice' }, { replace: true });
            const cart = items.find((i) => i.kind === 'cart' && i.id === legacyVoice);
            if (cart) setSearchParams({ order: cart.id, kind: 'cart' }, { replace: true });
        }
    }, [items, searchParams, setSearchParams]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && opsOpen) {
                setOpsOpen(false);
                return;
            }
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault();
                document.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
            }
            if (opsOpen) return;
            if (!items.length) return;
            const idx = items.findIndex((i) => `${i.kind}:${i.id}` === selectedKey);
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = items[Math.min(idx + 1, items.length - 1)] ?? items[0];
                selectOrder(next);
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prev = items[Math.max(idx - 1, 0)] ?? items[items.length - 1];
                selectOrder(prev);
            }
            if (e.key === 'Enter' && selection) {
                void loadDetail(selection.kind, selection.id);
            }
            if (e.ctrlKey && e.key === 'i' && detail?.kind === 'voice') {
                e.preventDefault();
                sessionStorage.setItem('myshop_pending_voice_order_id', detail.order.id);
                window.location.href = '/pos';
            }
            if (e.ctrlKey && e.key === 'p') {
                e.preventDefault();
                window.print();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [items, selectedKey, selection, selectOrder, loadDetail, detail, opsOpen]);

    return (
        <div className="flex flex-col h-full min-h-0 bg-gradient-to-b from-slate-50 to-slate-100/80 dark:from-slate-950 dark:to-slate-900">
            <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur shrink-0 shadow-sm">
                <div className="flex items-center gap-3 min-w-0">
                    <h1 className="text-xl font-bold flex items-center gap-2 tracking-tight shrink-0">
                        <LayoutGrid className="text-primary-600" size={22} />
                        Order Center
                    </h1>
                    <span className="text-xs flex items-center gap-1.5 text-muted-foreground font-medium">
                        <Wifi size={14} className={sseConnected ? 'text-emerald-500' : ''} />
                        {sseConnected ? 'Live' : 'Sync'}
                    </span>
                </div>
                <OrderCenterToolbar ridersOverview={ridersOverview} onOpen={openOps} />
            </header>

            <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
                <div className="w-full lg:w-[32%] xl:w-[30%] shrink-0 min-h-[240px] lg:min-h-0 lg:max-h-full flex flex-col">
                    <OrderQueuePanel selectedKey={selectedKey} onSelect={selectOrder} />
                </div>
                <div className="flex-1 min-w-0 min-h-[320px] lg:min-h-0 flex flex-col bg-white/60 dark:bg-slate-900/40">
                    <OrderDetailPanel
                        detail={detail}
                        loading={detailLoading}
                        onRefresh={() => selection && void loadDetail(selection.kind, selection.id)}
                        ridersOverview={ridersOverview}
                        onRidersRefresh={() => void loadRiders()}
                    />
                </div>
                <div className="hidden md:flex w-full md:w-[28%] lg:w-[26%] shrink-0 min-h-0 flex-col">
                    <OrderOperationsPanel detail={detail} />
                </div>
            </div>

            <OrderCenterOpsSlideOver
                open={opsOpen}
                tab={opsTab}
                onClose={() => setOpsOpen(false)}
                onTabChange={setOpsTab}
                mapOrder={mapOrder}
                onMapOrderRefresh={() => selection?.kind === 'cart' && void loadDetail('cart', selection.id)}
            />
        </div>
    );
}

export default function OrderCenterPage() {
    return (
        <OrderCenterProvider>
            <OrderCenterPageInner />
        </OrderCenterProvider>
    );
}
