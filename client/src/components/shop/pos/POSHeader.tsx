import React, { useState, useEffect, useCallback } from 'react';
import { usePOS } from '../../../context/POSContext';
import { useShifts } from '../../../context/ShiftsContext';
import { ICONS } from '../../../constants';
import { AppHeaderToolbar } from '../../AppHeader';

const POSHeader: React.FC = () => {
    const { branches, terminals } = usePOS();
    const { currentShift, startShift } = useShifts();
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

    const branchStationLine =
        currentShift && (locationName || stationName)
            ? [locationName ?? '—', stationName ?? '—'].filter(Boolean).join(' — ')
            : null;

    return (
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200/90 dark:border-slate-700 z-30 sticky top-0 flex-shrink-0 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
            <div className="py-2.5 md:py-3 flex flex-wrap items-center justify-between gap-3 md:gap-4 min-w-0">
                {/* Left: Branding & Status */}
                <div className="flex items-center gap-4 md:gap-6 min-w-0 flex-1">
                    <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                        <div className="w-9 h-9 md:w-10 md:h-10 rounded-[10px] flex items-center justify-center text-white shadow-md shadow-[#0056b3]/25 bg-[#0056b3]">
                            {React.cloneElement(ICONS.shoppingCart as React.ReactElement, { size: 20 })}
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-base md:text-lg font-bold text-[#0f172a] dark:text-slate-100 tracking-tight leading-none truncate">
                                MyShop <span className="text-[#0056b3] dark:text-blue-400">POS</span>
                            </h1>
                            {branchStationLine ? (
                                <div className="flex items-center gap-1.5 mt-1 min-w-0 text-slate-900 dark:text-slate-100">
                                    <span className="text-[#0056b3] dark:text-blue-400 flex-shrink-0" aria-hidden>
                                        {React.cloneElement(ICONS.building as React.ReactElement, { size: 14 })}
                                    </span>
                                    <span className="text-xs md:text-xs font-semibold truncate">{branchStationLine}</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 mt-0.5 md:mt-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                                    <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider truncate">
                                        Start shift to select branch
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="h-6 md:h-8 w-px bg-slate-200 dark:bg-slate-700 hidden lg:block flex-shrink-0" />

                    {/* Location & Station: from shift when active, or Start shift form when none */}
                    {currentShift ? (
                        <div className="hidden lg:flex items-center gap-3 xl:gap-6 min-w-0">
                            <div className="flex flex-col min-w-0">
                                <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5 pl-0.5">Location</span>
                                <div className="min-w-0 max-w-[160px] px-2 md:px-3 py-1 md:py-1.5 rounded-[8px] bg-[#eef2ff] dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-300 truncate block">{locationName ?? '—'}</span>
                                </div>
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5 pl-0.5">Station</span>
                                <div className="min-w-0 max-w-[140px] px-2 md:px-3 py-1 md:py-1.5 rounded-[8px] bg-[#eef2ff] dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-300 truncate block">{stationName ?? '—'}</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleStartShift} className="hidden md:flex items-end gap-2 xl:gap-3 flex-wrap min-w-0">
                            <div className="flex flex-col">
                                <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 pl-0.5">Location</label>
                                <select
                                    value={startForm.branchId}
                                    onChange={(e) => setStartForm((f) => ({ ...f, branchId: e.target.value, terminalId: '' }))}
                                    className="min-w-[140px] px-3 py-1.5 rounded-[8px] border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-[#0056b3]"
                                >
                                    <option value="">— Select —</option>
                                    {branches.map((b: any) => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex flex-col">
                                <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 pl-0.5">Station</label>
                                <select
                                    value={startForm.terminalId}
                                    onChange={(e) => setStartForm((f) => ({ ...f, terminalId: e.target.value }))}
                                    disabled={!startForm.branchId}
                                    className="min-w-[120px] px-3 py-1.5 rounded-[8px] border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-[#0056b3] disabled:opacity-50"
                                >
                                    <option value="">— Select —</option>
                                    {terminalsForBranch.map((t: any) => (
                                        <option key={t.id} value={t.id}>{t.name || t.code || t.id}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex flex-col">
                                <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 pl-0.5">Opening cash</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={startForm.openingCash}
                                    onChange={(e) => setStartForm((f) => ({ ...f, openingCash: e.target.value }))}
                                    className="w-24 px-3 py-1.5 rounded-[8px] border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-[#0056b3]"
                                    placeholder="0"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={starting || !startForm.terminalId}
                                className="px-4 py-1.5 rounded-[8px] bg-[#0056b3] text-white text-xs font-bold hover:bg-[#004494] disabled:opacity-50"
                            >
                                {starting ? 'Starting…' : 'Start shift'}
                            </button>
                            {startError && (
                                <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">{startError}</span>
                            )}
                        </form>
                    )}
                </div>

            {/* Right: Session time, F12 hint, then global shell actions (bell, theme, user) — same row as main app bar */}
            <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-shrink-0 min-w-0">
                <div className="hidden sm:flex items-center gap-2 md:gap-3">
                    <span
                        className="hidden md:inline text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 border border-dashed border-slate-300 dark:border-slate-600 rounded-[8px] px-2 py-1 text-slate-700 dark:text-slate-300"
                        title="Focus tender field"
                    >
                        F12 Final
                    </span>
                    <span className="text-slate-300 dark:text-slate-600 hidden md:block" aria-hidden>
                        {React.cloneElement(ICONS.clock as React.ReactElement, { size: 18, className: 'text-slate-400 dark:text-slate-500' })}
                    </span>
                </div>
                <div className="hidden lg:flex flex-col items-end flex-shrink-0">
                    <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Session time</span>
                    <div className="text-sm md:text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                        {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                    <div className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                        {currentTime.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
                    </div>
                </div>

                <div className="hidden sm:block h-8 w-px bg-slate-200 dark:bg-slate-700 flex-shrink-0" aria-hidden />

                <AppHeaderToolbar className="min-w-0" />
            </div>
        </div>
        </div>
    );
};

export default POSHeader;
