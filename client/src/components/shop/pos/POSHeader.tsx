import React, { useState, useEffect } from 'react';
import { usePOS } from '../../../context/POSContext';
import { useShifts } from '../../../context/ShiftsContext';
import { ICONS } from '../../../constants';
import { useAuth } from '../../../context/AuthContext';

const POSHeader: React.FC = () => {
    const { branches, terminals } = usePOS();
    const { currentShift } = useShifts();
    const { user } = useAuth();
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Static location and station from current shift (not selectable)
    const shiftTerminal = currentShift ? terminals.find((t: any) => t.id === currentShift.terminal_id) : null;
    const shiftBranchId = shiftTerminal?.branch_id ?? shiftTerminal?.branchId ?? null;
    const locationName = shiftBranchId ? (branches.find((b: any) => b.id === shiftBranchId)?.name ?? '—') : null;
    const stationName = shiftTerminal?.name ?? null;

    return (
        <div className="bg-white border-b border-slate-200 px-6 lg:px-8 py-3 flex items-center justify-between z-30 sticky top-0 shadow-sm">
            {/* Left: Branding & Status */}
            <div className="flex items-center gap-8">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                        {React.cloneElement(ICONS.shoppingCart as React.ReactElement, { size: 20 })}
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-none uppercase">MyShop <span className="text-blue-600">POS</span></h1>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Terminal Online</span>
                        </div>
                    </div>
                </div>

                <div className="h-8 w-px bg-slate-200 hidden xl:block"></div>

                {/* Static Location & Station (tied to cashier's shift — not editable) */}
                <div className="hidden xl:flex items-center gap-6">
                    <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 pl-0.5">Location</span>
                        <div className="min-w-[140px] px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
                            <span className="text-xs font-semibold text-slate-700">
                                {currentShift ? (locationName ?? '—') : '— Start shift in Dashboard —'}
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 pl-0.5">Station</span>
                        <div className="min-w-[120px] px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
                            <span className="text-xs font-semibold text-slate-700">
                                {currentShift ? (stationName ?? '—') : '— Start shift in Dashboard —'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right: User & Time */}
            <div className="flex items-center gap-8">
                <div className="hidden lg:flex flex-col items-end">
                    <div className="text-sm font-bold text-slate-900 tabular-nums">
                        {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                        {currentTime.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
                    </div>
                </div>

                <div className="flex items-center gap-4 pl-8 border-l border-slate-200">
                    <div className="flex flex-col items-end">
                        <span className="text-sm font-bold text-slate-900 leading-tight truncate max-w-[120px]">{user?.name || 'Cashier Admin'}</span>
                        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mt-0.5">
                            {user?.role?.replace('_', ' ') || 'Manager'}
                        </span>
                    </div>
                    <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden">
                            <span className="text-sm font-bold text-slate-600">{user?.name?.charAt(0) || 'A'}</span>
                        </div>
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></div>
                    </div>
                </div>
            </div>
        </div>
    );
};


export default POSHeader;
