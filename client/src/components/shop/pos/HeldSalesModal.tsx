import React, { useState, useEffect } from 'react';
import Modal from '../../ui/Modal';
import { usePOS } from '../../../context/POSContext';
import { ICONS, CURRENCY } from '../../../constants';

const HeldSalesModal: React.FC = () => {
    const {
        isHeldSalesModalOpen,
        setIsHeldSalesModalOpen,
        heldSales,
        recallSale
    } = usePOS();

    const [selectedIdx, setSelectedIdx] = useState(0);

    useEffect(() => {
        if (!isHeldSalesModalOpen) return;
        setSelectedIdx(0);
    }, [isHeldSalesModalOpen, heldSales.length]);

    useEffect(() => {
        if (!isHeldSalesModalOpen || heldSales.length === 0) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIdx((i) => Math.min(i + 1, heldSales.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const sale = heldSales[selectedIdx];
                if (sale) {
                    recallSale(sale.id);
                    setIsHeldSalesModalOpen(false);
                }
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [isHeldSalesModalOpen, heldSales, selectedIdx, recallSale, setIsHeldSalesModalOpen]);

    if (!isHeldSalesModalOpen) return null;

    return (
        <Modal
            isOpen={isHeldSalesModalOpen}
            onClose={() => setIsHeldSalesModalOpen(false)}
            title={<div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl pos-gradient-dark flex items-center justify-center text-white shadow-none">
                    {ICONS.refresh}
                </div>
                <div>
                    <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 leading-none tracking-tight">Suspended Orders</h2>
                    <div className="flex items-center gap-2 mt-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest leading-none">Temporary Storage Vault</span>
                    </div>
                </div>
            </div>}
            size="lg"
        >
            <div className="space-y-6">
                {heldSales.length === 0 ? (
                    <div className="py-24 text-center animate-scale-in">
                        <div className="w-24 h-24 bg-[#f8fafc] dark:bg-slate-800 text-slate-200 dark:text-slate-600 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-none">
                            {React.cloneElement(ICONS.archive as React.ReactElement, { size: 40, className: "opacity-20" })}
                        </div>
                        <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 uppercase">Vault is Empty</h3>
                        <p className="text-slate-500 dark:text-slate-400 font-bold text-sm mt-3 max-w-xs mx-auto leading-relaxed">Active transactions can be suspended with <kbd className="kbd-tag mx-1">Ctrl+H</kbd> and recalled with <kbd className="kbd-tag mx-1">F4</kbd>.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-5 max-h-[60vh] overflow-y-auto pr-3 pos-scrollbar pb-6">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">↑↓ select · Enter recall · Esc close</p>
                        {heldSales.map((sale, idx) => (
                            <div
                                key={sale.id}
                                className={`flex items-center justify-between p-6 bg-white dark:bg-slate-800 border rounded-[2.5rem] transition-all group animate-slide-up ${idx === selectedIdx ? 'border-indigo-500 ring-2 ring-indigo-500/25 dark:border-indigo-500' : 'border-slate-100 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-700'}`}
                            >
                                <div className="flex items-center gap-6">
                                    <div className="w-16 h-16 bg-[#f8fafc] dark:bg-slate-700 rounded-2xl flex items-center justify-center text-slate-300 dark:text-slate-500 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-none">
                                        {ICONS.shoppingCart}
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-4 mb-2">
                                            <span className="font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-tight text-lg leading-none">
                                                {sale.reference || 'NAMED TRANSACTION'}
                                            </span>
                                            <span className="px-3 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl text-xs font-semibold uppercase tracking-widest border border-amber-100/50 dark:border-amber-800/50">
                                                {new Date(sale.heldAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-[0.3em] flex items-center gap-4">
                                            <span className="flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full"></span>
                                                {sale.cart.length} LINE ITEMS
                                            </span>
                                            <span className="text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 bg-indigo-200 dark:bg-indigo-600 rounded-full"></span>
                                                {CURRENCY} {sale.total.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        recallSale(sale.id);
                                        setIsHeldSalesModalOpen(false);
                                    }}
                                    className="px-8 py-4 pos-gradient-primary text-white rounded-2xl text-xs font-semibold uppercase tracking-[0.25em] transition-all shadow-none active:scale-95 flex items-center gap-3"
                                >
                                    {ICONS.refresh}
                                    RECALL
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default HeldSalesModal;

