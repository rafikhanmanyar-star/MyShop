
import React, { useState } from 'react';
import { usePOS } from '../../../context/POSContext';
import { ICONS, CURRENCY } from '../../../constants';
import Button from '../../ui/Button';
import CustomerSelectionModal from './CustomerSelectionModal';

const CheckoutPanel: React.FC = () => {
    const {
        subtotal,
        taxTotal,
        discountTotal,
        grandTotal,
        customer,
        setCustomer,
        setIsPaymentModalOpen,
        cart,
        holdSale,
        applyGlobalDiscount
    } = usePOS();

    const [isDiscountOpen, setIsDiscountOpen] = useState(false);
    const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);

    const handleHold = () => {
        if (cart.length === 0) return;
        const reference = `HOLD-${Date.now().toString().slice(-6)}`;
        holdSale(reference);
    };

    const handleProforma = () => {
        if (cart.length === 0) return;
        alert("Proforma Invoice generated (Simulated)");
    };

    return (
        <div className="flex flex-col h-full bg-white relative">
            {/* Customer Information Area */}
            <div className="p-6 border-b border-slate-100">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer Details</h3>
                    {customer && (
                        <button
                            onClick={() => setCustomer(null)}
                            className="text-[11px] font-bold text-blue-600 hover:text-blue-700 transition-colors"
                        >
                            Change
                        </button>
                    )}
                </div>

                {customer ? (
                    <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 transition-all">
                        <div className="w-12 h-12 rounded-lg bg-slate-900 flex items-center justify-center text-white font-bold text-lg">
                            {customer.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-slate-900 truncate uppercase">{customer.name}</div>
                            <div className="text-[11px] text-slate-500 font-medium mt-0.5">{customer.phone}</div>
                        </div>
                        <div className="text-right">
                            <div className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[9px] font-bold rounded uppercase tracking-wider">
                                {customer.tier}
                            </div>
                            <div className="text-[10px] font-bold text-slate-400 mt-1">{customer.points} <span className="opacity-60">PTS</span></div>
                        </div>
                    </div>
                ) : (
                    <button
                        className="w-full flex items-center justify-between px-4 py-4 bg-slate-50 border border-slate-200 border-dashed rounded-xl text-slate-500 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50/30 transition-all group"
                        onClick={() => setIsCustomerModalOpen(true)}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg border border-slate-200 flex items-center justify-center group-hover:bg-white transition-all text-slate-400 group-hover:text-blue-600">
                                {React.cloneElement(ICONS.plus as React.ReactElement, { size: 18 })}
                            </div>
                            <div className="text-left">
                                <span className="text-sm font-bold block">Walk-in Customer</span>
                                <span className="text-[11px] font-medium opacity-60">Add customer profile (F6)</span>
                            </div>
                        </div>
                        <div className="text-slate-300 group-hover:text-blue-400 transition-transform group-hover:translate-x-1">
                            {React.cloneElement(ICONS.chevronRight as React.ReactElement, { size: 16 })}
                        </div>
                    </button>
                )}
            </div>

            {/* Bill Summary Section */}
            <div className="flex-1 p-6 space-y-4 overflow-y-auto pos-scrollbar bg-slate-50/20">
                <div className="space-y-3">
                    <div className="flex justify-between items-center text-slate-500">
                        <span className="text-xs font-medium">Subtotal</span>
                        <span className="text-sm font-semibold text-slate-900 font-mono">{CURRENCY}{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center group">
                            <button
                                className="text-xs font-medium text-slate-500 hover:text-blue-600 flex items-center gap-2 transition-colors"
                                onClick={() => setIsDiscountOpen(!isDiscountOpen)}
                            >
                                Discount Applied
                                <span className={`text-[10px] transition-transform duration-300 ${isDiscountOpen ? 'rotate-180' : ''}`}>{ICONS.chevronDown}</span>
                            </button>
                            <span className="text-sm font-semibold text-rose-500 font-mono">-{CURRENCY}{discountTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>

                        {isDiscountOpen && (
                            <div className="bg-white p-3 rounded-lg border border-slate-100 animate-slide-up shadow-sm">
                                <div className="grid grid-cols-4 gap-2">
                                    {[0, 5, 10, 20].map(pct => (
                                        <button
                                            key={pct}
                                            onClick={() => applyGlobalDiscount(pct)}
                                            className={`py-1.5 rounded-md text-[10px] font-bold transition-all ${discountTotal > 0 && Math.round(discountTotal / (subtotal || 1) * 100) === pct ? 'bg-blue-600 text-white' : 'bg-slate-50 border border-slate-100 text-slate-600 hover:bg-slate-100'}`}
                                        >
                                            {pct}%
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between items-center text-slate-500 pb-4 border-b border-slate-100">
                        <span className="text-xs font-medium">Tax/VAT (10%)</span>
                        <span className="text-sm font-semibold text-slate-900 font-mono">+{CURRENCY}{taxTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                </div>

                <div className="pt-2">
                    <div className="flex flex-col bg-white p-5 rounded-2xl border border-blue-50 shadow-sm shadow-blue-500/5">
                        <span className="text-[11px] font-bold uppercase tracking-widest text-blue-600 mb-1">Payable Amount</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-xl font-bold text-slate-400">{CURRENCY}</span>
                            <div className="text-[42px] font-black text-slate-900 tracking-tighter tabular-nums">
                                {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Transaction Controls */}
            <div className="p-6 bg-white border-t border-slate-100 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={handleHold}
                        className="py-3 flex flex-col items-center justify-center border border-slate-200 rounded-xl hover:bg-slate-50 transition-all active:scale-[0.98]"
                    >
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-1">Save to List</span>
                        <span className="text-[11px] font-bold text-slate-700 uppercase">Hold (F2)</span>
                    </button>
                    <button
                        onClick={handleProforma}
                        className="py-3 flex flex-col items-center justify-center border border-slate-200 rounded-xl hover:bg-slate-50 transition-all active:scale-[0.98]"
                    >
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-1">Print Draft</span>
                        <span className="text-[11px] font-bold text-slate-700 uppercase">Proforma</span>
                    </button>
                </div>

                <button
                    disabled={cart.length === 0}
                    onClick={() => setIsPaymentModalOpen(true)}
                    className={`w-full py-6 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all active:scale-[0.98] shadow-lg shadow-blue-500/20 ${cart.length === 0
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                >
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">Finalize Sale</span>
                    <span className="text-xl font-black tracking-tight flex items-center gap-3">
                        COLLECT CASH
                        <kbd className="px-2 py-0.5 bg-white/20 border border-white/20 rounded text-[10px] font-bold text-white uppercase">F12</kbd>
                    </span>
                </button>
            </div>


            <CustomerSelectionModal
                isOpen={isCustomerModalOpen}
                onClose={() => setIsCustomerModalOpen(false)}
            />
        </div>
    );
};

export default CheckoutPanel;


