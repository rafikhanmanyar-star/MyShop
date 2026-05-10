import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, ClipboardList, FileText, DollarSign, Receipt, Landmark, Layers } from 'lucide-react';
import { AccountingProvider, useAccounting } from '../../context/AccountingContext';
import AccountingDashboard from './accounting/AccountingDashboard';
import GeneralLedger from './accounting/GeneralLedger';
import FinancialStatements from './accounting/FinancialStatements';
import { ICONS, CURRENCY } from '../../constants';
import { accountingApi } from '../../services/shopApi';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import { FinancialHeader } from './accounting/ledger/FinancialHeader';
import { KPIStatCard } from './accounting/ledger/KPIStatCard';
import { FinancialTabs } from './accounting/ledger/FinancialTabs';

const ACCT_TAB_IDS = ['dashboard', 'ledger', 'statements'] as const;
type AcctTabId = (typeof ACCT_TAB_IDS)[number];

const AccountingContent: React.FC = () => {
    const { accounts, postJournalEntry, totalRevenue, totalExpenses, netProfit, loading, journalEntries } = useAccounting();
    const ledgerCsvExportRef = useRef<(() => void) | null>(null);
    const [journalEntryTotal, setJournalEntryTotal] = useState<number | null>(null);

    const fmtPk = useCallback((n: number) => {
        try {
            return new Intl.NumberFormat(undefined, { style: 'currency', currency: CURRENCY }).format(n);
        } catch {
            return `${CURRENCY} ${Number(n || 0).toLocaleString()}`;
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await accountingApi.getJournalEntriesPage({ page: 1, limit: 1 });
                if (!cancelled) setJournalEntryTotal(res.total ?? 0);
            } catch {
                if (!cancelled) setJournalEntryTotal(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [journalEntries.length]);
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<AcctTabId>(() => {
        try {
            const p = new URLSearchParams(window.location.search).get('tab');
            if (p === 'ledger' || p === 'statements') return p;
        } catch {
            /* empty */
        }
        return 'dashboard';
    });
    const [isJournalModalOpen, setIsJournalModalOpen] = useState(false);

    const [journalData, setJournalData] = useState({
        date: new Date().toISOString().split('T')[0],
        reference: '',
        description: '',
        lines: [
            { accountId: '', description: '', debit: 0, credit: 0 },
            { accountId: '', description: '', debit: 0, credit: 0 }
        ]
    });

    const handleAddLine = () => {
        setJournalData(prev => ({
            ...prev,
            lines: [...prev.lines, { accountId: '', description: '', debit: 0, credit: 0 }]
        }));
    };

    const handleLineChange = (index: number, field: string, value: any) => {
        const newLines = [...journalData.lines];
        newLines[index] = { ...newLines[index], [field]: value };
        setJournalData(prev => ({ ...prev, lines: newLines }));
    };

    const handleRemoveLine = (index: number) => {
        if (journalData.lines.length <= 2) return;
        setJournalData(prev => ({
            ...prev,
            lines: prev.lines.filter((_, i) => i !== index)
        }));
    };

    const totalDebit = journalData.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
    const totalCredit = journalData.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

    const handlePostJournal = async () => {
        if (!isBalanced) {
            alert("Journal entry must be balanced!");
            return;
        }

        try {
            const ret = await postJournalEntry({
                date: journalData.date,
                reference: journalData.reference,
                description: journalData.description,
                lines: journalData.lines.map(l => {
                    const acc = accounts.find(a => a.id === l.accountId);
                    return {
                        accountId: l.accountId,
                        accountName: acc ? acc.name : 'Unknown',
                        description: l.description || journalData.description,
                        debit: Number(l.debit),
                        credit: Number(l.credit)
                    };
                }),
                sourceModule: 'Manual'
            });
            if (ret && typeof ret === 'object' && 'synced' in ret && !ret.synced) return;
            setIsJournalModalOpen(false);
            setJournalData({
                date: new Date().toISOString().split('T')[0],
                reference: '',
                description: '',
                lines: [
                    { accountId: '', description: '', debit: 0, credit: 0 },
                    { accountId: '', description: '', debit: 0, credit: 0 }
                ]
            });
        } catch (e) {
            alert('Error posting journal entry');
        }
    };

    const setTab = (t: AcctTabId) => {
        setActiveTab(t);
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                if (t === 'dashboard') next.delete('tab');
                else next.set('tab', t);
                if (t !== 'dashboard') next.delete('revenue');
                return next;
            },
            { replace: true }
        );
    };

    useEffect(() => {
        const p = searchParams.get('tab');
        if (p === 'ledger' || p === 'statements') {
            setActiveTab(p);
        } else {
            setActiveTab('dashboard');
        }
    }, [searchParams]);

    const tabItems = [
        { id: 'dashboard', label: 'Finance Dashboard', icon: <BarChart3 className="h-[1.125rem] w-[1.125rem]" aria-hidden /> },
        { id: 'ledger', label: 'General Ledger', icon: <ClipboardList className="h-[1.125rem] w-[1.125rem]" aria-hidden /> },
        { id: 'statements', label: 'Financial Statements', icon: <FileText className="h-[1.125rem] w-[1.125rem]" aria-hidden /> },
    ];

    return (
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-[#F6F8FC] text-foreground dark:bg-[#0F172A] dark:text-[#E5E7EB]">
            <header className="sticky top-0 z-20 shrink-0 border-b border-black/[0.06] bg-white/80 px-4 py-6 shadow-[0_1px_0_0_rgba(15,23,42,0.05)] backdrop-blur-xl backdrop-saturate-[1.35] dark:border-white/[0.08] dark:bg-slate-900/72 sm:px-6 lg:px-8">
                <FinancialHeader
                    exportDisabled={activeTab !== 'ledger'}
                    onExportCsv={() => ledgerCsvExportRef.current?.()}
                    onManualJournal={() => setIsJournalModalOpen(true)}
                />

                <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <KPIStatCard
                        label="Total Revenue"
                        value={fmtPk(totalRevenue)}
                        helper="Rolling chart-of-accounts totals"
                        icon={DollarSign}
                        trend={totalRevenue > 0 ? 'up' : 'flat'}
                        loading={loading}
                    />
                    <KPIStatCard
                        label="Total Expenses"
                        value={fmtPk(totalExpenses)}
                        helper="Operating & COGS-linked lines"
                        icon={Receipt}
                        trend="flat"
                        loading={loading}
                    />
                    <KPIStatCard
                        label="Net Profit"
                        value={fmtPk(netProfit)}
                        helper={netProfit >= 0 ? 'Healthy margin corridor' : 'Review cost drivers'}
                        icon={Landmark}
                        trend={netProfit >= 0 ? 'up' : 'down'}
                        loading={loading}
                    />
                    <KPIStatCard
                        label="Journal Entries"
                        value={journalEntryTotal !== null ? journalEntryTotal.toLocaleString() : '—'}
                        helper="Distinct journal headers in tenant"
                        icon={Layers}
                        trend="flat"
                        loading={journalEntryTotal === null}
                    />
                </div>

                <div className="mt-10 border-t border-black/[0.05] pt-5 dark:border-white/[0.08]">
                    <FinancialTabs
                        tabs={tabItems}
                        activeId={activeTab}
                        onChange={(id) => setTab(id as AcctTabId)}
                    />
                </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {activeTab === 'dashboard' && (
                    <section
                        id="financial-tabpanel-dashboard"
                        role="tabpanel"
                        aria-labelledby="financial-tab-dashboard"
                        className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6 lg:p-8"
                    >
                        <AccountingDashboard />
                    </section>
                )}
                {activeTab === 'ledger' && (
                    <section
                        id="financial-tabpanel-ledger"
                        role="tabpanel"
                        aria-labelledby="financial-tab-ledger"
                        className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-6 sm:px-6 lg:px-8"
                    >
                        <GeneralLedger
                            onExportCsvReady={(fn) => {
                                ledgerCsvExportRef.current = fn;
                            }}
                            onRequestManualJournal={() => setIsJournalModalOpen(true)}
                        />
                    </section>
                )}
                {activeTab === 'statements' && (
                    <section
                        id="financial-tabpanel-statements"
                        role="tabpanel"
                        aria-labelledby="financial-tab-statements"
                        className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6 lg:p-8"
                    >
                        <FinancialStatements />
                    </section>
                )}
            </div>

            <Modal
                isOpen={isJournalModalOpen}
                onClose={() => setIsJournalModalOpen(false)}
                title="New Manual Journal Entry"
                size="xl"
            >
                <div className="space-y-6">
                    <div className="grid grid-cols-3 gap-4">
                        <Input
                            label="Date"
                            type="date"
                            value={journalData.date}
                            onChange={(e) => setJournalData(prev => ({ ...prev, date: e.target.value }))}
                        />
                        <Input
                            label="Reference #"
                            placeholder="e.g. ADJ-001"
                            value={journalData.reference}
                            onChange={(e) => setJournalData(prev => ({ ...prev, reference: e.target.value }))}
                        />
                        <Input
                            label="Description"
                            placeholder="Reason for entry..."
                            value={journalData.description}
                            onChange={(e) => setJournalData(prev => ({ ...prev, description: e.target.value }))}
                        />
                    </div>

                    <div className="bg-muted/80 dark:bg-slate-800 border border-border dark:border-slate-700 rounded-xl overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-muted dark:bg-slate-700 text-xs uppercase font-semibold text-muted-foreground dark:text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 w-[30%]">Account</th>
                                    <th className="px-4 py-3 w-[30%]">Description</th>
                                    <th className="px-4 py-3 w-[15%] text-right">Debit</th>
                                    <th className="px-4 py-3 w-[15%] text-right">Credit</th>
                                    <th className="px-4 py-3 w-[5%]"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {journalData.lines.map((line, idx) => (
                                    <tr key={idx}>
                                        <td className="px-4 py-2">
                                            <Select
                                                value={line.accountId}
                                                onChange={(e) => handleLineChange(idx, 'accountId', e.target.value)}
                                                className="border-none bg-transparent focus:ring-0 text-xs font-bold w-full"
                                                hideIcon
                                            >
                                                <option value="">Select Account</option>
                                                {accounts.map(acc => (
                                                    <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
                                                ))}
                                            </Select>
                                        </td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="text"
                                                placeholder="Line description"
                                                className="w-full bg-transparent border-none text-xs focus:ring-0 placeholder-slate-300 dark:placeholder-slate-600 dark:text-slate-100"
                                                value={line.description}
                                                onChange={(e) => handleLineChange(idx, 'description', e.target.value)}
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="number"
                                                className="w-full bg-transparent border-none text-right font-mono text-sm focus:ring-0 dark:text-slate-100"
                                                value={line.debit}
                                                onChange={(e) => handleLineChange(idx, 'debit', e.target.value)}
                                                onFocus={(e) => e.target.select()}
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="number"
                                                className="w-full bg-transparent border-none text-right font-mono text-sm focus:ring-0 dark:text-slate-100"
                                                value={line.credit}
                                                onChange={(e) => handleLineChange(idx, 'credit', e.target.value)}
                                                onFocus={(e) => e.target.select()}
                                            />
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            <button
                                                onClick={() => handleRemoveLine(idx)}
                                                className="text-slate-300 dark:text-muted-foreground hover:text-rose-500 transition-colors"
                                                disabled={journalData.lines.length <= 2}
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
                                            onClick={handleAddLine}
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
                        <div className={`text-sm font-bold ${isBalanced ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {isBalanced ? 'Balanced' : `Unbalanced Difference: ${Math.abs(totalDebit - totalCredit).toFixed(2)}`}
                        </div>
                        <div className="flex gap-3">
                            <Button variant="secondary" onClick={() => setIsJournalModalOpen(false)}>Cancel</Button>
                            <Button onClick={handlePostJournal} disabled={!isBalanced || journalData.lines.some(l => !l.accountId)}>
                                Post Journal
                            </Button>
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

const AccountingPage: React.FC = () => {
    return (
        <AccountingProvider>
            <AccountingContent />
        </AccountingProvider>
    );
};

export default AccountingPage;
