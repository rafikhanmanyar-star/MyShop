import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { mobileOrdersApi, MobileOrder, MobileOrderingSettings, ShopBranding } from '../services/mobileOrdersApi';
import { getApiBaseUrl } from '../config/apiUrl';
import { useAuth } from './AuthContext';

/** Incoming mobile order alerts for the global bell (from SSE). */
export interface MobileOrderBellAlert {
    orderId: string;
    orderNumber: string;
    grandTotal?: number;
    status?: string;
    createdAt?: string;
}

interface MobileOrdersState {
    orders: MobileOrder[];
    settings: MobileOrderingSettings | null;
    branding: ShopBranding | null;
    newOrderCount: number;
    bellAlerts: MobileOrderBellAlert[];
    loading: boolean;
    error: string | null;
    sseConnected: boolean;
}

interface MobileOrdersContextType extends MobileOrdersState {
    loadOrders: (status?: string) => Promise<void>;
    loadSettings: () => Promise<void>;
    loadBranding: () => Promise<void>;
    updateOrderStatus: (orderId: string, status: string, note?: string) => Promise<void>;
    collectPayment: (orderId: string, bankAccountId: string) => Promise<void>;
    updateSettings: (data: Partial<MobileOrderingSettings>) => Promise<void>;
    updateBranding: (data: Partial<ShopBranding>) => Promise<void>;
    clearNewOrderCount: () => void;
    dismissBellAlert: (orderId: string) => void;
    clearBellAlerts: () => void;
    refreshOrders: () => void;
}

const MobileOrdersContext = createContext<MobileOrdersContextType>(null!);

const MOBILE_ORDER_SSE_ROLES = ['admin', 'pos_cashier'];

