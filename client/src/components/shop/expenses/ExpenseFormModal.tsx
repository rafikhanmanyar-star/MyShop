import React, { useState, useEffect } from 'react';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Button from '../../ui/Button';
import { accountingApi, expensesApi, shopApi } from '../../../services/shopApi';
import { createExpenseOfflineFirst } from '../../../services/expenseSyncService';
import { CURRENCY } from '../../../constants';

export type ExpensePaymentMethod = 'CASH' | 'BANK' | 'OTHER';

interface ExpenseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

const ExpenseFormModal: React.FC<ExpenseFormModalProps> = ({ isOpen, onClose, onSaved }) => {
  const [categories, setCategories] = useState<{ id: string; name: string; accountId: string }[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<{ id: string; name: string; code?: string }[]>([]);
  const [bankAccounts, setBankAccounts] = useState<{ id: string; name: string; account_type: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [offlineMessage, setOfflineMessage] = useState('');

  const [form, setForm] = useState({
    expenseDate: new Date().toISOString().slice(0, 10),
    categoryId: '',
    accountId: '',
    amount: '',
    paymentMethod: 'CASH' as ExpensePaymentMethod,
    paymentAccountId: '',
    description: '',
    referenceNumber: '',
  });

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError('');
    setOfflineMessage('');
    Promise.all([
      expensesApi.getCategories(false),
      accountingApi.getAccounts(),
      shopApi.getBankAccounts(true),
    ])
      .then(([catRes, accRes, bankRes]) => {
        const cats = Array.isArray(catRes) ? catRes : (catRes as any)?.data ?? [];
        const accountsRaw = Array.isArray(accRes) ? accRes : (accRes as any)?.data ?? [];
        const expenseAcc = accountsRaw.filter((a: any) => a.type === 'Expense');
        const banks = Array.isArray(bankRes) ? bankRes : (bankRes as any)?.data ?? [];
        setCategories(cats);
        setExpenseAccounts(
          expenseAcc.map((a: any) => ({ id: a.id, name: a.name, code: a.code }))
        );
        setBankAccounts(banks);
        if (cats.length) {
          const first = cats[0];
          setForm((f) => ({
            ...f,
            categoryId: first.id,
            accountId: first.accountId || f.accountId,
          }));
        }
        const cash = banks.find((b: any) => b.account_type === 'Cash');
        if (cash) setForm((f) => ({ ...f, paymentAccountId: f.paymentAccountId || cash.id }));
      })
      .catch((e) => setError(e?.response?.data?.error || e?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const handleCategoryChange = (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    setForm((f) => ({
      ...f,
      categoryId,
      accountId: cat?.accountId ?? f.accountId,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setOfflineMessage('');
    const amount = parseFloat(form.amount);
    if (!form.expenseDate || !form.categoryId || !form.accountId || !amount || amount <= 0) {
      setError('Date, category, account, and a positive amount are required.');
      return;
    }
    if ((form.paymentMethod === 'CASH' || form.paymentMethod === 'BANK') && !form.paymentAccountId) {
      setError('Select a cash/bank account for this payment method.');
      return;
    }
    setSaving(true);
    const payload = {
      expenseDate: form.expenseDate,
      categoryId: form.categoryId,
      accountId: form.accountId,
      amount,
      paymentMethod: form.paymentMethod,
      paymentAccountId:
        form.paymentMethod === 'CASH' || form.paymentMethod === 'BANK'
          ? form.paymentAccountId
          : undefined,
      description: form.description || undefined,
      referenceNumber: form.referenceNumber || undefined,
    };
    try {
      const result = await createExpenseOfflineFirst(payload);
      if (result.synced || result.localId) {
        if (result.localId) {
          setOfflineMessage('Saved offline. It will sync when you are back online.');
        }
        setForm({
          expenseDate: new Date().toISOString().slice(0, 10),
          categoryId: categories[0]?.id ?? '',
          accountId: categories[0]?.accountId ?? '',
          amount: '',
          paymentMethod: 'CASH',
          paymentAccountId: bankAccounts.find((b: any) => b.account_type === 'Cash')?.id ?? '',
          description: '',
          referenceNumber: '',
        });
        onSaved?.();
        if (result.synced && !result.localId) onClose();
      } else {
        setError(result.error ?? 'Failed to save');
      }
    } catch (err: any) {
      setError(err?.error ?? err?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add expense" size="lg">
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 p-1">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-200 text-sm border border-rose-200/80 dark:border-rose-800/60">
              {error}
            </div>
          )}
          {offlineMessage && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-sm border border-amber-200 dark:border-amber-800/50">
              {offlineMessage}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Date"
              type="date"
              required
              value={form.expenseDate}
              onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))}
            />
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Category</label>
              <Select
                value={form.categoryId}
                onChange={(e) => handleCategoryChange(e.target.value)}
                required
              >
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Expense account (Chart of Accounts)</label>
            <Select
              value={form.accountId}
              onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
              required
            >
              <option value="">Select account</option>
              {expenseAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code ? `${a.code} — ${a.name}` : a.name}
                </option>
              ))}
            </Select>
          </div>
          <Input
            label={`Amount (${CURRENCY})`}
            type="number"
            step="0.01"
            min="0.01"
            required
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Payment method</label>
              <Select
                value={form.paymentMethod}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    paymentMethod: e.target.value as ExpensePaymentMethod,
                  }))
                }
              >
                <option value="CASH">Cash</option>
                <option value="BANK">Bank</option>
                <option value="OTHER">Other (accrual / unpaid)</option>
              </Select>
            </div>
            {(form.paymentMethod === 'CASH' || form.paymentMethod === 'BANK') && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Pay from</label>
                <Select
                  value={form.paymentAccountId}
                  onChange={(e) => setForm((f) => ({ ...f, paymentAccountId: e.target.value }))}
                  required
                >
                  <option value="">Select cash/bank</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.account_type})
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
          <Input
            label="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Optional"
          />
          <Input
            label="Reference no."
            value={form.referenceNumber}
            onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))}
            placeholder="Invoice / ref (optional)"
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default ExpenseFormModal;
