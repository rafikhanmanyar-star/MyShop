import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, User } from 'lucide-react';
import {
    mobileOrdersApi,
    type MobileActiveTodayUser,
    type MobileOnlineUser,
    type MobileUsersStats,
} from '../../../services/mobileOrdersApi';
import { useMobileOrders } from '../../../context/MobileOrdersContext';
import { MobileUsersPanel } from '../MobileOrdersPage';
import Modal from '../../ui/Modal';

function formatPageLabel(page: string | null): { label: string } {
    if (!page) return { label: 'Unknown' };
    const labels: Record<string, string> = {
        home: 'Home',
        browsing_products: 'Browsing Products',
        viewing_product: 'Viewing Product',
        viewing_cart: 'Viewing Cart',
        checkout: 'Checkout',
        browsing_offers: 'Browsing Offers',
        viewing_offer: 'Viewing Offer',
        viewing_orders: 'My Orders',
        viewing_order: 'Order Detail',
        tracking_order: 'Tracking Order',
        account_settings: 'Account',
        budget: 'Budget',
        notifications: 'Notifications',
    };
    if (labels[page]) return { label: labels[page] };
    return { label: page.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) };
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

/** Live mobile app users — same data as legacy Mobile Orders → Mobile Users tab. */
export function OrderCenterMobileUsers({ active }: { active: boolean }) {
    const { userActivityTick } = useMobileOrders();
    const [users, setUsers] = useState<MobileOnlineUser[]>([]);
    const [stats, setStats] = useState<MobileUsersStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [activeTodayOpen, setActiveTodayOpen] = useState(false);
    const [activeTodayUsers, setActiveTodayUsers] = useState<MobileActiveTodayUser[]>([]);
    const [activeTodayLoading, setActiveTodayLoading] = useState(false);
    const [activeTodayError, setActiveTodayError] = useState<string | null>(null);

    const loadOnlineUsers = useCallback(async () => {
        setLoading(true);
        try {
            const data = await mobileOrdersApi.getOnlineUsers(5);
            setUsers(data.users);
            setStats(data.stats);
        } catch {
            setUsers([]);
            setStats(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const openActiveToday = useCallback(async () => {
        setActiveTodayOpen(true);
        setActiveTodayLoading(true);
        setActiveTodayError(null);
        try {
            const data = await mobileOrdersApi.getActiveTodayUsers(5);
            setActiveTodayUsers(data.users);
        } catch (err: unknown) {
            setActiveTodayUsers([]);
            const e = err as { error?: string; message?: string };
            setActiveTodayError(e?.error || e?.message || 'Failed to load active users');
        } finally {
            setActiveTodayLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!active) return;
        void loadOnlineUsers();
    }, [active, loadOnlineUsers]);

    useEffect(() => {
        if (!active) return;
        const id = window.setInterval(() => void loadOnlineUsers(), 15_000);
        return () => clearInterval(id);
    }, [active, loadOnlineUsers]);

    useEffect(() => {
        if (!active || userActivityTick <= 0) return;
        void loadOnlineUsers();
    }, [active, userActivityTick, loadOnlineUsers]);

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="shrink-0 flex items-center justify-between gap-2 px-1 pb-3">
                <p className="text-xs text-muted-foreground leading-snug max-w-md">
                    Customers using the mobile app right now (heartbeat within ~5 minutes). Updates automatically.
                </p>
                <button
                    type="button"
                    onClick={() => void loadOnlineUsers()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                    title="Refresh mobile users"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                <MobileUsersPanel
                    users={users}
                    stats={stats}
                    loading={loading}
                    onRefresh={() => void loadOnlineUsers()}
                    onActiveTodayClick={() => void openActiveToday()}
                />
            </div>

            <Modal
                isOpen={activeTodayOpen}
                onClose={() => setActiveTodayOpen(false)}
                title={
                    <div className="space-y-0.5">
                        <div className="text-base font-bold text-foreground">Active today</div>
                        <p className="text-xs font-normal text-muted-foreground leading-snug pr-6">
                            Everyone who used the app or signed in at least once today.
                        </p>
                    </div>
                }
                size="lg"
                maxContentHeight={560}
            >
                <div className="space-y-3">
                    {activeTodayLoading && activeTodayUsers.length === 0 ? (
                        <div className="flex items-center justify-center py-16">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
                        </div>
                    ) : activeTodayError ? (
                        <p className="text-sm text-red-600 text-center py-8">{activeTodayError}</p>
                    ) : activeTodayUsers.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                            No customer activity recorded for today yet.
                        </p>
                    ) : (
                        <ul className="space-y-2 max-h-[min(70vh,520px)] overflow-auto custom-scrollbar pr-1">
                            {activeTodayUsers.map((user) => {
                                const page = formatPageLabel(user.current_page);
                                const hasCart = (user.cart_item_count || 0) > 0;
                                return (
                                    <li
                                        key={user.customer_id}
                                        className={`rounded-2xl border p-4 ${
                                            user.is_online
                                                ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-800/60 dark:bg-emerald-950/20'
                                                : 'border-border dark:border-slate-700'
                                        }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div
                                                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                                    user.is_online ? 'bg-emerald-100' : 'bg-slate-100'
                                                }`}
                                            >
                                                <User className="w-5 h-5 text-slate-600" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-bold truncate">
                                                    {user.customer_name || 'Anonymous'}
                                                </p>
                                                <p className="text-xs text-muted-foreground font-mono">
                                                    {user.customer_phone}
                                                </p>
                                                <p className="text-xs mt-1">{page.label}</p>
                                                {hasCart ? (
                                                    <p className="text-xs text-amber-700 mt-1">
                                                        Cart: {user.cart_item_count} items
                                                    </p>
                                                ) : null}
                                                {user.last_seen_at ? (
                                                    <p className="text-[0.65rem] text-muted-foreground mt-1">
                                                        {user.is_online ? 'Online' : 'Last seen'} ·{' '}
                                                        {timeAgo(user.last_seen_at)}
                                                    </p>
                                                ) : null}
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </Modal>
        </div>
    );
}