export function MobileOrdersProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const [orders, setOrders] = useState<MobileOrder[]>([]);
    const [settings, setSettings] = useState<MobileOrderingSettings | null>(null);
    const [branding, setBranding] = useState<ShopBranding | null>(null);
    const [newOrderCount, setNewOrderCount] = useState(0);
    const [bellAlerts, setBellAlerts] = useState<MobileOrderBellAlert[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sseConnected, setSseConnected] = useState(false);

    // Create notification sound using Web Audio API
    const playNotificationSound = useCallback(() => {
        try {
            const ctx = new AudioContext();
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            oscillator.connect(gain);
            gain.connect(ctx.destination);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.5);
            // Second beep
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1100, ctx.currentTime + 0.15);
            gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.15);
            gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.65);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(ctx.currentTime + 0.15);
            osc2.stop(ctx.currentTime + 0.65);
        } catch { /* Audio not available */ }
    }, []);

    const dismissBellAlert = useCallback((orderId: string) => {
        setBellAlerts(prev => prev.filter(a => a.orderId !== orderId));
    }, []);

    const clearBellAlerts = useCallback(() => setBellAlerts([]), []);

    const loadOrders = useCallback(async (status?: string) => {
        setLoading(true);
        setError(null);
        try {
            const data = await mobileOrdersApi.getOrders(status);
            setOrders(data);
        } catch (err: any) {
            setError(err.error || err.message || 'Failed to load orders');
        } finally {
            setLoading(false);
        }
    }, []);

    // ─── SSE Connection (admin / POS cashier only; matches API roles) ───
    useEffect(() => {
        const token = localStorage.getItem('auth_token');
        if (!token || !user || !MOBILE_ORDER_SSE_ROLES.includes(user.role)) {
            setSseConnected(false);
            return;
        }

        const baseUrl = getApiBaseUrl();
        const url = `${baseUrl}/shop/mobile-orders/stream`;

        const connect = () => {

            // We need to add auth header - EventSource doesn't support headers natively
            // So we use fetch-based SSE instead
            const controller = new AbortController();

            fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'text/event-stream',
                },
                signal: controller.signal,
            }).then(response => {
                if (!response.ok || !response.body) {
                    setSseConnected(false);
                    return;
                }

                setSseConnected(true);
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                const processStream = async () => {
                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split('\n');
                            buffer = lines.pop() || '';

                            for (const line of lines) {
                                if (line.startsWith('data: ')) {
                                    try {
                                        const payload = JSON.parse(line.slice(6));
                                        if (payload.type === 'new_order') {
                                            const orderId = payload.orderId ?? payload.order_id;
                                            const orderNumber = payload.orderNumber ?? payload.order_number ?? 'Order';
                                            if (orderId) {
                                                setBellAlerts(prev => {
                                                    const next: MobileOrderBellAlert = {
                                                        orderId: String(orderId),
                                                        orderNumber: String(orderNumber),
                                                        grandTotal: payload.grandTotal != null ? Number(payload.grandTotal) : undefined,
                                                        status: payload.status,
                                                        createdAt: payload.createdAt ?? payload.created_at,
                                                    };
                                                    const rest = prev.filter(a => a.orderId !== next.orderId);
                                                    return [next, ...rest].slice(0, 40);
                                                });
                                            }
                                            setNewOrderCount(prev => prev + 1);
                                            playNotificationSound();
                                            // Auto-refresh orders list
                                            loadOrders();
                                        } else if (payload.type === 'order_updated') {
                                            // Stage 11: shop/rider/customer order or delivery status changed — refresh list (no bell)
                                            loadOrders();
                                        } else if (payload.type === 'connected') {
                                            setSseConnected(true);
                                        }
                                    } catch { /* ignore parse errors */ }
                                }
                            }
                        }
                    } catch (err: any) {
                        if (err.name !== 'AbortError') {
                            setSseConnected(false);
                            // Reconnect after 5s
                            setTimeout(connect, 5000);
                        }
                    }
                };

                processStream();
            }).catch(err => {
                if (err.name !== 'AbortError') {
                    setSseConnected(false);
                    setTimeout(connect, 5000);
                }
            });

            return controller;
        };

        const controller = connect();

        return () => {
            controller?.abort?.();
        };
    }, [user?.role, loadOrders, playNotificationSound]);

    const loadSettings = useCallback(async () => {
        try {
            const data = await mobileOrdersApi.getSettings();
            setSettings(data);
        } catch { /* ignore */ }
    }, []);

    const loadBranding = useCallback(async () => {
        try {
            const data = await mobileOrdersApi.getBranding();
            setBranding(data);
        } catch { /* ignore */ }
    }, []);

    const updateOrderStatus = useCallback(async (orderId: string, status: string, note?: string) => {
        await mobileOrdersApi.updateStatus(orderId, status, note);
        await loadOrders();
    }, [loadOrders]);

    const collectPayment = useCallback(async (orderId: string, bankAccountId: string) => {
        await mobileOrdersApi.collectPayment(orderId, bankAccountId);
        await loadOrders();
    }, [loadOrders]);

    const updateSettings = useCallback(async (data: Partial<MobileOrderingSettings>) => {
        const updated = await mobileOrdersApi.updateSettings(data);
        setSettings(updated);
    }, []);

    const updateBranding = useCallback(async (data: Partial<ShopBranding>) => {
        await mobileOrdersApi.updateBranding(data);
        await loadBranding();
    }, [loadBranding]);

    const clearNewOrderCount = useCallback(() => setNewOrderCount(0), []);
    const refreshOrders = useCallback(() => loadOrders(), [loadOrders]);

    return (
        <MobileOrdersContext.Provider value={{
            orders, settings, branding, newOrderCount, bellAlerts, loading, error, sseConnected,
            loadOrders, loadSettings, loadBranding,
            updateOrderStatus, collectPayment, updateSettings, updateBranding,
            clearNewOrderCount, dismissBellAlert, clearBellAlerts, refreshOrders,
        }}>
            {children}
        </MobileOrdersContext.Provider>
    );
}

export function useMobileOrders() {
    return useContext(MobileOrdersContext);
}
