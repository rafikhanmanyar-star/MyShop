import React, { useState, useEffect } from 'react';
import { expensesApi, shopApi } from '../../../services/shopApi';
import { CURRENCY } from '../../../constants';
import Card from '../../ui/Card';
import Button from '../../ui/Button';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import { Repeat, Play } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

interface RecurringExpensesProps {
  onGenerated?: () => void;
}

const RecurringExpenses: React.FC<RecurringExpensesProps> = ({ onGenerated }) => {
  const { user } = useAuth();
  const canManage = user?.role === 'admin' || user?.role === 'accountant';
  const [list, setList] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [form, setForm] = useState({
    categoryId: '',
    amount: '',
    frequency: 'monthly' as 'weekly' | 'monthly' | 'yearly',
    nextRunDate: new Date().toISOString().slice(0, 10),
    payeeName: '',
    paymentAccountId: '',
    paymentMethod: 'Bank',
    description: '',
  });
  const [error, setError] = useState('');

  const load = () => {
    expensesApi.recurring.list().then((res) => setList(Array.isArray(res) ? res : [])).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    expensesApi.getCategories().then((c) => setCategories(Array.isArray(c) ? c : []));
    shopApi.getBankAccounts(true).then((b: any) => setBankAccounts(Array.isArray(b) ? b : [])).catch(() => {});
  }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const amount = parseFloat(form.amount);
    if (!form.categoryId || !amount || amount <= 0 || !form.nextRunDate) {
      setError('Category, amount, and next run date are required.');
      return;
    }
    setProcessing(true);
    expensesApi.recurring
      .create({
        categoryId: form.categoryId,
        amount,
        frequency: form.frequency,
        nextRunDate: form.nextRunDate,
        payeeName: form.payeeName || undefined,
        paymentAccountId: form.paymentAccountId || undefined,
        paymentMethod: form.paymentMethod,
        description: form.description || undefined,
      })
      .then(() => {
        setModalOpen(false);
        setForm({
          categoryId: '',
          amount: '',
          frequency: 'monthly',
          nextRunDate: new Date().toISOString().slice(0, 10),
          payeeName: '',
          paymentAccountId: '',
          paymentMethod: 'Bank',
          description: '',
        });
        load();
      })
      .catch((err) => setError(err?.error || err?.message || 'Failed'))
      .finally(() => setProcessing(false));
  };

  const processDue = () => {
    setProcessing(true);
    expensesApi.recurring
      .processDue(new Date().toISOString().slice(0, 10))
      .then((res: any) => {
        const created = res?.created ?? 0;
        if (created > 0) {
          alert(`Generated ${created} expense(s) from recurring definitions.`);
          onGenerated?.();
        }
        load();
      })
      .finally(() => setProcessing(false));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-foreground">Recurring expense definitions</h2>
        <div className="flex gap-2">
          {canManage && (
            <>
              <Button onClick={() => setModalOpen(true)}>
                <Repeat className="w-4 h-4 mr-1" /> Add Recurring
              </Button>
              <Button variant="secondary" onClick={processDue} disabled={processing}>
                <Play className="w-4 h-4 mr-1" /> Process due
              </Button>
            </>
          )}
        </div>
      </div>

      <Card className="border-none shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">No recurring expenses defined.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/80 border-b border-border">
                <th className="text-left p-3 font-semibold text-foreground">Category</th>
                <th className="text-right p-3 font-semibold text-foreground">Amount</th>
                <th className="text-left p-3 font-semibold text-foreground">Frequency</th>
                <th className="text-left p-3 font-semibold text-foreground">Next run</th>
                <th className="text-left p-3 font-semibold text-foreground">Payee</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="border-b border-border">
                  <td className="p-3">{r.categoryName}</td>
                  <td className="p-3 text-right font-medium">{CURRENCY} {Number(r.amount).toLocaleString()}</td>
                  <td className="p-3">{r.frequency}</td>
                  <td className="p-3 text-muted-foreground">{r.nextRunDate}</td>
                  <td className="p-3 text-muted-foreground">{r.payeeName ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Add Recurring Expense" size="md">
        <form onSubmit={handleCreate} className="space-y-4">
          {error && <div className="p-2 rounded bg-rose-50 text-rose-700 text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Category</label>
            <Select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))} required>
              <option value="">Select</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Frequency</label>
              <Select value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as any }))}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </Select>
            </div>
            <Input
              label="Next run date"
              type="date"
              required
              value={form.nextRunDate}
              onChange={(e) => setForm((f) => ({ ...f, nextRunDate: e.target.value }))}
            />
          </div>
          <Input label="Payee name" value={form.payeeName} onChange={(e) => setForm((f) => ({ ...f, payeeName: e.target.value }))} />
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Payment account</label>
            <Select value={form.paymentAccountId} onChange={(e) => setForm((f) => ({ ...f, paymentAccountId: e.target.value }))}>
              <option value="">— None —</option>
              {bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </div>
          <Input label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={processing}>{processing ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default RecurringExpenses;
