
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAccounting } from '../../../context/AccountingContext';
import { CURRENCY, ICONS } from '../../../constants';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Button from '../../ui/Button';

type AccountRow = {
    id: string;
    code: string;
    name: string;
    type: string;
    description?: string;
    isControlAccount?: boolean;
    balance: number;
    isActive?: boolean;
};

const ITEMS_PER_PAGE = 10;

const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
    Asset: { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800' },
    Liability: { bg: 'bg-rose-50 dark:bg-rose-950/40', text: 'text-rose-700 dark:text-rose-400', border: 'border-rose-200 dark:border-rose-800' },
    Equity: { bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800' },
    Income: { bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800' },
    Expense: { bg: 'bg-purple-50 dark:bg-purple-950/40', text: 'text-purple-700 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-800' },
};

const chipColors: Record<string, { active: string; dot: string }> = {
    All: { active: 'bg-gray-900 dark:bg-white text-white dark:text-gray-900', dot: '' },
    Asset: { active: 'bg-emerald-600 text-white', dot: 'bg-emerald-500' },
    Liability: { active: 'bg-rose-600 text-white', dot: 'bg-rose-500' },
    Equity: { active: 'bg-amber-600 text-white', dot: 'bg-amber-500' },
    Income: { active: 'bg-blue-600 text-white', dot: 'bg-blue-500' },
    Expense: { active: 'bg-purple-600 text-white', dot: 'bg-purple-500' },
};

const summaryCardBorders: Record<string, string> = {
    total: 'border-t-blue-500',
    assets: 'border-t-emerald-500',
    liabilities: 'border-t-rose-500',
    net: 'border-t-indigo-500',
};

function formatCompact(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${CURRENCY} ${(value / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${CURRENCY} ${(value / 1_000).toFixed(1)}K`;
    return `${CURRENCY} ${value.toLocaleString()}`;
}

const ChartOfAccounts: React.FC = () => {
    const { accounts, createAccount, updateAccount, deleteAccount } = useAccounting();
    const [filter, setFilter] = useState<string>('All');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

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
        isControlAccount: false,
    });

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpenMenuId(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const categories = ['All', 'Asset', 'Liability', 'Equity', 'Income', 'Expense'];

    const categoryCounts = useMemo(() => {
        const counts: Record<string, number> = { All: accounts.length };
        categories.forEach(c => { if (c !== 'All') counts[c] = 0; });
        accounts.forEach(a => { if (counts[a.type] !== undefined) counts[a.type]++; });
        return counts;
    }, [accounts]);

    const stats = useMemo(() => {
        let totalAssets = 0;
        let totalLiabilities = 0;
        accounts.forEach(a => {
            if (a.type === 'Asset') totalAssets += a.balance;
            else if (a.type === 'Liability') totalLiabilities += a.balance;
        });
        return {
            totalAccounts: accounts.length,
            totalAssets,
            totalLiabilities,
            netBalance: totalAssets - totalLiabilities,
        };
    }, [accounts]);

    const filteredAccounts = useMemo(() => {
        return filter === 'All' ? accounts : accounts.filter(a => a.type === filter);
    }, [accounts, filter]);

    const totalPages = Math.max(1, Math.ceil(filteredAccounts.length / ITEMS_PER_PAGE));
    const paginatedAccounts = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredAccounts.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredAccounts, currentPage]);

    useEffect(() => {
        setCurrentPage(1);
        setSelectedIds(new Set());
    }, [filter]);

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

    const openCreateModal = () => {
        setEditingAccount(null);
        setNewAccount({ code: '', name: '', type: 'Asset', description: '', isControlAccount: false });
        setFormError('');
        setIsModalOpen(true);
    };

    const openEditModal = (acc: AccountRow) => {
        setEditingAccount(acc);
        setNewAccount({
            code: acc.code || '',
            name: acc.name,
            type: (acc.type || 'Asset') as any,
            description: (acc as any).description || '',
            isControlAccount: !!(acc as any).isControlAccount,
        });
        setFormError('');
        setIsModalOpen(true);
        setOpenMenuId(null);
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
            const ret = await createAccount({
                ...newAccount,
                name: newAccount.name.trim(),
                code: newAccount.code.trim(),
                balance: 0,
                isActive: true,
            });
            if (ret && typeof ret === 'object' && 'synced' in ret && !ret.synced) return;
            closeModal();
        } catch (e: any) {
            setFormError(e?.error || e?.message || 'Failed to create account');
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
            const ret = await updateAccount(editingAccount.id, {
                name: newAccount.name.trim(),
                code: newAccount.code.trim(),
                type: newAccount.type,
                description: newAccount.description || undefined,
                isActive: true,
            });
            if (ret && typeof ret === 'object' && 'synced' in ret && !ret.synced) return;
            closeModal();
        } catch (e: any) {
            setFormError(e?.error || e?.message || 'Failed to update account');
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
            const ret = await deleteAccount(editingAccount.id);
            if (ret && typeof ret === 'object' && 'synced' in ret && !ret.synced) return;
            closeModal();
        } catch (e: any) {
            setFormError(e?.error || e?.message || 'Failed to delete account');
        } finally {
            setDeleting(false);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        const names = accounts.filter(a => selectedIds.has(a.id)).map(a => a.name).join(', ');
        if (!window.confirm(`Delete ${selectedIds.size} account(s): ${names}? This cannot be undone.`)) return;
        for (const id of selectedIds) {
            try { await deleteAccount(id); } catch { /* continue */ }
        }
        setSelectedIds(new Set());
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === paginatedAccounts.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(paginatedAccounts.map(a => a.id)));
        }
    };

    const pageStart = (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const pageEnd = Math.min(currentPage * ITEMS_PER_PAGE, filteredAccounts.length);

    const getPageNumbers = () => {
        const pages: (number | string)[] = [];
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1) {
                pages.push(i);
            } else if (pages[pages.length - 1] !== '...') {
                pages.push('...');
            }
        }
        return pages;
    };

    const handleDeleteDirect = async (acc: AccountRow) => {
        if (!window.confirm(`Delete account "${acc.name}"? This cannot be undone.`)) return;
        try {
            await deleteAccount(acc.id);
        } catch { /* swallow */ }
    };

    return (
        <div className="space-y-5 animate-fade-in h-full flex flex-col">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground tracking-tight">Chart of Accounts</h1>
                    <p className="text-sm text-muted-foreground mt-1">Manage your financial structure with precision and clarity.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        className="flex items-center gap-2 px-4 py-2.5 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
                    >
                        <span className="w-4 h-4">{ICONS.filter}</span>
                        Filter
                    </button>
                    <button
                        onClick={openCreateModal}
                        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
                    >
                        <span className="w-4 h-4">{ICONS.plus}</span>
                        New Account
                    </button>
                </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className={`bg-card dark:bg-slate-900/50 border border-border rounded-xl p-4 border-t-4 ${summaryCardBorders.total}`}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Accounts</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{stats.totalAccounts}</p>
                </div>
                <div className={`bg-card dark:bg-slate-900/50 border border-border rounded-xl p-4 border-t-4 ${summaryCardBorders.assets}`}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Assets Value</p>
                    <div className="flex items-baseline gap-2 mt-1">
                        <p className="text-2xl font-bold text-foreground">{formatCompact(stats.totalAssets)}</p>
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Active</span>
                    </div>
                </div>
                <div className={`bg-card dark:bg-slate-900/50 border border-border rounded-xl p-4 border-t-4 ${summaryCardBorders.liabilities}`}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Liabilities</p>
                    <div className="flex items-baseline gap-2 mt-1">
                        <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">{formatCompact(stats.totalLiabilities)}</p>
                    </div>
                </div>
                <div className={`bg-card dark:bg-slate-900/50 border border-border rounded-xl p-4 border-t-4 ${summaryCardBorders.net}`}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Net Balance</p>
                    <div className="flex items-baseline gap-2 mt-1">
                        <p className="text-2xl font-bold text-foreground">{formatCompact(stats.netBalance)}</p>
                        <span className="text-xs font-medium text-muted-foreground">Liquid</span>
                    </div>
                </div>
            </div>

            {/* Category filter chips */}
            <div className="flex flex-wrap gap-2">
                {categories.map(cat => {
                    const isActive = filter === cat;
                    const count = categoryCounts[cat] || 0;
                    const chip = chipColors[cat] || chipColors.All;
                    return (
                        <button
                            key={cat}
                            onClick={() => setFilter(cat)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                                isActive
                                    ? chip.active
                                    : 'bg-muted/60 dark:bg-slate-800 text-muted-foreground hover:bg-muted dark:hover:bg-slate-700'
                            }`}
                        >
                            {cat === 'All' ? cat : `${cat}s`}
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                                isActive
                                    ? 'bg-white/25'
                                    : 'bg-muted dark:bg-slate-700'
                            }`}>
                                {count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
                <div className="flex items-center justify-between bg-green-600 text-white rounded-xl px-5 py-3 text-sm font-medium animate-fade-in">
                    <div className="flex items-center gap-4">
                        <span>{selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected</span>
                        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-xs font-semibold">
                            <span className="w-3.5 h-3.5">{ICONS.edit}</span>
                            Change Category
                        </button>
                        <button
                            onClick={handleBulkDelete}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-xs font-semibold"
                        >
                            <span className="w-3.5 h-3.5">{ICONS.trash}</span>
                            Delete
                        </button>
                    </div>
                    <button
                        onClick={() => setSelectedIds(new Set())}
                        className="text-white/80 hover:text-white font-semibold text-sm transition-colors"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Table */}
            <div className="bg-card dark:bg-slate-900/40 border border-border dark:border-slate-700/80 rounded-xl overflow-hidden flex-1 flex flex-col shadow-sm">
                <div className="overflow-x-auto flex-1">
                    <table className="w-full text-left">
                        <thead className="bg-muted/60 dark:bg-slate-800/80">
                            <tr className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                                <th className="px-5 py-4 w-12">
                                    <input
                                        type="checkbox"
                                        checked={paginatedAccounts.length > 0 && selectedIds.size === paginatedAccounts.length}
                                        onChange={toggleSelectAll}
                                        title="Select all"
                                        className="rounded border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 w-4 h-4"
                                    />
                                </th>
                                <th className="px-4 py-4">Account Code</th>
                                <th className="px-4 py-4">Name & Description</th>
                                <th className="px-4 py-4">Category</th>
                                <th className="px-4 py-4 text-right">Balance ({CURRENCY})</th>
                                <th className="px-4 py-4">Status</th>
                                <th className="px-4 py-4 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {paginatedAccounts.map(acc => {
                                const isSelected = selectedIds.has(acc.id);
                                const isExpanded = expandedId === acc.id;
                                const colors = categoryColors[acc.type] || categoryColors.Asset;
                                return (
                                    <React.Fragment key={acc.id}>
                                        <tr
                                            className={`group transition-colors cursor-pointer ${
                                                isSelected
                                                    ? 'bg-blue-50/50 dark:bg-blue-950/20'
                                                    : 'hover:bg-muted/40 dark:hover:bg-slate-800/40'
                                            }`}
                                        >
                                            <td className="px-5 py-4">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleSelect(acc.id)}
                                                    title={`Select ${acc.name}`}
                                                    className="rounded border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 w-4 h-4"
                                                />
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <span className="font-mono font-bold text-muted-foreground text-sm">{acc.code}</span>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="font-semibold text-foreground text-sm">{acc.name}</div>
                                                {acc.description && (
                                                    <div className="text-xs text-muted-foreground mt-0.5">{acc.description}</div>
                                                )}
                                                {acc.isControlAccount && (
                                                    <div className="text-xs text-indigo-500 dark:text-indigo-400 font-semibold mt-0.5">Control Account</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold uppercase border ${colors.bg} ${colors.text} ${colors.border}`}>
                                                    {acc.type}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 text-right">
                                                <span className="text-sm font-semibold text-foreground font-mono">
                                                    {acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Active</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-right relative">
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : acc.id); }}
                                                        className={`p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all ${isExpanded ? 'rotate-180' : ''}`}
                                                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                                                    >
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === acc.id ? null : acc.id); }}
                                                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                                        aria-label="Actions"
                                                    >
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                                                    </button>
                                                    {openMenuId === acc.id && (
                                                        <div ref={menuRef} className="absolute right-4 top-full z-20 mt-1 w-44 bg-card border border-border rounded-xl shadow-xl py-1.5 animate-fade-in">
                                                            <button
                                                                onClick={() => openEditModal(acc)}
                                                                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                                                            >
                                                                <span className="w-4 h-4">{ICONS.edit}</span>
                                                                Edit Account
                                                            </button>
                                                            <button
                                                                onClick={() => { setExpandedId(isExpanded ? null : acc.id); setOpenMenuId(null); }}
                                                                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                                                            >
                                                                <span className="w-4 h-4">{ICONS.list}</span>
                                                                View Transactions
                                                            </button>
                                                            <div className="border-t border-border my-1" />
                                                            <button
                                                                onClick={() => {
                                                                    setOpenMenuId(null);
                                                                    setEditingAccount(acc);
                                                                    handleDeleteDirect(acc);
                                                                }}
                                                                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                                            >
                                                                <span className="w-4 h-4">{ICONS.trash}</span>
                                                                Delete Account
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                        {isExpanded && (
                                            <tr>
                                                <td colSpan={7} className="bg-muted/30 dark:bg-slate-800/30 px-5 py-4 border-b border-border">
                                                    <div className="ml-10">
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Last Transactions Preview</p>
                                                        <div className="space-y-2.5">
                                                            <p className="text-xs text-muted-foreground italic">Transaction history coming soon.</p>
                                                        </div>
                                                        <button className="mt-3 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                                                            View all transactions for this account
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                            {paginatedAccounts.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                                        <p className="text-sm font-medium">No accounts found</p>
                                        <p className="text-xs mt-1">Create a new account to get started.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {filteredAccounts.length > 0 && (
                    <div className="flex items-center justify-between px-5 py-4 border-t border-border bg-muted/20 dark:bg-slate-800/30">
                        <p className="text-sm text-muted-foreground">
                            Showing <span className="font-semibold text-foreground">{pageStart}</span> to <span className="font-semibold text-foreground">{pageEnd}</span> of <span className="font-semibold text-foreground">{filteredAccounts.length}</span> accounts
                        </p>
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                aria-label="Previous page"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                            </button>
                            {getPageNumbers().map((p, i) =>
                                typeof p === 'string' ? (
                                    <span key={`e-${i}`} className="px-2 text-muted-foreground text-sm">...</span>
                                ) : (
                                    <button
                                        key={p}
                                        onClick={() => setCurrentPage(p)}
                                        className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                                            currentPage === p
                                                ? 'bg-blue-600 text-white shadow-sm'
                                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                        }`}
                                    >
                                        {p}
                                    </button>
                                )
                            )}
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                aria-label="Next page"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={closeModal}
                title={editingAccount ? 'Edit Account' : 'Create New Account'}
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Account Code"
                            placeholder="e.g. 1001-00"
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
                        placeholder="e.g. Cash on Hand"
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
                            className="rounded border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
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
