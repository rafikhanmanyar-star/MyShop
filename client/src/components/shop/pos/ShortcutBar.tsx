import React from 'react';
import { usePOS } from '../../../context/POSContext';
import { useShifts } from '../../../context/ShiftsContext';
import { ICONS } from '../../../constants';
import { POS_CLEAR_CART_SHORTCUT_KEY, requestClearCart } from './posCartShortcuts';

interface ShortcutBarProps {
    isFullScreen: boolean;
    onToggleFullScreen: () => void;
}

const ShortcutBar: React.FC<ShortcutBarProps> = ({ isFullScreen, onToggleFullScreen }) => {
    const {
        holdSale,
        setIsHeldSalesModalOpen,
        setIsSalesHistoryModalOpen,
        setIsCustomerModalOpen,
        setIsDenseMode,
        isDenseMode,
        terminals,
        cart,
        clearCart,
    } = usePOS();
    const { currentShift } = useShifts();
    const terminalName = currentShift && terminals?.length
        ? (terminals.find((t: any) => t.id === currentShift.terminal_id)?.name || terminals.find((t: any) => t.id === currentShift.terminal_id)?.code || 'Terminal')
        : 'No shift';

    const shortcuts = [
        { key: 'F1', label: 'Search', action: () => document.getElementById('pos-product-search')?.focus(), icon: ICONS.search },
        { key: 'F2', label: 'Cart', action: () => document.getElementById('pos-cart-panel')?.focus(), icon: ICONS.shoppingCart },
        {
            key: POS_CLEAR_CART_SHORTCUT_KEY,
            label: 'Clear',
            action: () => requestClearCart(clearCart, cart.length),
            icon: ICONS.trash,
        },
        {
            key: 'F3',
            label: 'Pay',
            action: () => {
                const tender = document.getElementById('tender-amount-input') as HTMLInputElement | null;
                if (tender && !tender.disabled) tender.focus();
                else document.getElementById('pos-checkout-panel')?.focus();
            },
            icon: ICONS.dollarSign,
        },
        { key: 'F4', label: 'Recall', action: () => setIsHeldSalesModalOpen(true), icon: ICONS.refresh },
        { key: 'F5', label: 'Disc', action: () => document.getElementById('pos-discount-toggle')?.click(), icon: ICONS.filter },
        { key: 'Ctrl+H', label: 'Hold', action: () => { if (cart.length) holdSale(`Hold-${new Date().toLocaleTimeString()}`); }, icon: ICONS.pause },
        { key: 'F8', label: 'Cust', action: () => setIsCustomerModalOpen(true), icon: ICONS.user },
        { key: 'F9', label: 'Hist', action: () => setIsSalesHistoryModalOpen(true), icon: ICONS.clock },
        { key: 'F7', label: isFullScreen ? 'Exit' : 'Full', action: onToggleFullScreen, icon: isFullScreen ? ICONS.minimize : ICONS.maximize },
        { key: 'Alt+D', label: isDenseMode ? 'Touch' : 'Dense', action: () => setIsDenseMode(!isDenseMode), icon: ICONS.grid },
    ];

    return (
        <div className="pos-shortcut-bar flex flex-wrap items-center justify-between gap-x-1 gap-y-1 border-t border-slate-300/80 bg-gray-200 px-2 py-1 shadow-[0_-1px_0_rgba(0,0,0,0.06)] dark:border-slate-600 dark:bg-slate-800 md:px-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5">
                {shortcuts.map((s) => (
                    <button
                        key={s.key + s.label}
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            s.action();
                        }}
                        className="flex min-w-0 max-w-[7.5rem] items-center gap-1 rounded-md px-1.5 py-1 text-slate-700 transition-colors hover:bg-slate-300/70 dark:text-slate-200 dark:hover:bg-slate-600/80 touch-manipulation sm:max-w-none"
                        title={`${s.label} (${s.key})`}
                    >
                        <span className="hidden shrink-0 text-slate-600 opacity-90 dark:text-slate-400 md:block">
                            {React.cloneElement(s.icon as React.ReactElement, { size: 13 })}
                        </span>
                        <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-800 dark:text-slate-100">
                            {s.label}
                        </span>
                        <span className="shrink-0 font-mono text-[9px] font-bold tabular-nums text-slate-500 dark:text-slate-400">
                            {s.key}
                        </span>
                    </button>
                ))}
                <span className="hidden items-center gap-0.5 rounded-md border border-slate-300/50 bg-white/50 px-1.5 py-0.5 text-[9px] font-medium text-slate-600 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-300 lg:inline-flex">
                    <kbd className="kbd-tag text-[8px]">↑↓</kbd>
                    <kbd className="kbd-tag text-[8px]">+/-</kbd>
                    <kbd className="kbd-tag text-[8px]">Del</kbd>
                    <kbd className="kbd-tag text-[8px]">Ctrl+1–3</kbd>
                    pay
                </span>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-2">
                <div className="hidden items-center gap-1.5 rounded-full border border-slate-400/50 bg-white/50 px-2 py-0.5 dark:border-slate-500/60 dark:bg-slate-700/60 sm:flex">
                    <div className={`h-1.5 w-1.5 rounded-full ${currentShift ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <span
                        className={`max-w-[100px] truncate text-[10px] font-semibold ${currentShift ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'}`}
                    >
                        {terminalName}
                    </span>
                </div>

                <button
                    type="button"
                    id="pos-finalize-btn"
                    onClick={() => document.getElementById('pos-complete-sale-btn')?.click()}
                    disabled={cart.length === 0}
                    className="flex items-center gap-2 rounded-lg bg-primary-600 py-1.5 pl-3 pr-3.5 text-white shadow-md shadow-primary-900/25 transition-all hover:bg-primary-700 active:scale-[0.99] touch-manipulation disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <span className="text-[10px] font-bold uppercase tracking-wider">Finalize</span>
                    <span className="font-mono text-[9px] font-bold opacity-90">F12</span>
                </button>
            </div>
        </div>
    );
};

export default ShortcutBar;
