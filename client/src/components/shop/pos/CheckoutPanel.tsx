
import React, { useState } from 'react';
import { usePOS } from '../../../context/POSContext';
import { ICONS, CURRENCY } from '../../../constants';
import { POSPaymentMethod } from '../../../types/pos';
import { shopApi, ShopBankAccount } from '../../../services/shopApi';
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
        cart,
        holdSale,
        applyGlobalDiscount,
        completeSale,
        lastCompletedSale,
        setLastCompletedSale,
        printReceipt,
        posSettings,
        balanceDue,
        changeDue,
        addPayment,
        payments
    } = usePOS();

    const [isDiscountOpen, setIsDiscountOpen] = useState(false);
    const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);

    // Payment state
    const [tenderAmount, setTenderAmount] = useState('0');
    const [selectedMethod, setSelectedMethod] = useState<POSPaymentMethod>(POSPaymentMethod.CASH);
    const [bankAccounts, setBankAccounts] = useState<ShopBankAccount[]>([]);
    const [selectedBankId, setSelectedBankId] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);

    React.useEffect(() => {
        setTenderAmount(grandTotal.toString());
    }, [grandTotal]);

    React.useEffect(() => {
        const loadBanks = async () => {
            try {
                const list = await shopApi.getBankAccounts(true);
                setBankAccounts(Array.isArray(list) ? list : []);
                setSelectedBankId(prev => (list?.length && (!prev || !list.some((b: ShopBankAccount) => b.id === prev))) ? list[0].id : prev);
            } catch {
                setBankAccounts([]);
            }
        };
        loadBanks();
    }, []);

    const handleMethodSelect = (method: POSPaymentMethod) => {
        setSelectedMethod(method);
        if (method === POSPaymentMethod.CASH) {
            const cashBank = bankAccounts.find(b => b.account_type === 'Cash' || b.name.toLowerCase().includes('cash'));
            if (cashBank) setSelectedBankId(cashBank.id);
        } else {
            const firstOnline = bankAccounts.find(b => b.account_type !== 'Cash' && !b.name.toLowerCase().includes('cash'));
            if (firstOnline) setSelectedBankId(firstOnline.id);
            else setSelectedBankId('');
        }
    };

    const handleComplete = async () => {
        if (isProcessing) return;
        setIsProcessing(true);
        try {
            // First clear any previous payments and add the new complete payment
            // Actually context handles this through addPayment, let's just add payment if enough
            const amount = parseFloat(tenderAmount);
            if (amount < grandTotal) {
                alert('Tender amount is less than total');
                setIsProcessing(false);
                return;
            }

            // We simulate adding the payment and immediately completing
            const bank = bankAccounts.find(b => b.id === selectedBankId);
            const directPaymentObj = {
                id: crypto.randomUUID(),
                method: selectedMethod,
                amount,
                bankAccountId: bank?.id,
                bankAccountName: bank?.name
            };
            addPayment(selectedMethod, amount, undefined, bank ? { id: bank.id, name: bank.name } : undefined);

            const sale = await completeSale(directPaymentObj);

            // Check auto print
            const shouldAutoPrint = posSettings?.auto_print_receipt ?? true;
            if (!shouldAutoPrint) {
                // Not auto-printing, leave lastCompletedSale set so we can show buttons
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsProcessing(false);
        }
    };

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
                {/* Line items in customer summary (shows held/recalled items) */}
                {cart.length > 0 && (
                    <div className="mb-4 pb-4 border-b border-slate-100">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Items</div>
                        <div className="space-y-1.5 max-h-32 overflow-y-auto pos-scrollbar">
                            {cart.map((item) => (
                                <div key={item.id} className="flex justify-between items-center text-xs gap-2">
                                    <span className="text-slate-700 font-semibold truncate flex-1 min-w-0">{item.name}</span>
                                    <span className="text-slate-500 shrink-0">×{item.quantity}</span>
                                    <span className="font-mono font-semibold text-slate-900 shrink-0">{CURRENCY}{(item.unitPrice * item.quantity - item.discountAmount + item.taxAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
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

            {/* Transaction Controls or Post-Sale */
                lastCompletedSale ? (
                    <div className="p-6 bg-white border-t border-slate-100 space-y-4">
                        <div className="flex flex-col items-center justify-center p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-center mb-4">
                            <div className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center mb-2">
                                {ICONS.checkCircle}
                            </div>
                            <h3 className="text-lg font-bold text-emerald-700">Sale Complete</h3>
                            <p className="text-xs text-emerald-600">Change: {CURRENCY}{(lastCompletedSale.changeDue || 0).toLocaleString()}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => printReceipt(lastCompletedSale)}
                                className="py-4 flex items-center justify-center gap-2 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-all"
                            >
                                {ICONS.print} Print Receipt
                            </button>
                            <button
                                onClick={() => setLastCompletedSale(null)}
                                className="py-4 flex items-center justify-center gap-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all"
                            >
                                {ICONS.refresh} New Sale
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="p-6 bg-white border-t border-slate-100 space-y-4 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)] z-10 relative">
                        {cart.length > 0 ? (
                            <div className="space-y-4 animate-slide-up">
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleMethodSelect(POSPaymentMethod.CASH)}
                                        className={`flex-1 py-3 px-4 rounded-xl font-bold flex flex-col items-center gap-1 transition-all border-2 ${selectedMethod === POSPaymentMethod.CASH ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-100 text-slate-500 hover:bg-slate-50'}`}
                                    >
                                        {ICONS.dollarSign} CASH
                                    </button>
                                    <button
                                        onClick={() => handleMethodSelect(POSPaymentMethod.ONLINE)}
                                        className={`flex-1 py-3 px-4 rounded-xl font-bold flex flex-col items-center gap-1 transition-all border-2 ${selectedMethod === POSPaymentMethod.ONLINE ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-100 text-slate-500 hover:bg-slate-50'}`}
                                    >
                                        {ICONS.creditCard} ONLINE
                                    </button>
                                </div>

                                <div className="flex bg-slate-50 border-2 border-slate-100 rounded-xl overflow-hidden focus-within:border-blue-500 transition-colors">
                                    <span className="flex items-center justify-center px-4 font-bold text-slate-400 bg-white">
                                        {CURRENCY}
                                    </span>
                                    <input
                                        id="tender-amount-input"
                                        type="number"
                                        className="flex-1 py-3 px-2 bg-transparent text-xl font-black text-slate-900 outline-none"
                                        value={tenderAmount}
                                        onChange={e => setTenderAmount(e.target.value)}
                                        onFocus={e => e.target.select()}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                if (!isProcessing && parseFloat(tenderAmount) >= grandTotal) {
                                                    handleComplete();
                                                }
                                            }
                                        }}
                                    />
                                    <button onClick={() => setTenderAmount(grandTotal.toString())} className="px-4 text-xs font-bold text-blue-600 hover:bg-blue-50">
                                        EXACT
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    <button
                                        onClick={handleHold}
                                        className="py-4 flex flex-col items-center justify-center border-2 border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all"
                                    >
                                        <span className="text-[11px] font-bold text-slate-500 uppercase">Save / Hold</span>
                                    </button>
                                    <button
                                        disabled={isProcessing || parseFloat(tenderAmount) < grandTotal}
                                        onClick={handleComplete}
                                        className={`py-4 flex flex-col items-center justify-center rounded-xl transition-all font-black text-lg ${parseFloat(tenderAmount) >= grandTotal ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 hover:bg-blue-700' : 'bg-slate-200 text-slate-400'}`}
                                    >
                                        {isProcessing ? 'PROCESSING...' : 'COMPLETE SALE'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="py-4 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Cart is empty</span>
                            </div>
                        )}
                    </div>
                )
            }


            <CustomerSelectionModal
                isOpen={isCustomerModalOpen}
                onClose={() => setIsCustomerModalOpen(false)}
            />
        </div>
    );
};

export default CheckoutPanel;


