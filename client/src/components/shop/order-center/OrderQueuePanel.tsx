import React from 'react';
import { Search, RefreshCw, Radio } from 'lucide-react';
import { useOrderCenter } from '../../../context/OrderCenterContext';
import { QUEUE_FILTER_LABELS, type OrderCenterQueueFilter } from '../../../types/orderCenter';
import { OrderCard } from './OrderCard';
import type { OrderCenterListItem } from '../../../types/orderCenter';

const FILTERS: OrderCenterQueueFilter[] = [
    'all',
    'new',
    'voice_pending',
    'preparing',
    'ready',
    'delivered',
    'cancelled',
    'unpaid',
];

interface Props {
    selectedKey: string | null;
    onSelect: (item: OrderCenterListItem) => void;
}

export function OrderQueuePanel({ selectedKey, onSelect }: Props) {
    const { items, counts, loading, filter, search, setFilter, setSearch, refreshQueue, sseConnected } =
        useOrderCenter();
    const countFor = (f: OrderCenterQueueFilter) => counts[f] ?? 0;

    return (
        <div className="flex flex-col h-full min-h-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 shrink-0 space-y-2">
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="search"
                        placeholder="Order, customer, phone… (Ctrl+F)"
                        className="input w-full pl-9 text-sm"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <Radio size={12} className={sseConnected ? 'text-emerald-500' : 'text-slate-400'} />
                        {sseConnected ? 'Live' : 'Polling'}
                    </span>
                    <button
                        type="button"
                        onClick={() => void refreshQueue()}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="Refresh"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>
            <div className="flex gap-1 p-2 overflow-x-auto border-b border-slate-100 dark:border-slate-800 shrink-0 scrollbar-thin">
                {FILTERS.map((f) => (
                    <button
                        key={f}
                        type="button"
                        onClick={() => setFilter(f)}
                        className={`px-2.5 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors ${
                            filter === f
                                ? 'bg-primary-600 text-white shadow-sm'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                    >
                        {QUEUE_FILTER_LABELS[f]}
                        {countFor(f) > 0 && (
                            <span className="ml-1 opacity-80">({countFor(f)})</span>
                        )}
                    </button>
                ))}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
                {items.length === 0 && !loading && (
                    <p className="p-8 text-sm text-center text-muted-foreground">No orders in this queue</p>
                )}
                {items.map((item) => {
                    const key = `${item.kind}:${item.id}`;
                    return (
                        <OrderCard
                            key={key}
                            item={item}
                            selected={selectedKey === key}
                            onSelect={() => onSelect(item)}
                        />
                    );
                })}
                {loading && items.length === 0 && (
                    <div className="p-6 space-y-3">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-24 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
