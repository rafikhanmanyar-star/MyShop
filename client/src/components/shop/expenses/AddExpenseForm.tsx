import React, { useState, useEffect } from 'react';
import { expensesApi, shopApi } from '../../../services/shopApi';
import { createExpenseOfflineFirst } from '../../../services/expenseSyncService';
import { CURRENCY } from '../../../constants';
import Card from '../../ui/Card';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Button from '../../ui/Button';
import { Paperclip } from 'lucide-react';

interface AddExpenseFormProps {
  onSaved?: () => void;
}

const AddExpenseForm: React.FC<AddExpenseFormProps> = ({ onSaved }) => {
  const [categories, setCategories] = useState<{ id: string; name: string; accountId: string }[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [bankAccounts, setBankAccounts] = useState<{ id: string; name: string; account_type: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [offlineMessage, setOfflineMessage] = useState('');
  const [form, setForm] = useState({
    expenseDate: new Date().toISOString().slice(0, 10),
    categoryId: '',
    amount: '',
    paymentMethod: 'Cash' as 'Cash' | 'Bank' | 'Credit',
    payeeName: '',
    vendorId: '',
    description: '',
    attachmentUrl: '',
    branchId: '',
    recurring: false,
    referenceNumber: '',
    taxAmount: '',
    paymentAccountId: '',
  });

  useEffect(() => {
    Promise.all([
      expensesApi.getCategories(),
      shopApi.getBranches(),
      shopApi.getVendors(),
      shopApi.getBankAccounts(true),
    ])
      .then(([catRes, branchRes, vendorRes, bankRes]) => {
        const cats = Array.isArray(catRes) ? catRes : (catRes as any)?.data ?? [];
        const branchList = Array.isArray(branchRes) ? branchRes : (branchRes as any)?.data ?? [];
        const vendorList = Array.isArray(vendorRes) ? vendorRes : (vendorRes as any)?.data ?? [];
        const banks = Array.isArray(bankRes) ? bankRes : (bankRes as any)?.data ?? [];
        setCategories(cats);
        setBranches(branchList);
        setVendors(vendorList);
        setBankAccounts(banks);
        if (cats.length && !form.categoryId) setForm((f) => ({ ...f, categoryId: cats[0].id }));
        const cash = banks.find((b: any) => b.account_type === 'Cash');
        if (cash && !form.paymentAccountId) setForm((f) => ({ ...f, paymentAccountId: cash.id }));
      })
      .catch((e) => setError(e?.response?.data?.error || e?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    expensesApi.uploadAttachment(file).then((res: any) => {
      const url = res?.attachmentUrl ?? res?.data?.attachmentUrl;
      if (url) setForm((f) => ({ ...f, attachmentUrl: url }));
    }).catch(() => setError('Upload failed'));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setOfflineMessage('');
    const amount = parseFloat(form.amount);
    if (!form.expenseDate || !form.categoryId || !amount || amount <= 0) {
      setError('Expense date, category, and a positive amount are required.');
      return;
    }
    if (form.paymentMethod !== 'Credit' && !form.paymentAccountId) {
      setError('Payment account is required for Cash/Bank.');
      return;
    }
    setSaving(true);
    const payload = {
      expenseDate: form.expenseDate,
      categoryId: form.categoryId,
      amount,
      paymentMethod: form.paymentMethod,
      payeeName: form.payeeName || undefined,
      vendorId: form.vendorId || undefined,
      description: form.description || undefined,
      attachmentUrl: form.attachmentUrl || undefined,
      branchId: form.branchId || undefined,
      referenceNumber: form.referenceNumber || undefined,
      taxAmount: form.taxAmount ? parseFloat(form.taxAmount) : undefined,
      paymentAccountId: form.paymentMethod !== 'Credit' ? form.paymentAccountId : undefined,
    };
    try {
      const result = await createExpenseOfflineFirst(payload);
      if (result.synced) {
        setForm({
          expenseDate: new Date().toISOString().slice(0, 10),
          categoryId: categories[0]?.id ?? '',
          amount: '',
          paymentMethod: 'Cash',
          payeeName: '',
          vendorId: '',
          description: '',
          attachmentUrl: '',
          branchId: '',
          recurring: false,
          referenceNumber: '',
          taxAmount: '',
          paymentAccountId: bankAccounts.find((b: any) => b.account_type === 'Cash')?.id ?? '',
        });
        onSaved?.();
      } else if (result.localId) {
        setOfflineMessage('Saved offline. Will sync when you’re back online.');
        setForm({
          expenseDate: new Date().toISOString().slice(0, 10),
          categoryId: categories[0]?.id ?? '',
          amount: '',
          paymentMethod: 'Cash',
          payeeName: '',
          vendorId: '',
          description: '',
          attachmentUrl: '',
          branchId: '',
          recurring: false,
          referenceNumber: '',
          taxAmount: '',
          paymentAccountId: bankAccounts.find((b: any) => b.account_type === 'Cash')?.id ?? '',
        });
        onSaved?.();
      } else {
        setError(result.error ?? 'Failed to save');
      }
    } catch (err: any) {
      setError(err?.error ?? err?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Card className="max-w-2xl p-8 border-none shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">{error}</div>
        )}
        {offlineMessage && (
          <div className="p-3 rounded-lg bg-amber-50 text-amber-800 text-sm border border-amber-200">{offlineMessage}</div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Expense Date"
            type="date"
            required
            value={form.expenseDate}
            onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))}
          />
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Category</label>
            <Select
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              required
            >
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
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
            <label className="block text-sm font-medium text-foreground mb-1.5">Payment Method</label>
            <Select
              value={form.paymentMethod}
              onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value as 'Cash' | 'Bank' | 'Credit' }))}
            >
              <option value="Cash">Cash</option>
              <option value="Bank">Bank</option>
              <option value="Credit">Credit (Unpaid)</option>
            </Select>
          </div>
          {(form.paymentMethod === 'Cash' || form.paymentMethod === 'Bank') && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Payment Account</label>
              <Select
                value={form.paymentAccountId}
                onChange={(e) => setForm((f) => ({ ...f, paymentAccountId: e.target.value }))}
                required
              >
                <option value="">Select account</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.account_type})</option>
                ))}
              </Select>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Vendor / Payee Name"
            value={form.payeeName}
            onChange={(e) => setForm((f) => ({ ...f, payeeName: e.target.value }))}
            placeholder="Name or select vendor below"
          />
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Vendor (optional)</label>
            <Select
              value={form.vendorId}
              onChange={(e) => setForm((f) => ({ ...f, vendorId: e.target.value }))}
            >
              <option value="">— None —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </Select>
          </div>
        </div>
        <Input
          label="Description"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Brief description"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Branch (optional)</label>
            <Select
              value={form.branchId}
              onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
            >
              <option value="">— None —</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </div>
          <Input
            label="Reference number"
            value={form.referenceNumber}
            onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))}
          />
        </div>
        <Input
          label="Tax amount (optional)"
          type="number"
          step="0.01"
          min="0"
          value={form.taxAmount}
          onChange={(e) => setForm((f) => ({ ...f, taxAmount: e.target.value }))}
        />
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Attachment (bill/receipt)</label>
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={handleFileChange}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700"
            />
            {form.attachmentUrl && (
              <a href={form.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 text-sm flex items-center gap-1">
                <Paperclip className="w-4 h-4" /> View
              </a>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save Expense'}
          </Button>
        </div>
      </form>
    </Card>
  );
};

export default AddExpenseForm;
