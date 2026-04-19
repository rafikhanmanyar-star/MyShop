import React, { useState, useEffect, useCallback } from 'react';
import { accountingApi, expensesApi } from '../../../services/shopApi';
import Card from '../../ui/Card';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Modal from '../../ui/Modal';
import { Pencil, Plus } from 'lucide-react';

const ExpenseSettingsTab: React.FC = () => {
  const [categories, setCategories] = useState<any[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<{ id: string; name: string; code?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', accountId: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([expensesApi.getCategories(true), accountingApi.getAccounts()])
      .then(([c, acc]) => {
        setCategories(Array.isArray(c) ? c : []);
        const raw = Array.isArray(acc) ? acc : [];
        setExpenseAccounts(
          raw
            .filter((a: any) => a.type === 'Expense')
            .map((a: any) => ({ id: a.id, name: a.name, code: a.code }))
        );
      })
      .catch((e) => setError(e?.response?.data?.error || e?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setError('');
    setForm({ name: '', accountId: expenseAccounts[0]?.id ?? '' });
    setEditId(null);
    setShowAdd(true);
  };

  const openEdit = (cat: any) => {
    setError('');
    setForm({ name: cat.name, accountId: cat.accountId });
    setEditId(cat.id);
    setShowAdd(true);
  };

  const saveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.accountId) {
      setError('Name and expense account are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editId) {
        await expensesApi.updateCategory(editId, { name: form.name.trim(), accountId: form.accountId });
      } else {
        await expensesApi.createCategory({ name: form.name.trim(), accountId: form.accountId });
      }
      setShowAdd(false);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (cat: any) => {
    const currentlyActive = cat.isActive !== false;
    const newVal = !currentlyActive;
    if (!confirm(`${newVal ? 'Activate' : 'Deactivate'} category "${cat.name}"?`)) return;
    try {
      await expensesApi.updateCategory(cat.id, { isActive: newVal });
      load();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Update failed');
    }
  };

  if (loading && categories.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {error && !showAdd && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-700 text-sm border border-rose-200/80 dark:border-rose-800/60">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={openAdd} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add category
        </Button>
      </div>

      <Modal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        title={editId ? 'Edit category' : 'New category'}
        size="md"
      >
        <form onSubmit={saveCategory} className="space-y-4 p-1">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-700 text-sm border border-rose-200/80">
              {error}
            </div>
          )}
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            placeholder="e.g. Rent, Utilities"
          />
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Default expense account (CoA)</label>
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
            <p className="text-xs text-muted-foreground mt-1">
              Used as the default when you pick this category on an expense (you can still choose another account per line).
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>

      <Card className="border-none dark:border dark:border-slate-700/80 shadow-sm overflow-hidden dark:bg-slate-900/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/80 dark:bg-slate-800 border-b border-border dark:border-slate-700">
              <th className="text-left p-3 font-semibold">Name</th>
              <th className="text-left p-3 font-semibold">Account</th>
              <th className="text-left p-3 font-semibold">Status</th>
              <th className="text-right p-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr key={cat.id} className="border-b border-border dark:border-slate-700">
                <td className="p-3 font-medium">{cat.name}</td>
                <td className="p-3 text-muted-foreground text-xs font-mono">
                  {cat.accountCode ?? '—'}
                </td>
                <td className="p-3">
                  <span
                    className={
                      cat.isActive === false
                        ? 'text-amber-600 dark:text-amber-400 font-medium'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }
                  >
                    {cat.isActive === false ? 'Inactive' : 'Active'}
                  </span>
                </td>
                <td className="p-3 text-right space-x-2">
                  <button
                    type="button"
                    onClick={() => openEdit(cat)}
                    className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline text-sm font-medium"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(cat)}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    {cat.isActive === false ? 'Activate' : 'Deactivate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {categories.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">No categories yet.</div>
        )}
      </Card>
    </div>
  );
};

export default ExpenseSettingsTab;
