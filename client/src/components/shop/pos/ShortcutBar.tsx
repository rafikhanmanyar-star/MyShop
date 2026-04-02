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
        { key: 'F1', label: 'Clear', action: clearCart, icon: ICONS.trash },
        { key: 'F2', label: 'Hold', action: () => holdSale(`Hold-${new Date().toLocaleTimeString()}`), icon: ICONS.pause },
        { key: 'F3', label: 'Recall', action: () => setIsHeldSalesModalOpen(true), icon: ICONS.refresh },
        { key: 'F6', label: 'Cust', action: () => setIsCustomerModalOpen(true), icon: ICONS.user },
        { key: 'F9', label: 'Hist', action: () => setIsSalesHistoryModalOpen(true), icon: ICONS.clock },
        { key: 'F7', label: isFullScreen ? 'Exit' : 'Full', action: onToggleFullScreen, icon: isFullScreen ? ICONS.minimize : ICONS.maximize },
        { key: 'Alt+D', label: isDenseMode ? 'Normal' : 'Dense', action: () => setIsDenseMode(!isDenseMode), icon: ICONS.grid },
    ];

    return (
        <div className="bg-[#0a1628] dark:bg-[#020617] px-3 md:px-6 py-3 flex flex-wrap items-center justify-between gap-y-2 border-t border-slate-800/80 shadow-[0_-4px_24px_rgba(0,0,0,0.2)]">
            <div className="flex items-center gap-0.5 md:gap-1 flex-wrap min-w-0">
                {shortcuts.map((s) => (
                    <button
                        key={s.key}
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            s.action();
                        }}
                        className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-2 rounded-[8px] hover:bg-white/8 text-slate-300 transition-colors min-w-0"
                    >
                        <span className="text-slate-500 flex-shrink-0 hidden sm:block opacity-90">
                            {React.cloneElement(s.icon as React.ReactElement, { size: 16 })}
                        </span>
                        <span className="text-xs md:text-xs font-semibold text-white/95 uppercase tracking-wide truncate">{s.label}</span>
                        <span className="text-xs font-bold text-slate-500 tabular-nums">{s.key}</span>
                    </button>
                ))}
            </div>

            <div className="flex items-center gap-3 md:gap-5 flex-shrink-0 ml-auto">
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                    <div className={`w-2 h-2 rounded-full ${currentShift ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    <span className={`text-xs font-semibold tracking-wide max-w-[120px] truncate ${currentShift ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {terminalName}
                    </span>
                </div>

                <button
                    type="button"
                    onClick={() => {
                        if (balanceDue <= 0) {
                            completeSale();
                        } else {
                            setIsPaymentModalOpen(true);
                        }
                    }}
                    className="flex items-center gap-3 pl-4 pr-5 py-2.5 rounded-[10px] bg-[#0056b3] hover:bg-[#004494] text-white transition-all active:scale-[0.99] shadow-md shadow-[#0056b3]/30"
                >
                    <span className="text-slate-200/90 flex-shrink-0" aria-hidden>
                        {React.cloneElement(ICONS.dollarSign as React.ReactElement, { size: 18 })}
                    </span>
                    <div className="flex flex-col text-left leading-tight">
                        <span className="text-xs font-bold uppercase tracking-widest opacity-90">Finalize</span>
                        <span className="text-xs font-bold">F12</span>
                    </div>
                </button>
            </div>
        </div>
    );
};

export default ShortcutBar;
