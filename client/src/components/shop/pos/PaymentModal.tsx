import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../../ui/Modal';
import { usePOS } from '../../../context/POSContext';
import { POSPaymentMethod } from '../../../types/pos';
import { ICONS, CURRENCY } from '../../../constants';
import { shopApi, ShopBankAccount } from '../../../services/shopApi';

const PaymentModal: React.FC = () => {
    const {
        isPaymentModalOpen,
        setIsPaymentModalOpen,
        grandTotal,
        balanceDue,
        changeDue,
        addPayment,
        payments,
        removePayment,
        completeSale,
        printReceipt,
        lastCompletedSale,
        setLastCompletedSale
    } = usePOS();

    const [tenderAmount, setTenderAmount] = useState('0');
    const [selectedMethod, setSelectedMethod] = useState<POSPaymentMethod>(POSPaymentMethod.CASH);
    const [bankAccounts, setBankAccounts] = useState<ShopBankAccount[]>([]);
    const [selectedBankId, setSelectedBankId] = useState<string>('');

    const loadBanks = useCallback(async () => {
        try {
            const list = await shopApi.getBankAccounts(true);
            setBankAccounts(Array.isArray(list) ? list : []);
            setSelectedBankId(prev => (list?.length && (!prev || !list.some((b: ShopBankAccount) => b.id === prev))) ? list[0].id : prev);
        } catch {
            setBankAccounts([]);
        }
    }, []);

    useEffect(() => {
        if (isPaymentModalOpen) loadBanks();
    }, [isPaymentModalOpen, loadBanks]);

    useEffect(() => {
        if (isPaymentModalOpen) {
            setTenderAmount(balanceDue.toString());
        }
    }, [isPaymentModalOpen, balanceDue]);

    const handleAddPayment = async () => {
        const amount = parseFloat(tenderAmount);
        if (amount > 0) {
            const bank = bankAccounts.find(b => b.id === selectedBankId);
            addPayment(selectedMethod, amount, undefined, bank ? { id: bank.id, name: bank.name } : undefined);
            setTenderAmount('0');
        }
    };

    const handleQuickAmount = (amt: number) => {
        setTenderAmount(amt.toString());
    };

    if (!isPaymentModalOpen) return null;

    return (
        <Modal
            isOpen={isPaymentModalOpen}
            onClose={() => {
                if (!lastCompletedSale) setIsPaymentModalOpen(false);
            }}
            title={<div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl pos-gradient-dark flex items-center justify-center text-white shadow-none">
                    {ICONS.creditCard}
                </div>
                <div>
                    <h2 className="text-2xl font-black text-slate-900 leading-none tracking-tight">Checkout Terminal</h2>
                    <div className="flex items-center gap-2 mt-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Secure Transaction Session</span>
                    </div>
                </div>
            </div>}
            size="xl"
            hideClose={!!lastCompletedSale}
            disableScroll={true}
        >
            <div className="flex flex-col lg:flex-row gap-6 items-stretch h-full overflow-hidden p-4 sm:p-6">
                {/* Left Side: Method Selection & Tendering */}
                <div className="flex-1 space-y-6 overflow-y-auto pr-2 pos-scrollbar pb-6 contents-compact">
                    {!lastCompletedSale ? (
                        <>
                            <div>
                                <h3 className="text-[10px] font-black uppercase text-slate-400 mb-3 tracking-[0.25em] flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 text-[10px]">1</span>
                                    Payment Mode
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    {Object.values(POSPaymentMethod).map(method => (
                                        <button
                                            key={method}
                                            onClick={() => {
                                                setSelectedMethod(method);
                                                if (method === POSPaymentMethod.CASH) {
                                                    const cashBank = bankAccounts.find(b => b.account_type === 'Cash' || b.name.toLowerCase().includes('cash'));
                                                    if (cashBank) setSelectedBankId(cashBank.id);
                                                } else {
                                                    const firstOnline = bankAccounts.find(b => b.account_type !== 'Cash' && !b.name.toLowerCase().includes('cash'));
                                                    if (firstOnline) setSelectedBankId(firstOnline.id);
                                                    else setSelectedBankId('');
                                                }
                                            }}
                                            className={`flex flex-col items-center justify-center p-8 rounded-3xl border-2 transition-all relative group overflow-hidden ${selectedMethod === method
                                                ? 'border-indigo-600 bg-indigo-50 shadow-sm'
                                                : 'border-slate-50 bg-white text-slate-500 hover:border-slate-200 hover:bg-slate-50'
                                                }`}
                                        >
                                            <div className={`mb-3 transition-transform group-hover:scale-110 ${selectedMethod === method ? 'text-indigo-600' : 'text-slate-300'}`}>
                                                {method === POSPaymentMethod.CASH ? ICONS.dollarSign : ICONS.creditCard}
                                            </div>
                                            <span className="text-xs font-black uppercase tracking-widest leading-none">{method}</span>
                                            {selectedMethod === method && (
                                                <div className="absolute top-4 right-4 w-3 h-3 bg-indigo-600 rounded-full animate-pulse"></div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <h3 className="text-[11px] font-black uppercase text-slate-400 mb-3 tracking-[0.25em] flex items-center gap-3">
                                    <span className="w-5 h-5 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 text-[10px]">2</span>
                                    Banking Source
                                </h3>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-600">
                                        {ICONS.briefcase}
                                    </div>
                                    <select
                                        className="block w-full rounded-[1.25rem] border-2 border-slate-50 bg-[#f8fafc] pl-14 pr-6 py-3 text-sm font-black text-slate-800 transition-all outline-none focus:bg-white focus:border-indigo-500 focus:ring-8 focus:ring-indigo-500/5 appearance-none"
                                        value={selectedBankId}
                                        onChange={e => setSelectedBankId(e.target.value)}
                                        disabled={selectedMethod === POSPaymentMethod.CASH && bankAccounts.some(b => b.account_type === 'Cash' || b.name.toLowerCase().includes('cash'))}
                                    >
                                        <option value="">{selectedMethod === POSPaymentMethod.CASH ? 'Primary Cash Account' : 'Choose Online Account'}</option>
                                        {bankAccounts
                                            .filter(b => selectedMethod === POSPaymentMethod.CASH ? (b.account_type === 'Cash' || b.name.toLowerCase().includes('cash')) : (b.account_type !== 'Cash' && !b.name.toLowerCase().includes('cash')))
                                            .map(b => (
                                                <option key={b.id} value={b.id}>{b.name}{b.code ? ` — ${b.code}` : ''}</option>
                                            ))}
                                    </select>
                                    <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300">
                                        {ICONS.chevronDown}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-[#f8fafc] rounded-[2rem] p-6 border border-slate-50 relative overflow-hidden group shadow-none">
                                <div className="absolute -top-4 -right-4 p-12 opacity-[0.03] text-slate-900 group-hover:scale-110 group-hover:-rotate-12 transition-all duration-1000">
                                    {React.cloneElement(ICONS.shoppingCart as React.ReactElement, { size: 160 })}
                                </div>
                                <label className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-400 mb-4 block leading-none">Amount to Tender</label>
                                <div className="flex items-center gap-6 relative z-10">
                                    <span className="text-5xl font-black text-slate-300 font-mono tracking-tighter">{CURRENCY}</span>
                                    <input
                                        type="text"
                                        className="bg-transparent border-none text-5xl font-black text-slate-900 focus:ring-0 w-full p-0 font-mono tracking-[-0.05em] select-all"
                                        value={tenderAmount}
                                        onChange={(e) => setTenderAmount(e.target.value)}
                                        autoFocus
                                    />
                                </div>

                                <div className="grid grid-cols-4 gap-4 mt-10 relative z-10">
                                    {[100, 500, 1000, 5000].map(amt => (
                                        <button
                                            key={amt}
                                            onClick={() => handleQuickAmount(amt)}
                                            className="group relative py-4 rounded-2xl bg-white border border-slate-100 text-sm font-black text-slate-900 shadow-none hover:border-indigo-500 hover:text-indigo-600 transition-all overflow-hidden"
                                        >
                                            <div className="absolute inset-0 bg-indigo-600 scale-0 group-hover:scale-100 opacity-0 group-hover:opacity-[0.03] transition-transform"></div>
                                            +{amt}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={handleAddPayment}
                                disabled={parseFloat(tenderAmount) <= 0}
                                className="w-full py-5 pos-gradient-dark hover:opacity-95 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-[1.5rem] font-black text-xl transition-all shadow-none shadow-none-200 uppercase tracking-[0.2em] relative overflow-hidden group"
                            >
                                <div className="absolute inset-x-0 h-px top-0 bg-white/20"></div>
                                <span className="relative z-10 flex items-center justify-center gap-4">
                                    ADD AMOUNT
                                    <kbd className="kbd-tag !bg-white/10 !border-white/10 !text-white !px-3 font-mono opacity-60">F12</kbd>
                                </span>
                            </button>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full py-20 text-center animate-scale-in">
                            <div className="w-32 h-32 pos-gradient-success text-white rounded-[2.5rem] flex items-center justify-center mb-10 relative shadow-none shadow-none-500/20">
                                <div className="absolute inset-0 bg-emerald-500 rounded-[2.5rem] animate-ping opacity-10"></div>
                                {React.cloneElement(ICONS.checkCircle as React.ReactElement, { size: 64 })}
                            </div>
                            <h2 className="text-4xl font-black text-slate-900 tracking-[-0.04em] mb-4 uppercase">Success</h2>
                            <p className="text-slate-500 font-bold mb-14 max-w-sm text-lg leading-relaxed">The transaction has been successfully authorized and recorded.</p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
                                <button
                                    onClick={() => printReceipt()}
                                    className="flex items-center justify-center gap-4 py-6 pos-gradient-primary text-white rounded-3xl font-black uppercase tracking-widest transition-all shadow-none shadow-none-500/20 active:scale-[0.97]"
                                >
                                    {ICONS.print}
                                    PRINT SLIP
                                </button>
                                <button
                                    onClick={() => {
                                        setIsPaymentModalOpen(false);
                                        setLastCompletedSale(null);
                                    }}
                                    className="flex items-center justify-center gap-4 py-6 bg-slate-100 text-slate-900 hover:bg-slate-200 rounded-3xl font-black uppercase tracking-widest transition-all shadow-none active:scale-[0.97]"
                                >
                                    {ICONS.refresh}
                                    NEW ORDER
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Side: Order Summary Audit */}
                <div className="w-full lg:w-[360px] bg-[#f8fafc] rounded-[2.5rem] border border-slate-100 p-6 flex flex-col shadow-none relative">
                    <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-indigo-500/5 to-transparent rounded-t-[3rem] pointer-events-none"></div>

                    <div className="space-y-4 mb-auto overflow-y-auto pos-scrollbar relative z-10">
                        <div className="border-b-2 border-slate-200 border-dashed pb-4 px-2 flex flex-col gap-3">
                            <div className="flex flex-col">
                                <span className="text-[11px] font-black uppercase text-slate-400 tracking-[0.4em]">Audit Summary</span>
                                <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-1">Sale Reference: #{Math.random().toString(36).substring(7).toUpperCase()}</span>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-xl font-black text-slate-300 font-mono tracking-tighter">{CURRENCY}</span>
                                <span className="text-4xl font-black text-slate-900 font-mono tracking-[-0.05em]">{grandTotal.toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="space-y-5">
                            <h4 className="text-[11px] font-black uppercase text-slate-400 px-2 tracking-[0.3em]">Captured Funds</h4>
                            {payments.length === 0 ? (
                                <div className="py-12 rounded-[2rem] border-2 border-slate-200 border-dashed flex flex-col items-center justify-center text-slate-300 bg-white/50">
                                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-4 shadow-none border border-slate-100">
                                        {React.cloneElement(ICONS.creditCard as React.ReactElement, { size: 24 })}
                                    </div>
                                    <span className="text-[11px] uppercase font-black tracking-widest">Waiting...</span>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {payments.map(p => (
                                        <div key={p.id} className="flex justify-between items-center bg-white p-5 rounded-3xl border border-slate-50 shadow-none group animate-slide-up">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black text-slate-900 uppercase tracking-wider mb-1">{p.method}</span>
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter flex items-center gap-1.5">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-200"></span>
                                                    {p.bankAccountName || 'PRIMARY TILL'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-5">
                                                <span className="text-lg font-black font-mono text-slate-900 tracking-tighter">{p.amount.toLocaleString()}</span>
                                                {!lastCompletedSale && (
                                                    <button
                                                        onClick={() => removePayment(p.id)}
                                                        className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-300 hover:text-white hover:bg-rose-500 transition-all opacity-0 group-hover:opacity-100"
                                                    >
                                                        {ICONS.x}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-6 space-y-4 relative z-10">
                        <div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-none shadow-none-200/50 space-y-6">
                            <div className="flex justify-between items-center">
                                <span className="text-[11px] font-black uppercase text-slate-400 tracking-[0.25em]">Balance</span>
                                <span className={`text-3xl font-black font-mono tracking-tighter ${balanceDue > 0 ? 'text-rose-600' : 'text-emerald-500'}`}>
                                    {balanceDue.toLocaleString()}
                                </span>
                            </div>

                            {changeDue > 0 && (
                                <div className="pt-6 border-t-2 border-slate-50 border-dashed">
                                    <div className="flex flex-col items-center justify-center p-4 bg-emerald-50 rounded-[1.5rem] border border-emerald-100">
                                        <span className="text-[10px] font-black uppercase text-emerald-600 tracking-[0.3em] mb-2">Refund Amount</span>
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm font-black text-emerald-300 font-mono">{CURRENCY}</span>
                                            <span className="text-4xl font-black font-mono text-emerald-600 tracking-tighter">
                                                {changeDue.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {parseFloat(tenderAmount) > balanceDue && balanceDue > 0 && (
                                <div className="pt-6 border-t-2 border-slate-50 border-dashed animate-pulse">
                                    <div className="flex flex-col items-center justify-center p-4 bg-amber-50 rounded-[1.5rem] border border-amber-100">
                                        <span className="text-[10px] font-black uppercase text-amber-600 tracking-[0.3em] mb-2">Projected Refund</span>
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm font-black text-amber-300 font-mono">{CURRENCY}</span>
                                            <span className="text-4xl font-black font-mono text-amber-600 tracking-tighter">
                                                {(parseFloat(tenderAmount) - balanceDue).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {!lastCompletedSale && (
                            <button
                                disabled={balanceDue > 0}
                                onClick={async () => {
                                    try {
                                        const sale = await completeSale();
                                        setTimeout(() => printReceipt(sale), 500);
                                    } catch (e) {
                                        console.error("Sale failed", e);
                                    }
                                }}
                                className={`w-full py-5 rounded-[2rem] font-black text-xl transition-all active:scale-[0.97] flex items-center justify-center gap-4 relative overflow-hidden group shadow-none ${balanceDue > 0
                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                                    : 'pos-gradient-success text-white shadow-none-500/20 hover:shadow-none-500/40'
                                    }`}
                            >
                                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
                                <span className="relative z-10 flex items-center justify-center gap-4 leading-none uppercase tracking-[0.1em]">
                                    {ICONS.checkCircle}
                                    PAY & PRINT
                                </span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default PaymentModal;

