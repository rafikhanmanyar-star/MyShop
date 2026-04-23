import React from 'react';
import { usePOS } from '../../../context/POSContext';
import { useShifts } from '../../../context/ShiftsContext';
import { ICONS } from '../../../constants';

interface ShortcutBarProps {
    isFullScreen: boolean;
    onToggleFullScreen: () => void;
}

const ShortcutBar: React.FC<ShortcutBarProps> = ({ isFullScreen, onToggleFullScreen }) => {
    const {
        clearCart,
        holdSale,
        setIsHeldSalesModalOpen,
        setIsSalesHistoryModalOpen,
        setIsCustomerModalOpen,
        setIsPaymentModalOpen,
        balanceDue,
        completeSale,
        isDenseMode,
        setIsDenseMode,
        terminals
    } = usePOS();
    const { currentShift } = useShifts();
    const terminalName = currentShift && terminals?.length
        ? (terminals.find((t: any) => t.id === currentShift.terminal_id)?.name || terminals.find((t: any) => t.id === currentShift.terminal_id)?.code || 'Terminal')
        : 'No shift';

    const shortcuts = [
        { key: 'F1', label: 'Search', action: () => document.getElementById('pos-product-search')?.focus(), icon: ICONS.search },
        { key: 'F2', label: 'Cart', action: () => document.getElementById('pos-cart-panel')?.focus(), icon: ICONS.shoppingCart },
        { key: 'F3', label: 'Pay', action: () => document.getElementById('tender-amount-input')?.focus(), icon: ICONS.dollarSign },
        { key: 'F4', label: 'Recall', action: () => setIsHeldSalesModalOpen(true), icon: ICONS.refresh },
        { key: 'Ctrl+H', label: 'Hold', action: () => holdSale(`Hold-${new Date().toLocaleTimeString()}`), icon: ICONS.pause },
        { key: 'F6', label: 'Cust', action: () => setIsCustomerModalOpen(true), icon: ICONS.user },
        { key: 'F9', label: 'Hist', action: () => setIsSalesHistoryModalOpen(true), icon: ICONS.clock },
        { key: 'F7', label: isFullScreen ? 'Exit' : 'Full', action: onToggleFullScreen, icon: isFullScreen ? ICONS.minimize : ICONS.maximize },
        { key: 'Alt+D', label: isDenseMode ? 'Touch' : 'Dense', action: () => setIsDenseMode(!isDenseMode), icon: ICONS.grid },
    ];

    return (
        <div className="flex flex-wrap items-center justify-between gap-y-2 border-t border-slate-300/80 bg-gray-200 px-3 py-3 shadow-[0_-1px_0_rgba(0,0,0,0.06)] dark:border-slate-600 dark:bg-slate-800 md:px-6">
            <div className="flex min-w-0 flex-wrap items-center gap-0.5 md:gap-1">
                {shortcuts.map((s) => (
                    <button
                        key={s.key + s.label}
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            s.action();
                        }}
                        className="flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-2 text-slate-700 transition-colors hover:bg-slate-300/70 dark:text-slate-200 dark:hover:bg-slate-600/80 md:gap-2 md:px-3 touch-manipulation"
                    >
                        <span className="hidden flex-shrink-0 text-slate-600 opacity-90 dark:text-slate-400 sm:block">
                            {React.cloneElement(s.icon as React.ReactElement, { size: 16 })}
                        </span>
                        <span className="truncate text-xs font-semibold uppercase tracking-wide text-slate-800 dark:text-slate-100">
                            {s.label}
                        </span>
                        <span className="font-mono text-xs font-bold tabular-nums text-slate-500 dark:text-slate-400">
                            {s.key}
                        </span>
                    </button>
                ))}
            </div>

            <div className="ml-auto flex flex-shrink-0 items-center gap-3 md:gap-5">
                <div className="hidden items-center gap-2 rounded-full border border-slate-400/50 bg-white/50 px-3 py-1.5 dark:border-slate-500/60 dark:bg-slate-700/60 sm:flex">
                    <div className={`h-2 w-2 rounded-full ${currentShift ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <span
                        className={`max-w-[120px] truncate text-xs font-semibold tracking-wide ${currentShift ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'}`}
                    >
                        {terminalName}
                    </span>
                </div>

                <button
                    type="button"
                    onClick={() => {
                        if (balanceDue <= 0) {
                            void completeSale();
                        } else {
                            setIsPaymentModalOpen(true);
                        }
                    }}
                    className="flex items-center gap-3 rounded-lg bg-primary-600 py-3 pl-4 pr-5 text-white shadow-md shadow-primary-900/30 transition-all hover:bg-primary-700 active:scale-[0.99] touch-manipulation"
                >
                    <span className="flex-shrink-0 text-gray-200/90" aria-hidden>
                        {React.cloneElement(ICONS.dollarSign as React.ReactElement, { size: 18 })}
                    </span>
                    <div className="flex flex-col text-left leading-tight">
                        <span className="text-xs font-bold uppercase tracking-widest opacity-90">Finalize</span>
                        <span className="text-xs font-bold">F12 / Enter</span>
                    </div>
                </button>
            </div>
        </div>
    );
};

export default ShortcutBar;
