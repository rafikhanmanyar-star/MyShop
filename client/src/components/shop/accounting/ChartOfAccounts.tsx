
import React, { useState } from 'react';
import { useAccounting } from '../../../context/AccountingContext';
import { CURRENCY, ICONS } from '../../../constants';
import Card from '../../ui/Card';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Button from '../../ui/Button';

type AccountRow = { id: string; code: string; name: string; type: string; description?: string; isControlAccount?: boolean; balance: number };

const ChartOfAccounts: React.FC = () => {
    const { accounts, createAccount, updateAccount, deleteAccount } = useAccounting();
    const [filter, setFilter] = useState<string>('All');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAccount, setEditingAccount] = useState<AccountRow | null>(null);
    const [formError, setFormError] = useState<string>('');
    const [creating, setCreating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [newAccount, setNewAccount] = useState({
        code: '',
        name: '',
        type: 'Asset' as any,
        description: '',
        isControlAccount: false
    });

    const clientSideDuplicateCheck = (excludeId?: string): string | null => {
        const trimmedName = newAccount.name.trim().toLowerCase();
        const trimmedCode = newAccount.code.trim();
        if (accounts.some(a => a.name.toLowerCase() === trimmedName && a.id !== excludeId)) {
            return `An account with the name "${newAccount.name.trim()}" already exists`;
        }
        if (trimmedCode && accounts.some(a => a.code === trimmedCode && a.id !== excludeId)) {
            return `An account with the code "${trimmedCode}" already exists`;
        }
        return null;
    };

    const openEditModal = (acc: AccountRow) => {
        setEditingAccount(acc);
        setNewAccount({
            code: acc.code || '',
            name: acc.name,
            type: (acc.type || 'Asset') as any,
            description: (acc as any).description || '',
            isControlAccount: !!(acc as any).isControlAccount
        });
        setFormError('');
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingAccount(null);
        setFormError('');
        setNewAccount({ code: '', name: '', type: 'Asset', description: '', isControlAccount: false });
    };

    const handleCreate = async () => {
        setFormError('');
        const localErr = clientSideDuplicateCheck();
        if (localErr) { setFormError(localErr); return; }

        setCreating(true);
        try {
            await createAccount({
                ...newAccount,
                name: newAccount.name.trim(),
                code: newAccount.code.trim(),
                balance: 0,
                isActive: true
            });
            closeModal();
        } catch (e: any) {
            const msg = e?.error || e?.message || 'Failed to create account';
            setFormError(msg);
        } finally {
            setCreating(false);
        }
    };

    const handleUpdate = async () => {
        if (!editingAccount) return;
        setFormError('');
        const localErr = clientSideDuplicateCheck(editingAccount.id);
        if (localErr) { setFormError(localErr); return; }

        setSaving(true);
        try {
            await updateAccount(editingAccount.id, {
                name: newAccount.name.trim(),
                code: newAccount.code.trim(),
                type: newAccount.type,
                description: newAccount.description || undefined,
                isActive: true
            });
            closeModal();
        } catch (e: any) {
            const msg = e?.error || e?.message || 'Failed to update account';
            setFormError(msg);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!editingAccount) return;
        if (!window.confirm(`Delete account "${editingAccount.name}"? This cannot be undone.`)) return;
        setFormError('');
        setDeleting(true);
        try {
            await deleteAccount(editingAccount.id);
            closeModal();
        } catch (e: any) {
            const msg = e?.error || e?.message || 'Failed to delete account';
            setFormError(msg);
        } finally {
            setDeleting(false);
        }
    };

    const categories = ['All', 'Asset', 'Liability', 'Equity', 'Income', 'Expense'];

    const filteredAccounts = filter === 'All'
        ? accounts
        : accounts.filter(a => a.type === filter);

    return (
        <div className="space-y-6 animate-fade-in shadow-inner h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <div className="flex gap-2 p-1 bg-card dark:bg-slate-900 border border-border dark:border-slate-700 rounded-xl">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setFilter(cat)}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filter === cat
                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100 dark:shadow-indigo-900/50'
                                : 'text-muted-foreground hover:text-muted-foreground dark:hover:text-slate-300'
                                }`}
                        >
                            {cat}s
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={() => { setEditingAccount(null); setNewAccount({ code: '', name: '', type: 'Asset', description: '', isControlAccount: false }); setFormError(''); setIsModalOpen(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors"
                >
                    {ICONS.plus} New Account
                </button>
            </div>

            <Card className="border-none dark:border dark:border-slate-700/80 shadow-sm overflow-hidden flex-1 flex flex-col dark:bg-slate-900/40">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-muted/80 dark:bg-slate-800 text-xs font-semibold uppercase text-muted-foreground">
                            <tr>
                                <th className="px-6 py-4">Account Code</th>
                                <th className="px-6 py-4">Account Name</th>
                                <th className="px-6 py-4">Category</th>
                                <th className="px-6 py-4 text-right">Current Balance ({CURRENCY})</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {filteredAccounts.map(acc => (
                                <tr key={acc.id} className="hover:bg-muted/50 dark:hover:bg-slate-800/50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="font-mono font-bold text-muted-foreground bg-muted dark:bg-slate-800 px-2 py-1 rounded text-xs">{acc.code}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-foreground text-sm">{acc.name}</div>
                                        {acc.isControlAccount && (
                                            <div className="text-xs text-indigo-500 dark:text-indigo-400 font-semibold uppercase tracking-tighter">Control Account</div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${acc.type === 'Asset' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400' :
                                            acc.type === 'Liability' ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400' :
                                                acc.type === 'Income' ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400' :
                                                    'bg-muted dark:bg-slate-800 text-muted-foreground'
                                            }`}>
                                            {acc.type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className="text-sm font-semibold text-foreground font-mono">
                                            {acc.balance.toLocaleString()}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase">Active</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            type="button"
                                            onClick={() => openEditModal(acc)}
                                            className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-lg text-muted-foreground hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 dark:focus:ring-offset-slate-900"
                                            aria-label={`Edit ${acc.name}`}
                                        >
                                            {ICONS.edit}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Modal
                isOpen={isModalOpen}
                onClose={closeModal}
                title={editingAccount ? 'Edit Account' : 'Create New Account'}
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Account Code"
                            placeholder="e.g. 1001"
                            value={newAccount.code}
                            onChange={(e) => setNewAccount({ ...newAccount, code: e.target.value })}
                        />
                        <Select
                            label="Account Type"
                            value={newAccount.type}
                            onChange={(e) => setNewAccount({ ...newAccount, type: e.target.value as any })}
                        >
                            <option value="Asset">Asset</option>
                            <option value="Liability">Liability</option>
                            <option value="Equity">Equity</option>
                            <option value="Income">Income</option>
                            <option value="Expense">Expense</option>
                        </Select>
                    </div>
                    <Input
                        label="Account Name"
                        placeholder="e.g. Petty Cash"
                        value={newAccount.name}
                        onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                    />
                    <Input
                        label="Description"
                        placeholder="Optional description"
                        value={newAccount.description}
                        onChange={(e) => setNewAccount({ ...newAccount, description: e.target.value })}
                    />

                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="isControl"
                            checked={newAccount.isControlAccount}
                            onChange={(e) => setNewAccount({ ...newAccount, isControlAccount: e.target.checked })}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <label htmlFor="isControl" className="text-sm text-muted-foreground font-medium">Control Account (System use)</label>
                    </div>

                    {formError && (
                        <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-200 px-4 py-3 rounded-lg text-sm font-medium">
                            {formError}
                        </div>
                    )}

                    <div className="flex justify-between gap-3 mt-4">
                        <div>
                            {editingAccount && (
                                <Button
                                    variant="danger"
                                    onClick={handleDelete}
                                    disabled={deleting || saving}
                                >
                                    {deleting ? 'Deleting...' : 'Delete Account'}
                                </Button>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <Button variant="secondary" onClick={closeModal}>Cancel</Button>
                            {editingAccount ? (
                                <Button onClick={handleUpdate} disabled={!newAccount.code.trim() || !newAccount.name.trim() || saving}>
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </Button>
                            ) : (
                                <Button onClick={handleCreate} disabled={!newAccount.code.trim() || !newAccount.name.trim() || creating}>
                                    {creating ? 'Creating...' : 'Create Account'}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default ChartOfAccounts;
