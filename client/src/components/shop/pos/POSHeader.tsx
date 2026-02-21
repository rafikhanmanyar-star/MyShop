import React, { useState, useEffect } from 'react';
import { usePOS } from '../../../context/POSContext';
import { ICONS } from '../../../constants';
import { useAuth } from '../../../context/AuthContext';

const POSHeader: React.FC = () => {
    const {
        branches,
        terminals,
        selectedBranchId,
        selectedTerminalId,
        setSelectedBranchId,
        setSelectedTerminalId
    } = usePOS();
    const { user } = useAuth();
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

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

                {/* Configuration Dropdowns */}
                <div className="hidden xl:flex items-center gap-6">
                    <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 pl-0.5">Location</span>
                        <div className="relative group/select">
                            <select
                                className="appearance-none bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-8 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500 transition-all cursor-pointer min-w-[140px]"
                                value={selectedBranchId || ''}
                                onChange={(e) => setSelectedBranchId(e.target.value)}
                            >
                                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-hover/select:text-blue-500 transition-colors">
                                {React.cloneElement(ICONS.chevronDown as React.ReactElement, { size: 12 })}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 pl-0.5">Station</span>
                        <div className="relative group/select">
                            <select
                                className="appearance-none bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-8 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500 transition-all cursor-pointer min-w-[120px]"
                                value={selectedTerminalId || ''}
                                onChange={(e) => setSelectedTerminalId(e.target.value)}
                            >
                                {terminals.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-hover/select:text-blue-500 transition-colors">
                                {React.cloneElement(ICONS.chevronDown as React.ReactElement, { size: 12 })}
                            </div>
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
