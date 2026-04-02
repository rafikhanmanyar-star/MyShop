import React, { useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { usePOS } from '../../../context/POSContext';
import { ICONS, CURRENCY } from '../../../constants';
import { POSPaymentMethod } from '../../../types/pos';
import { shopApi, ShopBankAccount } from '../../../services/shopApi';
import CustomerSelectionModal from './CustomerSelectionModal';
import type { CheckoutPanelHandle } from './usePosKeyboard';

const CheckoutPanel = forwardRef<CheckoutPanelHandle>(function CheckoutPanel(_, ref) {
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
        addPayment
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
        } else if (method === POSPaymentMethod.KHATA) {
            setSelectedBankId('');
            setTenderAmount(grandTotal.toString());
        } else {
            const firstOnline = bankAccounts.find(b => b.account_type !== 'Cash' && !b.name.toLowerCase().includes('cash'));
            if (firstOnline) setSelectedBankId(firstOnline.id);
            else setSelectedBankId('');
        }
    };

    const isKhata = selectedMethod === POSPaymentMethod.KHATA;
    const khataRequiresCustomer = isKhata && (!customer || customer.id === 'walk-in');

    const tenderNum = parseFloat(tenderAmount) || 0;
    const changeReturn =
        !isKhata && tenderNum > grandTotal ? Math.max(0, tenderNum - grandTotal) : 0;

    const handleComplete = useCallback(async () => {
        if (isProcessing) return;
        setIsProcessing(true);
        try {
            const amount = parseFloat(tenderAmount);
            if (amount < grandTotal) {
                alert('Tender amount is less than total');
                setIsProcessing(false);
                return;
            }

            if (selectedMethod === POSPaymentMethod.KHATA && (!customer || customer.id === 'walk-in')) {
                alert('Please select a customer for Khata / Credit sale.');
                setIsProcessing(false);
                return;
            }
            const bank = !isKhata ? bankAccounts.find(b => b.id === selectedBankId) : undefined;
            const directPaymentObj = {
                id: crypto.randomUUID(),
                method: selectedMethod,
                amount: isKhata ? grandTotal : amount,
                bankAccountId: bank?.id,
                bankAccountName: bank?.name
            };
            addPayment(selectedMethod, isKhata ? grandTotal : amount, undefined, bank ? { id: bank.id, name: bank.name } : undefined);

            await completeSale(directPaymentObj);

            const shouldAutoPrint = posSettings?.auto_print_receipt ?? true;
            if (!shouldAutoPrint) {
                /* leave lastCompletedSale for reprint */
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsProcessing(false);
        }
    }, [
        isProcessing,
        tenderAmount,
        grandTotal,
        selectedMethod,
        isKhata,
        customer,
        bankAccounts,
        selectedBankId,
        addPayment,
        completeSale,
        posSettings,
    ]);

    useImperativeHandle(
        ref,
        () => ({
            tryComplete: () => {
                void handleComplete();
            },
            focusPayment: () => {
                document.getElementById('tender-amount-input')?.focus();
            },
            openDiscount: () => {
                setIsDiscountOpen(true);
            },
        }),
        [handleComplete]
    );

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
        <div id="pos-payment-panel" className="relative flex h-full min-h-0 flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
            {/* Customer Information Area */}
            <div className="p-4 md:p-5 border-b border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Customer</h3>
                    {customer && (
                        <button
                            onClick={() => setCustomer(null)}
                            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                        >
                            Change
                        </button>
                    )}
                </div>

                {customer ? (
                    <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-3 rounded-[10px] border border-slate-200/90 dark:border-slate-700 shadow-sm transition-all">
                        <div className="w-11 h-11 rounded-[8px] bg-[#0056b3] dark:bg-slate-700 flex items-center justify-center text-white font-bold text-lg shrink-0">
                            {customer.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{customer.name}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">{customer.phone}</div>
                        </div>
                        <div className="text-right flex flex-col items-end gap-1 shrink-0">
                            <div className="inline-block px-1.5 py-0.5 bg-[#eef2ff] dark:bg-blue-900/40 text-[#0056b3] dark:text-blue-400 text-xs font-bold rounded uppercase tracking-wider">
                                {customer.tier}
                            </div>
                            <div className="text-xs font-bold text-slate-400 dark:text-slate-500">{customer.points} <span className="opacity-60">PTS</span></div>
                        </div>
                    </div>
                ) : (
                    <button
                        type="button"
                        className="w-full flex items-center justify-between px-3 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-[10px] text-slate-600 dark:text-slate-400 hover:border-[#0056b3]/40 hover:bg-[#eef2ff]/30 dark:hover:bg-blue-950/30 transition-all group shadow-sm"
                        onClick={() => setIsCustomerModalOpen(true)}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-[8px] bg-[#eef2ff] dark:bg-slate-700 flex items-center justify-center text-[#0056b3] dark:text-slate-300 shrink-0">
                                {React.cloneElement(ICONS.user as React.ReactElement, { size: 18 })}
                            </div>
                            <div className="text-left min-w-0">
                                <span className="text-xs font-bold block text-slate-900 dark:text-slate-100">Walk-in customer</span>
                                <span className="text-xs font-medium text-slate-500">Tap to select (F6)</span>
                            </div>
                        </div>
                        <div className="text-slate-400 group-hover:text-[#0056b3] transition-colors shrink-0">
                            {React.cloneElement(ICONS.edit as React.ReactElement, { size: 16 })}
                        </div>
                    </button>
                )}
            </div>

            {/* Bill Summary Section */}
            <div className="flex-1 p-4 md:p-5 space-y-4 overflow-y-auto pos-scrollbar bg-[#f8fafc] dark:bg-slate-800/20">
                {/* Line items in customer summary (shows held/recalled items) */}
                {cart.length > 0 && (
                    <div className="mb-4 pb-4 border-b border-slate-100 dark:border-slate-700">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Items</div>
                        <div className="space-y-1.5 max-h-32 overflow-y-auto pos-scrollbar">
                            {cart.map((item) => (
                                <div key={item.id} className="flex justify-between items-center text-xs gap-2">
                                    <span className="text-slate-700 dark:text-slate-300 font-semibold truncate flex-1 min-w-0">{item.name}</span>
                                    <span className="text-slate-500 dark:text-slate-400 shrink-0">×{item.quantity}</span>
                                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 shrink-0">{CURRENCY}{(item.unitPrice * item.quantity - item.discountAmount + item.taxAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <div className="space-y-3">
                    <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                        <span className="text-xs font-medium">Subtotal</span>
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-mono">{CURRENCY}{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center group">
                            <button
                                className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-2 transition-colors"
                                onClick={() => setIsDiscountOpen(!isDiscountOpen)}
                            >
                                Discount Applied
                                <span className={`text-xs transition-transform duration-300 ${isDiscountOpen ? 'rotate-180' : ''}`}>{ICONS.chevronDown}</span>
                            </button>
                            <span className="text-sm font-semibold text-rose-500 dark:text-rose-400 font-mono">-{CURRENCY}{discountTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>

                        {isDiscountOpen && (
                            <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-100 dark:border-slate-700 animate-slide-up shadow-sm">
                                <div className="grid grid-cols-4 gap-2">
                                    {[0, 5, 10, 20].map(pct => (
                                        <button
                                            key={pct}
                                            onClick={() => applyGlobalDiscount(pct)}
                                            className={`py-1.5 rounded-md text-xs font-bold transition-all ${discountTotal > 0 && Math.round(discountTotal / (subtotal || 1) * 100) === pct ? 'bg-[#0056b3] text-white' : 'bg-slate-50 dark:bg-slate-700 border border-slate-100 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'}`}
                                        >
                                            {pct}%
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between items-center text-slate-500 dark:text-slate-400 pb-4 border-b border-slate-100 dark:border-slate-700">
                        <span className="text-xs font-medium">Tax/VAT (10%)</span>
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-mono">+{CURRENCY}{taxTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                </div>

                <div className="pt-1">
                    <div className="flex flex-col bg-white dark:bg-slate-800 p-4 rounded-[10px] border border-slate-200/90 dark:border-slate-700 shadow-sm">
                        <span className="text-xs font-bold uppercase tracking-widest text-[#0056b3] dark:text-blue-400 mb-1">Payable amount</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-lg font-bold text-slate-400 dark:text-slate-500">{CURRENCY}</span>
                            <div className="text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight tabular-nums leading-none">
                                {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Transaction Controls or Post-Sale */
                lastCompletedSale ? (
                    <div className="p-5 bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-700 space-y-4">
                        <div className="flex flex-col items-center justify-center p-4 bg-[#bbf7d0]/40 dark:bg-emerald-950/40 rounded-[10px] border border-emerald-200/80 dark:border-emerald-800 text-center mb-2">
                            <div className="w-12 h-12 bg-emerald-600 text-white rounded-full flex items-center justify-center mb-2">
                                {ICONS.checkCircle}
                            </div>
                            <h3 className="text-lg font-bold text-emerald-800 dark:text-emerald-400">Sale complete</h3>
                            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-400 mt-1">Change: {CURRENCY}{(lastCompletedSale.changeDue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => printReceipt(lastCompletedSale)}
                                className="py-3.5 flex items-center justify-center gap-2 bg-slate-800 dark:bg-slate-700 text-white font-bold rounded-[10px] hover:bg-slate-700 dark:hover:bg-slate-600 transition-all text-sm"
                            >
                                {ICONS.print} Print receipt
                            </button>
                            <button
                                type="button"
                                onClick={() => setLastCompletedSale(null)}
                                className="py-3.5 flex items-center justify-center gap-2 bg-[#0056b3] text-white font-bold rounded-[10px] hover:bg-[#004494] transition-all text-sm"
                            >
                                {ICONS.refresh} New sale
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="p-4 md:p-5 bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-700 space-y-4 shadow-[0_-8px_32px_-12px_rgba(0,86,179,0.08)] dark:shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.3)] z-10 relative">
                        {cart.length > 0 ? (
                            <div className="space-y-4 animate-slide-up">
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleMethodSelect(POSPaymentMethod.CASH)}
                                        className={`flex-1 py-2.5 px-2 rounded-[10px] font-bold flex flex-col items-center gap-0.5 transition-all border-2 text-xs ${selectedMethod === POSPaymentMethod.CASH ? 'border-[#0056b3] bg-[#0056b3] text-white shadow-sm' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 hover:border-slate-300'}`}
                                    >
                                        {ICONS.dollarSign} CASH
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleMethodSelect(POSPaymentMethod.ONLINE)}
                                        className={`flex-1 py-2.5 px-2 rounded-[10px] font-bold flex flex-col items-center gap-0.5 transition-all border-2 text-xs ${selectedMethod === POSPaymentMethod.ONLINE ? 'border-[#0056b3] bg-[#eef2ff] dark:bg-blue-950/50 text-[#0056b3] dark:text-blue-400' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 hover:border-slate-300'}`}
                                    >
                                        {ICONS.creditCard} ONLINE
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleMethodSelect(POSPaymentMethod.KHATA)}
                                        className={`flex-1 py-2.5 px-2 rounded-[10px] font-bold flex flex-col items-center gap-0.5 transition-all border-2 text-xs ${selectedMethod === POSPaymentMethod.KHATA ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-400' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 hover:border-slate-300'}`}
                                        title="Customer required"
                                    >
                                        {ICONS.user} KHATA
                                    </button>
                                </div>
                                {isKhata && (
                                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-[8px] px-3 py-2">
                                        Customer required for Khata. Select a customer above to complete.
                                    </p>
                                )}

                                <div>
                                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5">Amount received</p>
                                    <div className="flex bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-[10px] overflow-hidden focus-within:border-[#0056b3] transition-colors shadow-sm">
                                        <span className="flex items-center justify-center px-3 font-bold text-slate-500 dark:text-slate-400 text-sm bg-slate-50 dark:bg-slate-800/80">
                                            {CURRENCY}
                                        </span>
                                        <input
                                            id="tender-amount-input"
                                            type="number"
                                            aria-label="Amount tendered"
                                            className="flex-1 py-3.5 px-2 bg-transparent text-2xl font-bold text-slate-900 dark:text-slate-100 outline-none select-text"
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
                                        <button
                                            type="button"
                                            onClick={() => setTenderAmount(grandTotal.toString())}
                                            className="px-3 text-xs font-bold text-[#0056b3] dark:text-blue-400 hover:bg-[#eef2ff] dark:hover:bg-blue-950/40 uppercase"
                                        >
                                            Exact
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-4 gap-2 mt-3">
                                        {[100, 500, 1000, 5000].map((note) => {
                                            const active = String(tenderAmount) === String(note) || tenderNum === note;
                                            return (
                                            <button
                                                key={note}
                                                type="button"
                                                onClick={() => setTenderAmount(String(note))}
                                                className={`py-2.5 rounded-[8px] font-bold text-xs border-2 transition-all ${active ? 'border-[#0056b3] bg-[#0056b3] text-white' : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-[#0056b3]/40'}`}
                                            >
                                                {note}
                                            </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {changeReturn > 0 && !isKhata && (
                                    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-[10px] bg-[#bbf7d0] dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-800">
                                        <div>
                                            <span className="text-xs font-bold uppercase tracking-widest text-emerald-900 dark:text-emerald-300">Change return</span>
                                            <div className="text-lg font-bold text-emerald-900 dark:text-emerald-200 tabular-nums">
                                                {CURRENCY}{changeReturn.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </div>
                                        </div>
                                        <span className="text-emerald-700 dark:text-emerald-400 opacity-80" aria-hidden>
                                            {React.cloneElement(ICONS.refresh as React.ReactElement, { size: 20 })}
                                        </span>
                                    </div>
                                )}

                                <button
                                    type="button"
                                    id="pos-complete-sale-btn"
                                    disabled={isProcessing || (!isKhata && parseFloat(tenderAmount) < grandTotal) || khataRequiresCustomer}
                                    onClick={handleComplete}
                                    className={`flex w-full items-center justify-center gap-2 rounded-lg py-4 text-base font-bold transition-all ${!isProcessing && ((isKhata && !khataRequiresCustomer) || parseFloat(tenderAmount) >= grandTotal) ? 'bg-primary-600 text-white shadow-md shadow-primary-900/20 hover:bg-primary-700' : 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'}`}
                                >
                                    {React.cloneElement(ICONS.check as React.ReactElement, { size: 22 })}
                                    {isProcessing ? 'Processing…' : khataRequiresCustomer ? 'Select customer' : 'Complete sale'}
                                </button>

                                <button
                                    type="button"
                                    onClick={handleHold}
                                    className="w-full py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-[#0056b3] transition-colors"
                                >
                                    Hold sale (Ctrl+H)
                                </button>
                            </div>
                        ) : (
                            <div className="py-6 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-[10px] bg-slate-50/50 dark:bg-slate-800/30">
                                <span className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Cart is empty</span>
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
});

export default CheckoutPanel;


