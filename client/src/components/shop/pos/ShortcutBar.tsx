
import React from 'react';
import { usePOS } from '../../../context/POSContext';
import { ICONS } from '../../../constants';

interface ShortcutBarProps {
    isFullScreen: boolean;
    onToggleFullScreen: () => void;
}

const ShortcutBar: React.FC<ShortcutBarProps> = ({ isFullScreen, onToggleFullScreen }) => {
    const {
        clearCart,
        setIsHeldSalesModalOpen,
        setIsSalesHistoryModalOpen,
        setIsCustomerModalOpen,
        setIsPaymentModalOpen,
        balanceDue,
        completeSale
    } = usePOS();

    const shortcuts = [
        { key: 'F1', label: 'Clear', action: clearCart, icon: ICONS.trash, color: 'text-rose-500' },
        { key: 'F2', label: 'Hold', action: () => { }, icon: ICONS.pause, color: 'text-amber-500' },
        { key: 'F3', label: 'Recall', action: () => setIsHeldSalesModalOpen(true), icon: ICONS.refresh, color: 'text-indigo-500' },
        { key: 'F6', label: 'Customer', action: () => setIsCustomerModalOpen(true), icon: ICONS.user, color: 'text-blue-500' },
        { key: 'F9', label: 'History', action: () => setIsSalesHistoryModalOpen(true), icon: ICONS.clock, color: 'text-slate-500' },
        { key: 'F7', label: isFullScreen ? 'Exit Full' : 'Fullscreen', action: onToggleFullScreen, icon: isFullScreen ? ICONS.minimize : ICONS.maximize, color: 'text-slate-500' },
    ];

    return (
        <div className="bg-[#0f172a] px-6 py-4 flex items-center justify-between border-t border-slate-800 shadow-xl">
            <div className="flex items-center gap-1">
                {shortcuts.map((s) => (
                    <button
                        key={s.key}
                        onClick={s.action}
                        className="flex flex-col items-center justify-center w-24 h-16 rounded-xl hover:bg-white/10 transition-all group"
                    >
                        <div className={`${s.color} mb-1.5 transition-transform group-hover:scale-110`}>
                            {React.cloneElement(s.icon as React.ReactElement, { size: 20 })}
                        </div>
                        <span className="text-[10px] font-bold text-white/90 uppercase tracking-wider">{s.label}</span>
                        <span className="text-[9px] font-medium text-white/30">{s.key}</span>
                    </button>
                ))}
            </div>

            <div className="flex items-center gap-6">
                {/* Status Pill */}
                <div className="flex items-center gap-3 px-4 py-2 bg-slate-800/50 rounded-full border border-slate-700/50">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-[10px] font-bold text-emerald-400 capitalize tracking-wide">Main Terminal #01</span>
                    </div>
                </div>

                <div className="flex items-center gap-4 ml-2">
                    <button
                        onClick={() => {
                            if (balanceDue <= 0) {
                                completeSale();
                            } else {
                                setIsPaymentModalOpen(true);
                            }
                        }}
                        className="flex items-center gap-4 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl transition-all active:scale-[0.98] group"
                    >
                        <div className="flex flex-col text-left">
                            <span className="text-[9px] font-bold uppercase tracking-widest opacity-80 leading-none mb-1">Quick Pay</span>
                            <span className="text-xs font-black uppercase tracking-wider">Finalize (F12)</span>
                        </div>
                        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center transition-transform group-hover:translate-x-1">
                            {React.cloneElement(ICONS.chevronRight as React.ReactElement, { size: 16 })}
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
};


export default ShortcutBar;
