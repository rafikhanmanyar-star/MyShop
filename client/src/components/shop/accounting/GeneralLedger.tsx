
import React, { useState } from 'react';
import { useAccounting } from '../../../context/AccountingContext';
import { useAuth } from '../../../context/AuthContext';
import { CURRENCY, ICONS } from '../../../constants';
import Card from '../../ui/Card';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Button from '../../ui/Button';

type EditFormLine = { accountId: string; description?: string; debit: number; credit: number };

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
                return <span className="px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded text-[9px] font-black uppercase">POS Sale</span>;
            case 'MobileApp':
                return <span className="px-2 py-0.5 bg-emerald-100 text-emerald-600 rounded text-[9px] font-black uppercase">Mobile App</span>;
            case 'Manual':
                return <span className="px-2 py-0.5 bg-amber-100 text-amber-600 rounded text-[9px] font-black uppercase">Manual</span>;
            default:
                return <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-black uppercase">{source || 'System'}</span>;
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
        <div className="space-y-6 animate-fade-in shadow-inner flex flex-col h-full">
            <div className="flex justify-between items-center mb-4">
                <div className="flex gap-3 items-center">
                    <div className="relative group w-72">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            {ICONS.search}
                        </div>
                        <input
                            type="text"
                            className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-xs"
                            placeholder="Search by Reference, Description..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* Source Filter */}
                    <div className="flex bg-white border border-slate-200 rounded-xl p-1">
                        {(['all', 'POS', 'MobileApp', 'Manual'] as const).map(filter => (
                            <button
                                key={filter}
                                onClick={() => setSourceFilter(filter)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${sourceFilter === filter
                                    ? 'bg-slate-900 text-white shadow'
                                    : 'text-slate-400 hover:text-slate-600'
                                    }`}
                            >
                                {filter === 'all' ? 'All' : filter === 'MobileApp' ? 'Mobile' : filter}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex gap-2 items-center">
                    <span className="text-[10px] font-bold text-slate-400">{filteredEntries.length} entries</span>
                    <button className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-2">
                        {ICONS.export} Export CSV
                    </button>
                </div>
            </div>

            <Card className="border-none shadow-sm overflow-hidden flex-1 overflow-y-auto">
                {loading ? (
                    <div className="py-20 text-center">
                        <div className="animate-spin inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full"></div>
                        <p className="text-xs text-slate-400 mt-2">Loading ledger entries...</p>
                    </div>
                ) : (
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 sticky top-0 z-20">
                            <tr>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Reference</th>
                                <th className="px-6 py-4">Posting Detail</th>
                                <th className="px-6 py-4 text-right">Debit</th>
                                <th className="px-6 py-4 text-right">Credit</th>
                                <th className="px-6 py-4 text-center">Source</th>
                                {isAdmin && <th className="px-6 py-4 text-center w-28">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredEntries.length > 0 ? filteredEntries.map((entry: any) => (
                                <React.Fragment key={entry.id}>
                                    <tr className="bg-slate-50/50">
                                        <td className="px-6 py-4 text-xs font-bold text-slate-600">
                                            {new Date(entry.date).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="font-mono text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-1 rounded uppercase tracking-tighter">
                                                {entry.reference}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-xs font-black text-slate-800">{entry.description}</div>
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono font-black text-sm text-slate-900 border-t border-slate-200" colSpan={2}>
                                            {/* Entry level total */}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {getSourceBadge(entry.sourceModule)}
                                        </td>
                                        {isAdmin && (
                                            <td className="px-6 py-4 text-center align-middle">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => openEditModal(entry)}
                                                        className="p-1.5 rounded-lg text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                                                        title="Edit entry"
                                                    >
                                                        {React.cloneElement(ICONS.edit as React.ReactElement<any>, { width: 16, height: 16 })}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDeleteConfirmId(entry.id)}
                                                        className="p-1.5 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                                                        title="Delete entry"
                                                    >
                                                        {React.cloneElement(ICONS.trash as React.ReactElement<any>, { width: 16, height: 16 })}
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                    {(entry.lines || []).map((line: any, idx: number) => (
                                        <tr key={`${entry.id}-${idx}`} className="hover:bg-slate-50/30">
                                            <td colSpan={2}></td>
                                            <td className="px-6 py-3">
                                                <div className="text-xs font-bold text-slate-700 pl-4 border-l-2 border-indigo-100 italic">
                                                    {line.accountCode} — {line.accountName}
                                                </div>
                                            </td>
                                            <td className="px-6 py-3 text-right">
                                                {line.debit > 0 && <span className="font-mono text-xs font-bold text-slate-800">{Number(line.debit).toLocaleString()}</span>}
                                            </td>
                                            <td className="px-6 py-3 text-right">
                                                {line.credit > 0 && <span className="font-mono text-xs font-bold text-slate-600">{Number(line.credit).toLocaleString()}</span>}
                                            </td>
                                            <td></td>
                                            {isAdmin && <td></td>}
                                        </tr>
                                    ))}
                                </React.Fragment>
                            )) : (
                                <tr>
                                    <td colSpan={isAdmin ? 7 : 6} className="px-6 py-20 text-center text-slate-300 italic">
                                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                            {React.cloneElement(ICONS.clipboard as React.ReactElement<any>, { width: 32, height: 32 })}
                                        </div>
                                        <p className="font-bold uppercase tracking-[0.2em] text-[10px]">No ledger entries found</p>
                                        <p className="text-[10px] text-slate-300 mt-1">Complete a sale to generate automatic journal entries</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
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

                    <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-slate-100 text-[10px] uppercase font-black text-slate-500">
                                <tr>
                                    <th className="px-4 py-3 w-[30%]">Account</th>
                                    <th className="px-4 py-3 w-[30%]">Description</th>
                                    <th className="px-4 py-3 w-[15%] text-right">Debit</th>
                                    <th className="px-4 py-3 w-[15%] text-right">Credit</th>
                                    <th className="px-4 py-3 w-[5%]"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
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
                                                className="w-full bg-transparent border-none text-xs focus:ring-0 placeholder-slate-300"
                                                value={line.description || ''}
                                                onChange={(e) => handleEditLineChange(idx, 'description', e.target.value)}
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="number"
                                                aria-label={`Line ${idx + 1} debit`}
                                                className="w-full bg-transparent border-none text-right font-mono text-sm focus:ring-0"
                                                value={line.debit}
                                                onChange={(e) => handleEditLineChange(idx, 'debit', e.target.value)}
                                                onFocus={(e) => e.target.select()}
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="number"
                                                aria-label={`Line ${idx + 1} credit`}
                                                className="w-full bg-transparent border-none text-right font-mono text-sm focus:ring-0"
                                                value={line.credit}
                                                onChange={(e) => handleEditLineChange(idx, 'credit', e.target.value)}
                                                onFocus={(e) => e.target.select()}
                                            />
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveEditLine(idx)}
                                                className="text-slate-300 hover:text-rose-500 transition-colors"
                                                disabled={editForm.lines.length <= 2}
                                            >
                                                {ICONS.x}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-50 font-bold text-xs border-t border-slate-200">
                                <tr>
                                    <td colSpan={2} className="px-4 py-3">
                                        <button
                                            type="button"
                                            onClick={handleAddEditLine}
                                            className="text-indigo-600 hover:underline flex items-center gap-1"
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
                    <p className="text-sm text-slate-600">
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
