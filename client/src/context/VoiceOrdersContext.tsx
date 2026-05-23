import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { voiceOrdersApi, VoiceOrder } from '../services/voiceOrdersApi';
import { getApiBaseUrl } from '../config/apiUrl';
import { useAuth } from './AuthContext';

export interface VoiceOrderBellAlert {
    voiceOrderId: string;
    orderNumber: string;
    status?: string;
    createdAt?: string;
}

interface VoiceOrdersContextType {
    orders: VoiceOrder[];
    loading: boolean;
    bellAlerts: VoiceOrderBellAlert[];
    sseConnected: boolean;
    loadOrders: (status?: string) => Promise<void>;
    refreshOrders: (status?: string) => void;
    setListStatusFilter: (status?: string) => void;
    dismissBellAlert: (id: string) => void;
    clearBellAlerts: () => void;
}

const VoiceOrdersContext = createContext<VoiceOrdersContextType | null>(null);

const ROLES = ['admin', 'pos_cashier'];

export function VoiceOrdersProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const [orders, setOrders] = useState<VoiceOrder[]>([]);
    const [loading, setLoading] = useState(false);
    const [bellAlerts, setBellAlerts] = useState<VoiceOrderBellAlert[]>([]);
    const [sseConnected, setSseConnected] = useState(false);
    const listStatusFilterRef = useRef<string | undefined>(undefined);

    const loadOrders = useCallback(async (status?: string) => {
        if (status !== undefined) listStatusFilterRef.current = status;
        const effective = listStatusFilterRef.current;
        setLoading(true);
        try {
            const data = await voiceOrdersApi.list(effective);
            setOrders(Array.isArray(data) ? data : []);
        } catch {
            setOrders([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const setListStatusFilter = useCallback((status?: string) => {
        listStatusFilterRef.current = status;
    }, []);

    const refreshOrders = useCallback((status?: string) => {
        void loadOrders(status);
    }, [loadOrders]);

    const dismissBellAlert = useCallback((id: string) => {
        setBellAlerts((prev) => prev.filter((a) => a.voiceOrderId !== id));
    }, []);

    const clearBellAlerts = useCallback(() => setBellAlerts([]), []);

    useEffect(() => {
        const role = user?.role;
        if (!role || !ROLES.includes(role)) return;
        const poll = setInterval(() => {
            void loadOrders();
        }, 12000);
        return () => clearInterval(poll);
    }, [user?.role, loadOrders]);

    useEffect(() => {
        const role = user?.role;
        if (!role || !ROLES.includes(role)) return;
        const token = localStorage.getItem('token');
        if (!token) return;
        const base = getApiBaseUrl();
        const url = `${base}/shop/voice-orders/stream`;
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
                                if (d.type === 'new_voice_order') {
                                    setBellAlerts((prev) => [
                                        {
                                            voiceOrderId: d.voiceOrderId,
                                            orderNumber: d.orderNumber,
                                            status: d.status,
                                            createdAt: d.createdAt,
                                        },
                                        ...prev.filter((a) => a.voiceOrderId !== d.voiceOrderId),
                                    ].slice(0, 20));
                                    void loadOrders();
                                } else if (d.type === 'voice_order_updated') {
                                    void loadOrders();
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
    }, [user?.role, loadOrders]);

    return (
        <VoiceOrdersContext.Provider
            value={{
                orders,
                loading,
                bellAlerts,
                sseConnected,
                loadOrders,
                refreshOrders,
                setListStatusFilter,
                dismissBellAlert,
                clearBellAlerts,
            }}
        >
            {children}
        </VoiceOrdersContext.Provider>
    );
}

export function useVoiceOrders() {
    const ctx = useContext(VoiceOrdersContext);
    if (!ctx) throw new Error('useVoiceOrders must be used within VoiceOrdersProvider');
    return ctx;
}
