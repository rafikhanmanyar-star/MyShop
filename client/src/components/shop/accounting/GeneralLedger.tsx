
import React, { useState } from 'react';
import { useAccounting } from '../../../context/AccountingContext';
import { CURRENCY, ICONS } from '../../../constants';
import Card from '../../ui/Card';

const GeneralLedger: React.FC = () => {
    const { entries, accounts, loading } = useAccounting();
    const [searchTerm, setSearchTerm] = useState('');
    const [sourceFilter, setSourceFilter] = useState<'all' | 'POS' | 'MobileApp' | 'Manual'>('all');

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
                                        </tr>
                                    ))}
                                </React.Fragment>
                            )) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-20 text-center text-slate-300 italic">
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
        </div>
    );
};

export default GeneralLedger;
