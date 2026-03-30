import React, { useState, useEffect, useCallback } from 'react';
import { usePOS } from '../../../context/POSContext';
import { useShifts } from '../../../context/ShiftsContext';
import { ICONS } from '../../../constants';
import { useAuth } from '../../../context/AuthContext';

const POSHeader: React.FC = () => {
    const { branches, terminals } = usePOS();
    const { currentShift, startShift } = useShifts();
    const { user } = useAuth();
    const [currentTime, setCurrentTime] = useState(new Date());
    const [startForm, setStartForm] = useState({ branchId: '', terminalId: '', openingCash: '0' });
    const [starting, setStarting] = useState(false);
    const [startError, setStartError] = useState<string | null>(null);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Auto-set single branch and terminal when available so admin/terminal are set without going to Dashboard
    useEffect(() => {
        if (currentShift || !branches?.length || !terminals?.length) return;
        const singleBranch = branches.length === 1 ? branches[0] : null;
        const singleTerminal = terminals.length === 1 ? terminals[0] : null;
        setStartForm((prev) => {
            let branchId = prev.branchId;
            let terminalId = prev.terminalId;
            if (singleTerminal) {
                terminalId = singleTerminal.id;
                branchId = branchId || (singleTerminal.branch_id ?? singleTerminal.branchId ?? '');
            }
            if (singleBranch && !branchId) branchId = singleBranch.id;
            if (branchId && !terminalId) {
                const firstAtBranch = terminals.find((t: any) => (t.branch_id ?? t.branchId) === branchId);
                if (firstAtBranch) terminalId = firstAtBranch.id;
            }
            return { ...prev, branchId: branchId || '', terminalId: terminalId || '' };
        });
    }, [branches, terminals, currentShift]);

    const terminalsForBranch = startForm.branchId
        ? terminals.filter((t: any) => String(t.branch_id ?? t.branchId ?? '') === String(startForm.branchId))
        : [];

    const handleStartShift = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        const terminalId = startForm.terminalId.trim();
        const openingCash = parseFloat(startForm.openingCash);
        if (!terminalId || isNaN(openingCash) || openingCash < 0) {
            setStartError('Select terminal and enter opening cash (0 or more).');
            return;
        }
        setStartError(null);
        setStarting(true);
        try {
            await startShift(terminalId, openingCash);
        } catch (err: any) {
            setStartError(err?.message || err?.error || 'Failed to start shift');
        } finally {
            setStarting(false);
        }
    }, [startForm.terminalId, startForm.openingCash, startShift]);

    // Static location and station from current shift (not selectable)
    const shiftTerminal = currentShift ? terminals.find((t: any) => t.id === currentShift.terminal_id) : null;
    const shiftBranchId = shiftTerminal?.branch_id ?? shiftTerminal?.branchId ?? null;
    const locationName = shiftBranchId ? (branches.find((b: any) => b.id === shiftBranchId)?.name ?? '—') : null;
    const stationName = shiftTerminal?.name ?? null;

    return (
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 z-30 sticky top-0 shadow-sm flex-shrink-0">
            <div className="px-4 md:px-6 lg:px-8 py-2.5 md:py-3 flex items-center justify-between gap-4 min-w-0">
                {/* Left: Branding & Status */}
                <div className="flex items-center gap-4 md:gap-6 min-w-0 flex-1">
                    <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                        <div className="w-9 h-9 md:w-10 md:h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                            {React.cloneElement(ICONS.shoppingCart as React.ReactElement, { size: 20 })}
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-base md:text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-none uppercase truncate">MyShop <span className="text-blue-600 dark:text-blue-400">POS</span></h1>
                            <div className="flex items-center gap-2 mt-0.5 md:mt-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></span>
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider truncate">Terminal Online</span>
                            </div>
                        </div>
                    </div>

                    <div className="h-6 md:h-8 w-px bg-slate-200 dark:bg-slate-700 hidden lg:block flex-shrink-0"></div>

                    {/* Location & Station: from shift when active, or Start shift form when none */}
                    {currentShift ? (
                        <div className="hidden lg:flex items-center gap-3 xl:gap-6 min-w-0">
                            <div className="flex flex-col min-w-0">
                                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5 pl-0.5">Location</span>
                                <div className="min-w-0 max-w-[140px] px-2 md:px-3 py-1 md:py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate block">{locationName ?? '—'}</span>
                                </div>
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5 pl-0.5">Station</span>
                                <div className="min-w-0 max-w-[120px] px-2 md:px-3 py-1 md:py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate block">{stationName ?? '—'}</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleStartShift} className="hidden md:flex items-end gap-2 xl:gap-3 flex-wrap min-w-0">
                            <div className="flex flex-col">
                                <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 pl-0.5">Location</label>
                                <select
                                    value={startForm.branchId}
                                    onChange={(e) => setStartForm((f) => ({ ...f, branchId: e.target.value, terminalId: '' }))}
                                    className="min-w-[140px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">— Select —</option>
                                    {branches.map((b: any) => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex flex-col">
                                <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 pl-0.5">Station</label>
                                <select
                                    value={startForm.terminalId}
                                    onChange={(e) => setStartForm((f) => ({ ...f, terminalId: e.target.value }))}
                                    disabled={!startForm.branchId}
                                    className="min-w-[120px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                                >
                                    <option value="">— Select —</option>
                                    {terminalsForBranch.map((t: any) => (
                                        <option key={t.id} value={t.id}>{t.name || t.code || t.id}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex flex-col">
                                <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 pl-0.5">Opening cash</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={startForm.openingCash}
                                    onChange={(e) => setStartForm((f) => ({ ...f, openingCash: e.target.value }))}
                                    className="w-24 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500"
                                    placeholder="0"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={starting || !startForm.terminalId}
                                className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
                            >
                                {starting ? 'Starting…' : 'Start shift'}
                            </button>
                            {startError && (
                                <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">{startError}</span>
                            )}
                        </form>
                    )}
                </div>

            {/* Right: User & Time */}
            <div className="flex items-center gap-3 md:gap-6 flex-shrink-0 min-w-0">
                <div className="hidden lg:flex flex-col items-end flex-shrink-0">
                    <div className="text-xs md:text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                        {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                    <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                        {currentTime.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
                    </div>
                </div>

                <div className="flex items-center gap-2 md:gap-4 pl-4 md:pl-6 border-l border-slate-200 dark:border-slate-700 min-w-0">
                    <div className="flex flex-col items-end min-w-0">
                        <span className="text-xs md:text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight truncate max-w-[100px] md:max-w-[120px]">{user?.name || 'Cashier Admin'}</span>
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mt-0.5 truncate">
                            {user?.role?.replace('_', ' ') || 'Manager'}
                        </span>
                    </div>
                    <div className="relative flex-shrink-0">
                        <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden">
                            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{user?.name?.charAt(0) || 'A'}</span>
                        </div>
                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 md:w-3 md:h-3 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"></div>
                    </div>
                </div>
            </div>
        </div>
        </div>
    );
};

export default POSHeader;
