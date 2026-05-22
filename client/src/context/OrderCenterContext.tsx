import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { orderCenterApi } from '../services/orderCenterApi';
import type { OrderCenterCounts, OrderCenterListItem, OrderCenterQueueFilter } from '../types/orderCenter';
import { getApiBaseUrl } from '../config/apiUrl';
import { useAuth } from './AuthContext';

export interface OrderCenterBellAlert {
    orderId: string;
    kind: 'cart' | 'voice';
    orderNumber: string;
    createdAt?: string;
}

interface OrderCenterContextType {
    items: OrderCenterListItem[];
    counts: OrderCenterCounts;
    loading: boolean;
    filter: OrderCenterQueueFilter;
    search: string;
    sseConnected: boolean;
    bellAlerts: OrderCenterBellAlert[];
    setFilter: (f: OrderCenterQueueFilter) => void;
    setSearch: (s: string) => void;
    refreshQueue: () => Promise<void>;
    dismissBellAlert: (id: string) => void;
    clearBellAlerts: () => void;
    playNotificationSound: () => void;
}

const defaultCounts: OrderCenterCounts = {
    all: 0,
    new: 0,
    voice_pending: 0,
    preparing: 0,
    ready: 0,
    delivered: 0,
    cancelled: 0,
    unpaid: 0,
};

const OrderCenterContext = createContext<OrderCenterContextType | null>(null);
const ROLES = ['admin', 'pos_cashier'];

export function OrderCenterProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const [items, setItems] = useState<OrderCenterListItem[]>([]);
    const [counts, setCounts] = useState<OrderCenterCounts>(defaultCounts);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState<OrderCenterQueueFilter>('all');
    const [search, setSearch] = useState('');
    const [sseConnected, setSseConnected] = useState(false);
    const [bellAlerts, setBellAlerts] = useState<OrderCenterBellAlert[]>([]);
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const filterRef = useRef(filter);
    const searchRef = useRef(search);

    filterRef.current = filter;
    searchRef.current = search;

    const playNotificationSound = useCallback(() => {
        try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.4);
        } catch { /* ignore */ }
    }, []);

    const refreshQueue = useCallback(async () => {
        setLoading(true);
        try {
            const data = await orderCenterApi.getQueue({
                filter: filterRef.current,
                search: searchRef.current.trim() || undefined,
                includeCancelled: filterRef.current === 'cancelled',
            });
            setItems(data.items);
            setCounts(data.counts);
        } catch {
            setItems([]);
            setCounts(defaultCounts);
        } finally {
            setLoading(false);
        }
    }, []);

    const dismissBellAlert = useCallback((id: string) => {
        setBellAlerts((prev) => prev.filter((a) => a.orderId !== id));
    }, []);

    const clearBellAlerts = useCallback(() => setBellAlerts([]), []);

    useEffect(() => {
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = setTimeout(() => void refreshQueue(), 300);
        return () => {
            if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        };
    }, [search, filter, refreshQueue]);

    useEffect(() => {
        const role = user?.role;
        if (!role || !ROLES.includes(role)) return;
        const poll = setInterval(() => void refreshQueue(), 15000);
        return () => clearInterval(poll);
    }, [user?.role, refreshQueue]);

    useEffect(() => {
        const role = user?.role;
        if (!role || !ROLES.includes(role)) return;
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        const url = `${getApiBaseUrl()}/shop/order-center/stream`;
        const controller = new AbortController();

        fetch(url, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
            signal: controller.signal,
        })
            .then((response) => {
                if (!response.ok || !response.body) {
                    setSseConnected(false);
                    return;
                }
                setSseConnected(true);
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                const pump = async () => {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';
                        for (const line of lines) {
                            if (!line.startsWith('data: ')) continue;
                            try {
                                const d = JSON.parse(line.slice(6));
                                if (d.type === 'new_order' || d.type === 'new_voice_order') {
                                    playNotificationSound();
                                    const kind: 'cart' | 'voice' = d.type === 'new_voice_order' ? 'voice' : 'cart';
                                    const orderId = d.voiceOrderId || d.orderId;
                                    setBellAlerts((prev) => [
                                        {
                                            orderId,
                                            kind,
                                            orderNumber: d.orderNumber,
                                            createdAt: d.createdAt,
                                        } as OrderCenterBellAlert,
                                        ...prev.filter((a) => a.orderId !== orderId),
                                    ].slice(0, 25));
                                }
                                if (
                                    ['new_order', 'new_voice_order', 'order_updated', 'voice_order_updated', 'order_center_updated'].includes(
                                        d.type
                                    )
                                ) {
                                    void refreshQueue();
                                }
                            } catch { /* ignore */ }
                        }
                    }
                    setSseConnected(false);
                };
                void pump();
            })
            .catch(() => setSseConnected(false));

        return () => {
            controller.abort();
            setSseConnected(false);
        };
    }, [user?.role, refreshQueue, playNotificationSound]);

    return (
        <OrderCenterContext.Provider
            value={{
                items,
                counts,
                loading,
                filter,
                search,
                sseConnected,
                bellAlerts,
                setFilter,
                setSearch,
                refreshQueue,
                dismissBellAlert,
                clearBellAlerts,
                playNotificationSound,
            }}
        >
            {children}
        </OrderCenterContext.Provider>
    );
}

export function useOrderCenter() {
    const ctx = useContext(OrderCenterContext);
    if (!ctx) throw new Error('useOrderCenter must be used within OrderCenterProvider');
    return ctx;
}
