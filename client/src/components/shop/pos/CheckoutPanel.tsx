import React, { useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { usePOS } from '../../../context/POSContext';
import { ICONS, CURRENCY } from '../../../constants';
import { POSPaymentMethod } from '../../../types/pos';
import { isApiConnectivityFailure, userMessageForApiError } from '../../../utils/apiConnectivity';
import { showAppToast } from '../../../utils/appToast';
import { usePayFromAccounts } from '../../../hooks/usePayFromAccounts';
import {
    formatPayFromAccountLabel,
    payFromAccountsForPosMethod,
    pickDefaultPayFromAccountId,
    resolvePayFromAccountForPos,
} from '../../../utils/payFromAccounts';
import CustomerSelectionModal from './CustomerSelectionModal';
import type { CheckoutPanelHandle } from './usePosKeyboard';
import { BadgeCheck } from 'lucide-react';

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
    const [selectedChartAccountId, setSelectedChartAccountId] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const { payFromAccounts, loading: payFromLoading, reload: reloadPayFrom } = usePayFromAccounts();

    React.useEffect(() => {
        setTenderAmount(grandTotal.toString());
    }, [grandTotal]);

    React.useEffect(() => {
        if (!isDiscountOpen) return;
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') return;
            const map: Record<string, number> = { '0': 0, '5': 5, '1': 10, '2': 20 };
            if (e.key in map) {
                e.preventDefault();
                applyGlobalDiscount(map[e.key]);
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [isDiscountOpen, applyGlobalDiscount]);

    const accountsForMethod = React.useCallback(
        (method: POSPaymentMethod) => payFromAccountsForPosMethod(payFromAccounts, method),
        [payFromAccounts]
    );

    const resolvedReceiveAccount = React.useMemo(
        () => resolvePayFromAccountForPos(payFromAccounts, selectedMethod, selectedChartAccountId),
        [payFromAccounts, selectedMethod, selectedChartAccountId]
    );

    React.useEffect(() => {
        if (payFromAccounts.length === 0) return;
        const resolved = resolvePayFromAccountForPos(payFromAccounts, selectedMethod, selectedChartAccountId);
        if (resolved && resolved.id !== selectedChartAccountId) {
            setSelectedChartAccountId(resolved.id);
        }
    }, [payFromAccounts, selectedMethod, selectedChartAccountId]);

    const handleMethodSelect = (method: POSPaymentMethod) => {
        setSelectedMethod(method);
        if (method === POSPaymentMethod.KHATA) {
            setSelectedChartAccountId('');
            setTenderAmount(grandTotal.toString());
        } else {
            setSelectedChartAccountId(pickDefaultPayFromAccountId(accountsForMethod(method)));
        }
    };

    const isKhata = selectedMethod === POSPaymentMethod.KHATA;
    const khataRequiresCustomer = isKhata && (!customer || customer.id === 'walk-in');
    const needsReceiveAccount = !isKhata;
    const canCompletePayment = !needsReceiveAccount || Boolean(resolvedReceiveAccount);

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
            let acc = !isKhata ? resolvedReceiveAccount : undefined;
            if (!isKhata && !acc) {
                const fresh = payFromAccounts.length > 0 ? payFromAccounts : await reloadPayFrom();
                acc = resolvePayFromAccountForPos(fresh, selectedMethod, selectedChartAccountId);
                if (acc) setSelectedChartAccountId(acc.id);
            }
            if (!isKhata && !acc) {
                alert(
                    payFromAccounts.length === 0 && !payFromLoading
                        ? 'No cash or bank account is set up. Add Asset accounts in Settings → Chart of Accounts, then try again.'
                        : 'Payment accounts are still loading. Wait a moment and try again.'
                );
                setIsProcessing(false);
                return;
            }
            const directPaymentObj = {
                id: crypto.randomUUID(),
                method: selectedMethod,
                amount: isKhata ? grandTotal : amount,
                chartAccountId: acc?.id,
                chartAccountName: acc?.name,
            };
            addPayment(
                selectedMethod,
                isKhata ? grandTotal : amount,
                undefined,
                acc ? { chartAccountId: acc.id, name: acc.name } : undefined
            );

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
        payFromAccounts,
        payFromLoading,
        reloadPayFrom,
        resolvedReceiveAccount,
        selectedChartAccountId,
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
                const tender = document.getElementById('tender-amount-input') as HTMLInputElement | null;
                if (tender && !tender.disabled) {
                    tender.focus();
                } else {
                    document.getElementById('pos-checkout-panel')?.focus();
                }
            },
            openDiscount: () => {
                setIsDiscountOpen(true);
            },
            toggleDiscount: () => {
                setIsDiscountOpen((v) => !v);
            },
            applyDiscountPercent: (pct: number) => {
                applyGlobalDiscount(pct);
                setIsDiscountOpen(true);
            },
            selectPaymentMethod: (key: 'cash' | 'online' | 'khata') => {
                const map = {
                    cash: POSPaymentMethod.CASH,
                    online: POSPaymentMethod.ONLINE,
                    khata: POSPaymentMethod.KHATA,
                } as const;
                handleMethodSelect(map[key]);
            },
            setExactTender: () => {
                setTenderAmount(grandTotal.toString());
            },
            openCustomer: () => {
                setIsCustomerModalOpen(true);
            },
            focusCheckout: () => {
                document.getElementById('pos-checkout-panel')?.focus();
            },
        }),
        [handleComplete, applyGlobalDiscount, grandTotal, handleMethodSelect]
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

    const lineTotal = (item: (typeof cart)[0]) =>
        item.unitPrice * item.quantity - item.discountAmount + item.taxAmount;

    const paymentBtnClass = (active: boolean, variant: 'cash' | 'online' | 'khata') => {
        const base =
            'pos-payment-pill flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-all touch-manipulation';
        if (!active) {
            return `${base} border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300`;
        }
        if (variant === 'khata') {
            return `${base} border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300`;
        }
        if (variant === 'online') {
            return `${base} border-[#0056b3] bg-[#eef2ff] text-[#0056b3] dark:bg-blue-950/50 dark:text-blue-300`;
        }
        return `${base} border-[#0056b3] bg-[#0056b3] text-white shadow-sm`;
    };

    return (
        <div
            id="pos-checkout-panel"
            tabIndex={-1}
            data-discount-open={isDiscountOpen ? 'true' : 'false'}
            className="relative flex h-full min-h-0 flex-col overflow-hidden bg-gray-50 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/25 dark:bg-gray-900"
        >
            <div id="pos-payment-panel" className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            {/* Customer — compact strip */}
            <div className="shrink-0 border-b border-slate-200/80 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex min-w-0 items-center gap-2">
                    {customer ? (
                        <>
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#0056b3] text-xs font-bold text-white dark:bg-slate-600">
                                {customer.name.charAt(0)}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-1 truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                                    {customer.mobileCustomerVerified && (
                                        <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Verified" />
                                    )}
                                    <span className="truncate">{customer.name}</span>
                                </div>
                                <div className="truncate text-[10px] font-medium text-slate-500">{customer.phone}</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setCustomer(null)}
                                className="shrink-0 text-[10px] font-bold text-blue-600 dark:text-blue-400"
                            >
                                Change
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left transition-colors hover:border-[#0056b3]/40 dark:border-slate-600 dark:bg-slate-800"
                            onClick={() => setIsCustomerModalOpen(true)}
                        >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#eef2ff] text-[#0056b3] dark:bg-slate-700 dark:text-slate-300">
                                {React.cloneElement(ICONS.user as React.ReactElement, { size: 14 })}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800 dark:text-slate-100">
                                Walk-in · F8
                            </span>
                            {React.cloneElement(ICONS.edit as React.ReactElement, { size: 14, className: 'shrink-0 text-slate-400' })}
                        </button>
                    )}
                </div>
            </div>

            {/* Receipt / bill — scrollable lines + sticky totals */}
            <div className="pos-checkout-bill flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#f8fafc] dark:bg-slate-800/30">
                <div className="min-h-0 flex-1 overflow-y-auto pos-scrollbar px-2 py-2">
                    {cart.length === 0 ? (
                        <div className="flex h-full min-h-[80px] flex-col items-center justify-center py-6 text-center">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Bill is empty</span>
                            <span className="mt-1 text-[10px] text-slate-400">Add items from catalog</span>
                        </div>
                    ) : (
                        <>
                            <div
                                className="pos-bill-line-grid mb-1 grid gap-x-1 text-[9px] font-bold uppercase tracking-wider text-slate-400"
                                aria-hidden
                            >
                                <span>Item</span>
                                <span className="text-center">Qty</span>
                                <span className="text-right">Amt</span>
                            </div>
                            <ul className="space-y-0.5" role="list">
                                {cart.map((item) => (
                                    <li
                                        key={item.id}
                                        className="pos-bill-line-grid grid gap-x-1 border-b border-slate-100/80 py-1 text-[11px] last:border-0 dark:border-slate-700/60"
                                    >
                                        <span className="min-w-0 truncate font-semibold text-slate-800 dark:text-slate-200">
                                            {item.name}
                                        </span>
                                        <span className="text-center tabular-nums text-slate-500">×{item.quantity}</span>
                                        <span className="text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                                            {lineTotal(item).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>

                <div
                    className="shrink-0 border-t border-slate-200/90 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-900"
                    aria-live="polite"
                    aria-atomic="true"
                >
                    <div className="space-y-1 text-[11px]">
                        <div className="flex justify-between text-slate-500">
                            <span>Subtotal</span>
                            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                                {CURRENCY}{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                        <div className="flex justify-between items-center gap-1">
                            <button
                                id="pos-discount-toggle"
                                type="button"
                                className="flex min-w-0 items-center gap-1 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400"
                                onClick={() => setIsDiscountOpen(!isDiscountOpen)}
                            >
                                <span className="truncate">Discount</span>
                                <kbd className="kbd-tag shrink-0 text-[9px]">F5</kbd>
                                <span className={`shrink-0 ${isDiscountOpen ? 'rotate-180' : ''}`}>
                                    {React.cloneElement(ICONS.chevronDown as React.ReactElement, { size: 12 })}
                                </span>
                            </button>
                            <span className="shrink-0 font-mono font-semibold text-rose-500">
                                -{CURRENCY}{discountTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                        {isDiscountOpen && (
                            <div className="grid grid-cols-4 gap-1 rounded-md border border-slate-100 bg-slate-50 p-1.5 dark:border-slate-700 dark:bg-slate-800">
                                {[0, 5, 10, 20].map((pct) => (
                                    <button
                                        key={pct}
                                        type="button"
                                        onClick={() => applyGlobalDiscount(pct)}
                                        className={`rounded py-1 text-[10px] font-bold ${
                                            discountTotal > 0 && Math.round((discountTotal / (subtotal || 1)) * 100) === pct
                                                ? 'bg-[#0056b3] text-white'
                                                : 'border border-slate-200 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                        }`}
                                    >
                                        {pct}%
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="flex justify-between text-slate-500">
                            <span>Tax</span>
                            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                                +{CURRENCY}{taxTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>
                    <div className="pos-checkout-grand-total mt-2 flex items-baseline justify-between gap-2 border-t border-dashed border-slate-200 pt-2 dark:border-slate-600">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#0056b3] dark:text-blue-400">
                            Total due
                        </span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xs font-bold text-slate-500">{CURRENCY}</span>
                            <span className="font-mono text-xl font-extrabold tabular-nums text-slate-900 dark:text-white">
                                {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Payment & finalize */}
            {lastCompletedSale ? (
                    <div className="shrink-0 space-y-2 border-t border-slate-200/80 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                        <div className="rounded-lg border border-emerald-200/80 bg-[#bbf7d0]/40 p-3 text-center dark:border-emerald-800 dark:bg-emerald-950/40">
                            <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-400">Sale complete</h3>
                            <p className="mt-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-400">
                                Change: {CURRENCY}{(lastCompletedSale.changeDue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => printReceipt(lastCompletedSale)}
                                className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-800 py-2 text-xs font-bold text-white dark:bg-slate-700"
                            >
                                {React.cloneElement(ICONS.print as React.ReactElement, { size: 14 })}
                                Print
                            </button>
                            <button
                                type="button"
                                onClick={() => setLastCompletedSale(null)}
                                className="flex items-center justify-center gap-1.5 rounded-lg bg-[#0056b3] py-2 text-xs font-bold text-white"
                            >
                                {React.cloneElement(ICONS.refresh as React.ReactElement, { size: 14 })}
                                New sale
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="relative z-10 shrink-0 space-y-2 border-t border-slate-200/80 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                        {cart.length > 0 ? (
                            <div className="animate-slide-up space-y-2">
                                <div>
                                    <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                                        Payment <span className="font-normal normal-case text-slate-400">Ctrl+1–3 · 1–3 here</span>
                                    </p>
                                    <div className="flex gap-1" role="group" aria-label="Payment method">
                                        <button
                                            type="button"
                                            id="pos-pay-cash"
                                            aria-pressed={selectedMethod === POSPaymentMethod.CASH}
                                            onClick={() => handleMethodSelect(POSPaymentMethod.CASH)}
                                            className={paymentBtnClass(selectedMethod === POSPaymentMethod.CASH, 'cash')}
                                            title="Cash (Ctrl+1)"
                                        >
                                            {React.cloneElement(ICONS.dollarSign as React.ReactElement, { size: 12 })}
                                            <span>Cash</span>
                                        </button>
                                        <button
                                            type="button"
                                            id="pos-pay-online"
                                            aria-pressed={selectedMethod === POSPaymentMethod.ONLINE}
                                            onClick={() => handleMethodSelect(POSPaymentMethod.ONLINE)}
                                            className={paymentBtnClass(selectedMethod === POSPaymentMethod.ONLINE, 'online')}
                                            title="Online (Ctrl+2)"
                                        >
                                            {React.cloneElement(ICONS.creditCard as React.ReactElement, { size: 12 })}
                                            <span>Online</span>
                                        </button>
                                        <button
                                            type="button"
                                            id="pos-pay-khata"
                                            aria-pressed={selectedMethod === POSPaymentMethod.KHATA}
                                            onClick={() => handleMethodSelect(POSPaymentMethod.KHATA)}
                                            className={paymentBtnClass(selectedMethod === POSPaymentMethod.KHATA, 'khata')}
                                            title="Khata (Ctrl+3)"
                                        >
                                            {React.cloneElement(ICONS.user as React.ReactElement, { size: 12 })}
                                            <span>Khata</span>
                                        </button>
                                    </div>
                                </div>
                                {isKhata && khataRequiresCustomer && (
                                    <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                                        Select a customer for Khata (F8)
                                    </p>
                                )}

                                {!isKhata && payFromLoading && payFromAccounts.length === 0 && (
                                    <p className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-400">
                                        Loading payment accounts…
                                    </p>
                                )}
                                {!isKhata && !payFromLoading && payFromAccounts.length === 0 && (
                                    <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                                        Set up cash or bank accounts in Settings → Chart of Accounts.
                                    </p>
                                )}
                                {!isKhata && payFromAccounts.length > 0 && (
                                    <div>
                                        <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                                            {selectedMethod === POSPaymentMethod.CASH ? 'Cash account' : 'Receive into'}
                                        </p>
                                        <select
                                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                                            value={selectedChartAccountId}
                                            onChange={(e) => setSelectedChartAccountId(e.target.value)}
                                            aria-label={
                                                selectedMethod === POSPaymentMethod.CASH
                                                    ? 'Cash account from chart of accounts'
                                                    : 'Online payment account from chart of accounts'
                                            }
                                        >
                                            <option value="">Select account…</option>
                                            {accountsForMethod(selectedMethod).map((acc) => (
                                                <option key={acc.id} value={acc.id}>
                                                    {formatPayFromAccountLabel(acc)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {!isKhata && (
                                    <div>
                                        <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">Received</p>
                                        <div className="flex overflow-hidden rounded-md border border-slate-200 bg-white focus-within:border-[#0056b3] dark:border-slate-600 dark:bg-slate-800">
                                            <span className="flex items-center bg-slate-50 px-2 text-xs font-bold text-slate-500 dark:bg-slate-800/80">
                                                {CURRENCY}
                                            </span>
                                            <input
                                                id="tender-amount-input"
                                                type="number"
                                                aria-label="Amount tendered"
                                                className="min-w-0 flex-1 bg-transparent px-2 py-2 text-lg font-bold text-slate-900 outline-none select-text dark:text-slate-100"
                                                value={tenderAmount}
                                                onChange={(e) => setTenderAmount(e.target.value)}
                                                onFocus={(e) => e.target.select()}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && !isProcessing && parseFloat(tenderAmount) >= grandTotal) {
                                                        handleComplete();
                                                    }
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setTenderAmount(grandTotal.toString())}
                                                className="px-2 text-[10px] font-bold uppercase text-[#0056b3] dark:text-blue-400"
                                                title="Exact (E)"
                                            >
                                                Exact
                                            </button>
                                        </div>
                                        <div className="mt-1 grid grid-cols-4 gap-1">
                                            {[100, 500, 1000, 5000].map((note) => {
                                                const active = String(tenderAmount) === String(note) || tenderNum === note;
                                                return (
                                                    <button
                                                        key={note}
                                                        type="button"
                                                        onClick={() => setTenderAmount(String(note))}
                                                        className={`rounded py-1 text-[10px] font-bold border ${
                                                            active
                                                                ? 'border-[#0056b3] bg-[#0056b3] text-white'
                                                                : 'border-slate-200 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                                        }`}
                                                    >
                                                        {note}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {changeReturn > 0 && !isKhata && (
                                    <div className="flex items-center justify-between rounded-md border border-emerald-200/80 bg-[#bbf7d0]/50 px-2 py-1.5 dark:border-emerald-800 dark:bg-emerald-950/40">
                                        <span className="text-[10px] font-bold uppercase text-emerald-900 dark:text-emerald-300">Change</span>
                                        <span className="font-mono text-sm font-bold tabular-nums text-emerald-900 dark:text-emerald-200">
                                            {CURRENCY}{changeReturn.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                )}

                                <button
                                    type="button"
                                    id="pos-complete-sale-btn"
                                    disabled={
                                        isProcessing ||
                                        (!isKhata && parseFloat(tenderAmount) < grandTotal) ||
                                        khataRequiresCustomer ||
                                        (needsReceiveAccount && (!canCompletePayment || payFromLoading))
                                    }
                                    onClick={handleComplete}
                                    className={`flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-bold transition-all ${
                                        !isProcessing && ((isKhata && !khataRequiresCustomer) || parseFloat(tenderAmount) >= grandTotal)
                                            ? 'bg-primary-600 text-white shadow-md hover:bg-primary-700'
                                            : 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
                                    }`}
                                >
                                    {React.cloneElement(ICONS.check as React.ReactElement, { size: 18 })}
                                    {isProcessing
                                        ? 'Processing…'
                                        : khataRequiresCustomer
                                          ? 'Select customer'
                                          : needsReceiveAccount && payFromLoading && !resolvedReceiveAccount
                                            ? 'Loading accounts…'
                                            : needsReceiveAccount && !resolvedReceiveAccount
                                              ? 'No payment account'
                                              : 'Complete · F12'}
                                </button>
                            </div>
                        ) : null}
                    </div>
            )}

            <CustomerSelectionModal
                isOpen={isCustomerModalOpen}
                onClose={() => setIsCustomerModalOpen(false)}
            />
            </div>
        </div>
    );
});

export default CheckoutPanel;


