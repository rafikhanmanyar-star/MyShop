import React, { useCallback, useEffect, useState } from 'react';
import { Map, Bike, Settings, UserCheck } from 'lucide-react';
import { mobileOrdersApi, type PosRidersOverview } from '../../../services/mobileOrdersApi';
import { useMobileOrders } from '../../../context/MobileOrdersContext';
import type { OpsSlideTab } from './OrderCenterOpsSlideOver';

interface Props {
    ridersOverview: PosRidersOverview | null;
    onOpen: (tab: OpsSlideTab) => void;
}

export function OrderCenterToolbar({ ridersOverview, onOpen }: Props) {
    const stats = ridersOverview?.stats;
    const { userActivityTick } = useMobileOrders();
    const [onlineNow, setOnlineNow] = useState<number | null>(null);

    const loadOnlineCount = useCallback(async () => {
        try {
            const data = await mobileOrdersApi.getOnlineUsers(5);
            setOnlineNow(data.stats?.online_now ?? 0);
        } catch {
            setOnlineNow(null);
        }
    }, []);

    useEffect(() => {
        void loadOnlineCount();
        const id = window.setInterval(() => void loadOnlineCount(), 30_000);
        return () => clearInterval(id);
    }, [loadOnlineCount, userActivityTick]);

    return (
        <div className="flex flex-wrap items-center gap-2">
            {stats && (
                <div className="hidden lg:flex items-center gap-3 text-[0.65rem] font-semibold text-slate-500 dark:text-slate-400 mr-1">
                    <span>
                        <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">{stats.available}</span> avail
                    </span>
                    <span className="text-slate-300">·</span>
                    <span>
                        <span className="text-amber-600 dark:text-amber-400 tabular-nums">{stats.busy}</span> busy
                    </span>
                    <span className="text-slate-300">·</span>
                    <span>
                        <span className="text-blue-600 dark:text-blue-400 tabular-nums">{stats.open_deliveries}</span> deliveries
                    </span>
                </div>
            )}
            <button
                type="button"
                onClick={() => onOpen('map')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
                <Map className="w-3.5 h-3.5" />
                Live map
            </button>
            <button
                type="button"
                onClick={() => onOpen('riders')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
                <Bike className="w-3.5 h-3.5" />
                Riders
                {stats && stats.available > 0 && (
                    <span className="tabular-nums rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 px-1.5 text-[0.65rem]">
                        {stats.available}
                    </span>
                )}
            </button>
            <button
                type="button"
                onClick={() => onOpen('users')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
                <UserCheck className="w-3.5 h-3.5" />
                Mobile users
                {onlineNow != null && onlineNow > 0 && (
                    <span className="tabular-nums rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 px-1.5 text-[0.65rem]">
                        {onlineNow}
                    </span>
                )}
            </button>
            <button
                type="button"
                onClick={() => onOpen('settings')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
                <Settings className="w-3.5 h-3.5" />
                Mobile settings
            </button>
        </div>
    );
}
