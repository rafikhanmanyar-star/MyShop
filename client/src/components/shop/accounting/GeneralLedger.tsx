
import React, { useCallback, useState } from 'react';
import { useAccounting } from '../../../context/AccountingContext';
import { useAuth } from '../../../context/AuthContext';
import { ICONS } from '../../../constants';
import Card from '../../ui/Card';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Button from '../../ui/Button';

type EditFormLine = { accountId: string; description?: string; debit: number; credit: number };

function sumEntryLines(lines: any[] | undefined) {
    const debit = (lines || []).reduce((s, l) => s + Number(l?.debit || 0), 0);
    const credit = (lines || []).reduce((s, l) => s + Number(l?.credit || 0), 0);
    return { debit, credit };
}

const GeneralLedger: React.FC = () => {
    const { user } = useAuth();
    const { entries, accounts, loading, updateJournalEntry, deleteJournalEntry } = useAccounting();
    const isAdmin = user?.role === 'admin';
    const [searchTerm, setSearchTerm] = useState('');
    const [sourceFilter, setSourceFilter] = useState<'all' | 'POS' | 'MobileApp' | 'Manual'>('all');
    const [editingEntry, setEditingEntry] = useState<any | null>(null);
    const [editForm, setEditForm] = useState<{ date: string; reference: string; description: string; lines: EditFormLine[] }>({
        date: '', reference: '', description: '', lines: []
    });
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [expandedEntryIds, setExpandedEntryIds] = useState<Set<string>>(() => new Set());

    const toggleExpanded = useCallback((id: string) => {
        setExpandedEntryIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const colSpan = isAdmin ? 7 : 6;

    const filteredEntries = entries.filter((e: any) => {
        const matchesSearch = !searchTerm ||
            (e.reference || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (e.description || '').toLowerCase().includes(searchTerm.toLowerCase());

        const matchesSource = sourceFilter === 'all' || e.sourceModule === sourceFilter;

        return matchesSearch && matchesSource;
    });

    const getSourceBadge = (source: string) => {
        switch (source) {
            case 'POS':
                return <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded text-xs font-semibold uppercase">POS Sale</span>;
            case 'MobileApp':
                return <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded text-xs font-semibold uppercase">Mobile App</span>;
            case 'Manual':
                return <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded text-xs font-semibold uppercase">Manual</span>;
            default:
                return <span className="px-2 py-0.5 bg-muted dark:bg-slate-800 text-muted-foreground rounded text-xs font-semibold uppercase">{source || 'System'}</span>;
        }
    };

    const openEditModal = (entry: any) => {
        const dateStr = typeof entry.date === 'string' ? entry.date.slice(0, 10) : new Date(entry.date).toISOString().slice(0, 10);
        const mappedLines = (entry.lines || []).map((l: any) => ({
            accountId: l.accountId,
            description: '',
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0
        }));
        const lines = mappedLines.length >= 2 ? mappedLines : [
            ...mappedLines,
            ...Array.from({ length: Math.max(0, 2 - mappedLines.length) }, () => ({ accountId: '', description: '', debit: 0, credit: 0 }))
        ];
        setEditingEntry(entry);
        setEditForm({
            date: dateStr,
            reference: entry.reference || '',
            description: entry.description || '',
            lines
        });
    };

    const handleEditLineChange = (index: number, field: keyof EditFormLine, value: any) => {
        const newLines = [...editForm.lines];
        newLines[index] = { ...newLines[index], [field]: value };
        setEditForm(prev => ({ ...prev, lines: newLines }));
    };

    const handleAddEditLine = () => {
        setEditForm(prev => ({
            ...prev,
            lines: [...prev.lines, { accountId: '', description: '', debit: 0, credit: 0 }]
        }));
    };

    const handleRemoveEditLine = (index: number) => {
        if (editForm.lines.length <= 2) return;
        setEditForm(prev => ({
            ...prev,
            lines: prev.lines.filter((_, i) => i !== index)
        }));
    };

    const totalDebit = editForm.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const totalCredit = editForm.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    const isEditBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

    const handleSaveEdit = async () => {
        if (!editingEntry || !isEditBalanced) return;
        setActionLoading(true);
        try {
            await updateJournalEntry(editingEntry.id, {
                date: editForm.date,
                reference: editForm.reference,
                description: editForm.description,
                lines: editForm.lines.map(l => {
                    const acc = accounts.find((a: any) => a.id === l.accountId);
                    return {
                        accountId: l.accountId,
                        debit: Number(l.debit),
                        credit: Number(l.credit),
                        description: l.description
                    };
                })
            });
            setEditingEntry(null);
        } catch (e: any) {
            alert(e?.message || 'Failed to update entry');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!deleteConfirmId) return;
        setActionLoading(true);
        try {
            await deleteJournalEntry(deleteConfirmId);
            setDeleteConfirmId(null);
        } catch (e: any) {
            alert(e?.message || 'Failed to delete entry');
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="animate-fade-in flex flex-col gap-4 sm:gap-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="relative group w-full min-w-0 sm:max-w-xs sm:flex-1 lg:w-72 lg:flex-none">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
                            {ICONS.search}
                        </div>
                        <input
                            type="text"
                            className="block w-full rounded-xl border border-border bg-card py-2 pl-10 pr-3 text-xs leading-5 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:placeholder:text-slate-500 dark:text-slate-100"
                            placeholder="Search by Reference, Description..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="flex min-w-0 flex-wrap rounded-xl border border-border bg-card p-1 dark:border-slate-700 dark:bg-slate-900">
                        {(['all', 'POS', 'MobileApp', 'Manual'] as const).map(filter => (
                            <button
                                key={filter}
                                type="button"
                                onClick={() => setSourceFilter(filter)}
                                className={`rounded-lg px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-all sm:px-3 sm:text-xs sm:tracking-widest ${sourceFilter === filter
                                    ? 'bg-slate-900 text-white shadow dark:bg-indigo-600'
                                    : 'text-muted-foreground hover:text-foreground dark:hover:text-slate-300'
                                    }`}
                            >
                                {filter === 'all' ? 'All' : filter === 'MobileApp' ? 'Mobile' : filter}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end lg:flex-nowrap">
                    <span className="text-xs font-bold text-muted-foreground">{filteredEntries.length} entries</span>
                    <button
                        type="button"
                        className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground transition-all hover:bg-muted/50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 sm:px-4"
                    >
                        {ICONS.export} Export CSV
                    </button>
                </div>
            </div>

            <Card
                padding="none"
                className="border-none shadow-sm dark:border dark:border-slate-700/80 dark:bg-slate-900/40"
            >
                {loading ? (
                    <div className="py-20 text-center">
                        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div>
                        <p className="mt-2 text-xs text-muted-foreground">Loading ledger entries...</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left">
                            <thead className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">
                                <tr>
                                    <th className="sticky top-0 z-20 whitespace-nowrap border-b border-border bg-zinc-100 px-3 py-3 text-left shadow-[0_1px_0_0_rgb(0_0_0_/_0.06)] dark:border-slate-700 dark:bg-slate-800 dark:shadow-[0_1px_0_0_rgb(255_255_255_/_0.06)] sm:px-4">
                                        Date
                                    </th>
                                    <th className="sticky top-0 z-20 whitespace-nowrap border-b border-border bg-zinc-100 px-3 py-3 text-left shadow-[0_1px_0_0_rgb(0_0_0_/_0.06)] dark:border-slate-700 dark:bg-slate-800 dark:shadow-[0_1px_0_0_rgb(255_255_255_/_0.06)] sm:px-4">
                                        Reference
                                    </th>
                                    <th className="sticky top-0 z-20 min-w-[8rem] border-b border-border bg-zinc-100 px-3 py-3 text-left shadow-[0_1px_0_0_rgb(0_0_0_/_0.06)] dark:border-slate-700 dark:bg-slate-800 dark:shadow-[0_1px_0_0_rgb(255_255_255_/_0.06)] sm:px-4">
                                        Posting detail
                                    </th>
                                    <th className="sticky top-0 z-20 whitespace-nowrap border-b border-border bg-zinc-100 px-3 py-3 text-right shadow-[0_1px_0_0_rgb(0_0_0_/_0.06)] dark:border-slate-700 dark:bg-slate-800 dark:shadow-[0_1px_0_0_rgb(255_255_255_/_0.06)] sm:px-4">
                                        Debit
                                    </th>
                                    <th className="sticky top-0 z-20 whitespace-nowrap border-b border-border bg-zinc-100 px-3 py-3 text-right shadow-[0_1px_0_0_rgb(0_0_0_/_0.06)] dark:border-slate-700 dark:bg-slate-800 dark:shadow-[0_1px_0_0_rgb(255_255_255_/_0.06)] sm:px-4">
                                        Credit
                                    </th>
                                    <th className="sticky top-0 z-20 whitespace-nowrap border-b border-border bg-zinc-100 px-3 py-3 text-center shadow-[0_1px_0_0_rgb(0_0_0_/_0.06)] dark:border-slate-700 dark:bg-slate-800 dark:shadow-[0_1px_0_0_rgb(255_255_255_/_0.06)] sm:px-4">
                                        Source
                                    </th>
                                    {isAdmin && (
                                        <th className="sticky top-0 z-20 w-28 whitespace-nowrap border-b border-border bg-zinc-100 px-3 py-3 text-center shadow-[0_1px_0_0_rgb(0_0_0_/_0.06)] dark:border-slate-700 dark:bg-slate-800 dark:shadow-[0_1px_0_0_rgb(255_255_255_/_0.06)] sm:px-4">
                                            Actions
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {filteredEntries.length > 0 ? (
                                    filteredEntries.flatMap((entry: any) => {
                                        const expanded = expandedEntryIds.has(entry.id);
                                        const { debit: totalDebit, credit: totalCredit } = sumEntryLines(entry.lines);
                                        const lineCount = (entry.lines || []).length;

                                        const summaryRow = (
                                            <tr
                                                key={entry.id}
                                                className="cursor-pointer bg-card transition-colors hover:bg-muted/40 dark:bg-transparent dark:hover:bg-slate-800/60"
                                                onClick={() => toggleExpanded(entry.id)}
                                            >
                                                <td className="px-3 py-2.5 align-middle sm:px-4 sm:py-3">
                                                    <div className="flex items-center gap-1.5 sm:gap-2">
                                                        <button
                                                            type="button"
                                                            aria-expanded={expanded}
                                                            aria-controls={`ledger-lines-${entry.id}`}
                                                            id={`ledger-expand-${entry.id}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleExpanded(entry.id);
                                                            }}
                                                            className="inline-flex shrink-0 rounded-md text-muted-foreground transition hover:bg-muted/80 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                                            title={expanded ? 'Collapse lines' : 'Expand lines'}
                                                        >
                                                            <span
                                                                className={`inline-flex transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
                                                                aria-hidden
                                                            >
                                                                {React.cloneElement(ICONS.chevronRight as React.ReactElement<any>, { width: 14, height: 14 })}
                                                            </span>
                                                            <span className="sr-only">{expanded ? 'Collapse posting lines' : 'Expand posting lines'}</span>
                                                        </button>
                                                        <span className="whitespace-nowrap text-xs font-semibold text-muted-foreground">
                                                            {new Date(entry.date).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="max-w-[10rem] px-3 py-2.5 align-middle sm:max-w-none sm:px-4 sm:py-3">
                                                    <span
                                                        title={entry.reference}
                                                        className="inline-block max-w-full truncate font-mono text-[11px] font-bold uppercase tracking-tighter text-indigo-600 dark:text-indigo-400 sm:text-xs"
                                                    >
                                                        {entry.reference}
                                                    </span>
                                                </td>
                                                <td className="max-w-[14rem] px-3 py-2.5 align-middle sm:max-w-md sm:px-4 sm:py-3 lg:max-w-lg">
                                                    <div className="flex min-w-0 flex-col gap-0.5">
                                                        <span title={entry.description} className="truncate text-xs font-semibold text-foreground">
                                                            {entry.description || '—'}
                                                        </span>
                                                        {!expanded && lineCount > 0 && (
                                                            <span className="text-[10px] font-medium text-muted-foreground">
                                                                {lineCount} line{lineCount === 1 ? '' : 's'} · click to expand
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-2.5 text-right align-middle font-mono text-xs font-semibold tabular-nums text-foreground sm:px-4 sm:py-3 sm:text-sm">
                                                    {totalDebit > 0 ? Number(totalDebit).toLocaleString() : '—'}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-2.5 text-right align-middle font-mono text-xs font-semibold tabular-nums text-muted-foreground sm:px-4 sm:py-3 sm:text-sm">
                                                    {totalCredit > 0 ? Number(totalCredit).toLocaleString() : '—'}
                                                </td>
                                                <td className="px-2 py-2.5 text-center align-middle sm:px-4 sm:py-3">
                                                    <div className="flex justify-center">{getSourceBadge(entry.sourceModule)}</div>
                                                </td>
                                                {isAdmin && (
                                                    <td className="px-2 py-2.5 text-center align-middle sm:px-4 sm:py-3">
                                                        <div className="flex items-center justify-center gap-0.5">
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    openEditModal(entry);
                                                                }}
                                                                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-400"
                                                                title="Edit entry"
                                                            >
                                                                {React.cloneElement(ICONS.edit as React.ReactElement<any>, { width: 16, height: 16 })}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setDeleteConfirmId(entry.id);
                                                                }}
                                                                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                                                                title="Delete entry"
                                                            >
                                                                {React.cloneElement(ICONS.trash as React.ReactElement<any>, { width: 16, height: 16 })}
                                                            </button>
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        );

                                        if (!expanded) return [summaryRow];

                                        const detailRow = (
                                            <tr key={`${entry.id}-detail`} className="bg-muted/25 dark:bg-slate-900/50">
                                                <td colSpan={colSpan} className="border-t border-border p-0 dark:border-slate-700">
                                                    <div
                                                        id={`ledger-lines-${entry.id}`}
                                                        role="region"
                                                        aria-labelledby={`ledger-expand-${entry.id}`}
                                                        className="px-3 py-3 sm:px-6 sm:py-4"
                                                    >
                                                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Posting lines</p>
                                                        <div className="overflow-x-auto rounded-lg border border-border bg-card dark:border-slate-700 dark:bg-slate-900/80">
                                                            <table className="w-full min-w-[520px] text-left text-xs">
                                                                <thead className="bg-muted/80 text-[10px] font-semibold uppercase text-muted-foreground dark:bg-slate-800">
                                                                    <tr>
                                                                        <th className="px-3 py-2 sm:px-4">Account</th>
                                                                        <th className="px-3 py-2 text-right sm:px-4">Debit</th>
                                                                        <th className="px-3 py-2 text-right sm:px-4">Credit</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                                                    {(entry.lines || []).map((line: any, idx: number) => (
                                                                        <tr key={`${entry.id}-line-${idx}`}>
                                                                            <td className="px-3 py-2 sm:px-4">
                                                                                <div className="border-l-2 border-indigo-200 pl-3 font-semibold italic text-foreground dark:border-indigo-800">
                                                                                    {line.accountCode} — {line.accountName}
                                                                                </div>
                                                                            </td>
                                                                            <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums sm:px-4">
                                                                                {line.debit > 0 ? Number(line.debit).toLocaleString() : '—'}
                                                                            </td>
                                                                            <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-muted-foreground sm:px-4">
                                                                                {line.credit > 0 ? Number(line.credit).toLocaleString() : '—'}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        );

                                        return [summaryRow, detailRow];
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={colSpan} className="px-6 py-20 text-center text-slate-300 dark:text-slate-500 italic">
                                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/80 dark:bg-slate-800">
                                                {React.cloneElement(ICONS.clipboard as React.ReactElement<any>, { width: 32, height: 32 })}
                                            </div>
                                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground dark:text-slate-400">No ledger entries found</p>
                                            <p className="mt-1 text-xs text-slate-300 dark:text-slate-500">Complete a sale to generate automatic journal entries</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Edit Journal Entry Modal */}
            <Modal
                isOpen={!!editingEntry}
                onClose={() => { setEditingEntry(null); }}
                title="Edit Ledger Entry"
                size="xl"
            >
                <div className="space-y-6">
                    <div className="grid grid-cols-3 gap-4">
                        <Input
                            label="Date"
                            type="date"
                            value={editForm.date}
                            onChange={(e) => setEditForm(prev => ({ ...prev, date: e.target.value }))}
                        />
                        <Input
                            label="Reference #"
                            placeholder="e.g. ADJ-001"
                            value={editForm.reference}
                            onChange={(e) => setEditForm(prev => ({ ...prev, reference: e.target.value }))}
                        />
                        <Input
                            label="Description"
                            placeholder="Reason for entry..."
                            value={editForm.description}
                            onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                        />
                    </div>

                    <div className="bg-muted/80 dark:bg-slate-800 border border-border dark:border-slate-700 rounded-xl overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-muted dark:bg-slate-800 text-xs uppercase font-semibold text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 w-[30%]">Account</th>
                                    <th className="px-4 py-3 w-[30%]">Description</th>
                                    <th className="px-4 py-3 w-[15%] text-right">Debit</th>
                                    <th className="px-4 py-3 w-[15%] text-right">Credit</th>
                                    <th className="px-4 py-3 w-[5%]"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {editForm.lines.map((line, idx) => (
                                    <tr key={idx}>
                                        <td className="px-4 py-2">
                                            <Select
                                                value={line.accountId}
                                                onChange={(e) => handleEditLineChange(idx, 'accountId', e.target.value)}
                                                className="border-none bg-transparent focus:ring-0 text-xs font-bold w-full"
                                                hideIcon
                                            >
                                                <option value="">Select Account</option>
                                                {accounts.map((acc: any) => (
                                                    <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
                                                ))}
                                            </Select>
                                        </td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="text"
                                                placeholder="Line description"
                                                className="w-full bg-transparent border-none text-xs focus:ring-0 placeholder-slate-300 dark:placeholder-slate-600 dark:text-slate-100"
                                                value={line.description || ''}
                                                onChange={(e) => handleEditLineChange(idx, 'description', e.target.value)}
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="number"
                                                aria-label={`Line ${idx + 1} debit`}
                                                className="w-full bg-transparent border-none text-right font-mono text-sm focus:ring-0 dark:text-slate-100"
                                                value={line.debit}
                                                onChange={(e) => handleEditLineChange(idx, 'debit', e.target.value)}
                                                onFocus={(e) => e.target.select()}
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="number"
                                                aria-label={`Line ${idx + 1} credit`}
                                                className="w-full bg-transparent border-none text-right font-mono text-sm focus:ring-0 dark:text-slate-100"
                                                value={line.credit}
                                                onChange={(e) => handleEditLineChange(idx, 'credit', e.target.value)}
                                                onFocus={(e) => e.target.select()}
                                            />
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveEditLine(idx)}
                                                className="text-slate-300 dark:text-muted-foreground hover:text-rose-500 transition-colors"
                                                disabled={editForm.lines.length <= 2}
                                            >
                                                {ICONS.x}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-muted/80 dark:bg-slate-800 font-bold text-xs border-t border-border dark:border-slate-700">
                                <tr>
                                    <td colSpan={2} className="px-4 py-3">
                                        <button
                                            type="button"
                                            onClick={handleAddEditLine}
                                            className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                                        >
                                            {ICONS.plus} Add Line
                                        </button>
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">{totalDebit.toFixed(2)}</td>
                                    <td className="px-4 py-3 text-right font-mono">{totalCredit.toFixed(2)}</td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className={`text-sm font-bold ${isEditBalanced ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {isEditBalanced ? 'Balanced' : `Unbalanced Difference: ${Math.abs(totalDebit - totalCredit).toFixed(2)}`}
                        </div>
                        <div className="flex gap-3">
                            <Button variant="secondary" onClick={() => setEditingEntry(null)}>Cancel</Button>
                            <Button
                                onClick={handleSaveEdit}
                                disabled={!isEditBalanced || editForm.lines.some(l => !l.accountId) || actionLoading}
                            >
                                {actionLoading ? 'Saving...' : 'Update Entry'}
                            </Button>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Delete confirmation */}
            <Modal
                isOpen={!!deleteConfirmId}
                onClose={() => setDeleteConfirmId(null)}
                title="Delete Ledger Entry"
                size="sm"
            >
                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        This will remove the journal entry and all its lines. Account balances and report aggregates will be updated to stay in sync. This cannot be undone.
                    </p>
                    <div className="flex justify-end gap-3">
                        <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
                        <Button variant="primary" onClick={handleDeleteConfirm} disabled={actionLoading} className="bg-rose-600 hover:bg-rose-700">
                            {actionLoading ? 'Deleting...' : 'Delete Entry'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default GeneralLedger;
