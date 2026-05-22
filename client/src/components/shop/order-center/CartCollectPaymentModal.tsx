import React, { useEffect, useState } from 'react';
import { Banknote, BookOpen, Wallet, X } from 'lucide-react';
import { shopApi } from '../../../services/shopApi';
import { orderCenterApi } from '../../../services/orderCenterApi';

interface Props {
    open: boolean;
    orderId: string;
    orderNumber: string;
    grandTotal: number;
    customerName?: string;
    onClose: () => void;
    onSuccess: () => void;
}

export function CartCollectPaymentModal({
    open,
    orderId,
    orderNumber,
    grandTotal,
    customerName,
    onClose,
    onSuccess,
}: Props) {
    const [bankAccounts, setBankAccounts] = useState<{ id: string; name: string; account_type?: string }[]>([]);
    const [selectedBank, setSelectedBank] = useState('');
    const [paymentType, setPaymentType] = useState<'bank' | 'khata'>('bank');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return;
        shopApi.getBankAccounts().then(setBankAccounts).catch(() => setBankAccounts([]));
        setSelectedBank('');
        setPaymentType('bank');
    }, [open]);

    if (!open) return null;

    const submit = async () => {
        setLoading(true);
        try {
            if (paymentType === 'khata') {
                await orderCenterApi.collectCartPayment(orderId, { paymentType: 'khata' });
            } else {
                if (!selectedBank) {
                    alert('Select a bank account');
                    return;
                }
                await orderCenterApi.collectCartPayment(orderId, { bankAccountId: selectedBank, paymentType: 'bank' });
            }
            onSuccess();
            onClose();
        } catch (err: unknown) {
            const e = err as { error?: string; message?: string };
            alert(e.error || e.message || 'Payment collection failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
            <div
                className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                        <Banknote className="text-orange-600" size={20} />
                        <div>
                            <h3 className="font-bold">Collect payment</h3>
                            <p className="text-xs text-muted-foreground">{orderNumber}</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-4 space-y-4">
                    <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                        <span className="text-sm text-muted-foreground">Amount due</span>
                        <span className="text-xl font-bold tabular-nums">Rs. {grandTotal.toLocaleString()}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => setPaymentType('bank')}
                            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold border-2 ${
                                paymentType === 'bank' ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/40' : 'border-slate-200 dark:border-slate-700'
                            }`}
                        >
                            <Wallet size={16} /> Cash / Bank
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setPaymentType('khata');
                                setSelectedBank('');
                            }}
                            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold border-2 ${
                                paymentType === 'khata' ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40' : 'border-slate-200 dark:border-slate-700'
                            }`}
                        >
                            <BookOpen size={16} /> Khata
                        </button>
                    </div>
                    {paymentType === 'khata' ? (
                        <p className="text-xs text-amber-800 dark:text-amber-200">
                            Rs. {grandTotal.toLocaleString()} will be posted to{' '}
                            <strong>{customerName || 'customer'}</strong>&apos;s khata ledger.
                        </p>
                    ) : bankAccounts.length === 0 ? (
                        <p className="text-sm text-red-600">No bank accounts configured. Add one in Settings.</p>
                    ) : (
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                            {bankAccounts.map((acc) => (
                                <label
                                    key={acc.id}
                                    className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer ${
                                        selectedBank === acc.id ? 'border-orange-400 bg-orange-50/50' : 'border-slate-200 dark:border-slate-700'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="bank"
                                        className="sr-only"
                                        checked={selectedBank === acc.id}
                                        onChange={() => setSelectedBank(acc.id)}
                                    />
                                    <span className="text-sm font-medium">{acc.name}</span>
                                </label>
                            ))}
                        </div>
                    )}
                    <button
                        type="button"
                        className="btn btn-primary w-full"
                        disabled={loading}
                        onClick={() => void submit()}
                    >
                        {loading ? 'Processing…' : 'Confirm collection'}
                    </button>
                </div>
            </div>
        </div>
    );
}
