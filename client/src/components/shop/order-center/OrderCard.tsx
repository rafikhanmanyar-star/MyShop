import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { Mic, Clock, Phone } from 'lucide-react';
import type { OrderCenterListItem } from '../../../types/orderCenter';
import { SOURCE_BADGE } from '../../../types/orderCenter';
import { useShopTimezone } from '../../../context/ShopTimezoneContext';
import { cardAccentClass, formatOrderTime, formatRelativeTime } from './orderCenterUtils';

interface Props {
    item: OrderCenterListItem;
    selected: boolean;
    onSelect: () => void;
}

function OrderCardInner({ item, selected, onSelect }: Props) {
    const { timezone } = useShopTimezone();
    const badge = SOURCE_BADGE[item.order_source] || SOURCE_BADGE.cart;
    const accent = cardAccentClass(item);

    return (
        <motion.button
            type="button"
            layout
            onClick={onSelect}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className={`w-full text-left p-4 border-b border-slate-100 dark:border-slate-800/80 border-l-4 transition-shadow ${accent} ${
                selected
                    ? 'bg-primary-50/90 dark:bg-primary-950/40 shadow-inner ring-1 ring-primary-200/60 dark:ring-primary-800'
                    : 'hover:bg-slate-50/90 dark:hover:bg-slate-800/40'
            } ${item.is_unread ? 'shadow-[inset_0_0_20px_rgba(99,102,241,0.08)]' : ''}`}
        >
            <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                    <span className="font-semibold text-sm truncate block">{item.customer_name || 'Customer'}</span>
                    <span className="text-[11px] text-muted-foreground font-mono">{item.order_number}</span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${badge.className}`}>
                    {badge.label}
                </span>
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-semibold">
                    {item.display_status}
                </span>
                {item.has_audio && <Mic size={12} className="text-violet-600" />}
                {item.converted_from_voice && (
                    <span className="text-[10px] text-violet-600 font-medium">From voice</span>
                )}
            </div>
            <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1">
                    <Clock size={11} /> {formatOrderTime(item.created_at, timezone)}
                </span>
                <span className="text-primary-600/80 font-medium">{formatRelativeTime(item.created_at)}</span>
            </div>
            <div className="text-xs mt-1 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 text-muted-foreground truncate">
                    <Phone size={11} /> {item.customer_phone}
                </span>
                {item.grand_total > 0 && (
                    <span className="font-semibold tabular-nums">Rs. {item.grand_total.toLocaleString()}</span>
                )}
            </div>
            <div className="text-[10px] mt-1 capitalize text-muted-foreground">{item.delivery_mode || 'delivery'}</div>
        </motion.button>
    );
}

export const OrderCard = memo(OrderCardInner);
