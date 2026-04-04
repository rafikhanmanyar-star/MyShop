
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, RefreshCw } from 'lucide-react';
import { useLoyalty } from '../../../context/LoyaltyContext';
import { ICONS, CURRENCY } from '../../../constants';
import Card from '../../ui/Card';
import Modal from '../../ui/Modal';
import { LoyaltyMember, LoyaltyTier } from '../../../types/loyalty';
import { khataApi } from '../../../services/shopApi';
import { mobileOrdersApi } from '../../../services/mobileOrdersApi';

const MemberDirectory: React.FC = () => {
    const navigate = useNavigate();
    const { members, deleteMember, updateMember, transactions } = useLoyalty();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTierFilter, setActiveTierFilter] = useState<LoyaltyTier | 'All'>('All');
    const [selectedMember, setSelectedMember] = useState<LoyaltyMember | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [khataSummary, setKhataSummary] = useState<{ totalDebit: number; totalCredit: number; balance: number } | null | undefined>(undefined);
    const [pwResetOpen, setPwResetOpen] = useState(false);
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [pwResetLoading, setPwResetLoading] = useState(false);

    const closeDetailModal = () => {
        setIsDetailModalOpen(false);
        setPwResetOpen(false);
        setNewPw('');
        setConfirmPw('');
    };

    useEffect(() => {
        if (!selectedMember?.customerId) {
            setKhataSummary(null);
            return;
        }
        setKhataSummary(undefined);
        let cancelled = false;
        khataApi.getCustomerSummary(selectedMember.customerId)
            .then((data) => { if (!cancelled) setKhataSummary(data); })
            .catch(() => { if (!cancelled) setKhataSummary(null); });
        return () => { cancelled = true; };
    }, [selectedMember?.customerId]);

    const showKhataSummary = selectedMember?.customerId && khataSummary != null;

    const filteredMembers = useMemo(() => {
        return members.filter(m => {
            const nameMatch = (m.customerName || '').toLowerCase().includes(searchQuery.toLowerCase());
            const cardMatch = (m.cardNumber || '').toLowerCase().includes(searchQuery.toLowerCase());
            const phoneMatch = (m.phone || '').includes(searchQuery);

            const matchesSearch = nameMatch || cardMatch || phoneMatch;

            const matchesTier = activeTierFilter === 'All' || m.tier === activeTierFilter;

            return matchesSearch && matchesTier;
        });
    }, [members, searchQuery, activeTierFilter]);

    const tierStats = useMemo(() => {
        const stats = {
            Silver: 0,
            Gold: 0,
            Platinum: 0,
            Total: members.length
        };
        members.forEach(m => {
            if (stats[m.tier] !== undefined) stats[m.tier]++;
        });
        return stats;
    }, [members]);

    const handleViewDetails = (member: LoyaltyMember) => {
        setSelectedMember(member);
        setIsDetailModalOpen(true);
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm('Are you sure you want to remove this member from the loyalty program?')) {
            await deleteMember(id);
        }
    };

    const getMemberTransactions = (memberId: string) => {
        return transactions.filter(t => t.memberId === memberId);
    };

    return (
        <div className="space-y-6 animate-fade-in flex flex-col h-full">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Roster', count: tierStats.Total, tier: 'All', color: 'bg-slate-900 dark:bg-slate-200' },
                    { label: 'Silver Tier', count: tierStats.Silver, tier: 'Silver', color: 'bg-slate-400 dark:bg-slate-500' },
                    { label: 'Gold Tier', count: tierStats.Gold, tier: 'Gold', color: 'bg-amber-400 dark:bg-amber-500' },
                    { label: 'Platinum Tier', count: tierStats.Platinum, tier: 'Platinum', color: 'bg-rose-500 dark:bg-rose-400' }
                ].map(stat => (
                    <button
                        key={stat.label}
                        onClick={() => setActiveTierFilter(stat.tier as any)}
                        className={`p-4 rounded-2xl transition-all shadow-sm flex flex-col items-start gap-1 border-2 ${activeTierFilter === stat.tier ? 'border-rose-500 dark:border-rose-400 ring-2 ring-rose-100 dark:ring-rose-900/50 shadow-lg scale-[1.02]' : 'border-transparent bg-card dark:bg-slate-900/90 hover:border-border dark:hover:border-slate-600'}`}
                    >
                        <div className={`w-2 h-2 rounded-full ${stat.color} mb-1`}></div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{stat.label}</p>
                        <p className="text-xl font-semibold text-foreground">{stat.count}</p>
                    </button>
                ))}
            </div>

            {/* Filter & Search Toolbar */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-card dark:bg-slate-900/90 p-4 rounded-2xl shadow-sm border border-border dark:border-slate-600">
                <div className="relative group flex-1 max-w-md">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-rose-500 dark:group-focus-within:text-rose-400 transition-colors">
                        {ICONS.search}
                    </div>
                    <input
                        type="text"
                        className="block w-full pl-11 pr-4 py-3 bg-muted/80 dark:bg-slate-800/80 border border-border dark:border-slate-600 rounded-xl leading-5 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 dark:focus:border-rose-400 transition-all text-xs font-medium placeholder-slate-400 dark:placeholder-slate-500 text-foreground"
                        placeholder="Search by Name, Card ID, or Phone..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-2">
                    <button className="px-4 py-3 bg-card dark:bg-slate-800 border border-border dark:border-slate-600 rounded-xl text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:bg-muted/50 dark:hover:bg-slate-700 transition-all flex items-center gap-2">
                        {ICONS.download} Export
                    </button>
                </div>
            </div>

            <Card className="border-none shadow-sm overflow-hidden flex-1 flex flex-col bg-card">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-muted/80/80 backdrop-blur-sm sticky top-0 z-10 text-xs font-semibold uppercase text-muted-foreground">
                            <tr>
                                <th className="px-8 py-5">Card / Member</th>
                                <th className="px-6 py-5">Tier Segment</th>
                                <th className="px-6 py-5 text-center">Visits</th>
                                <th className="px-6 py-5 text-right">Points Balance</th>
                                <th className="px-6 py-5 text-right">LTV (Lifetime)</th>
                                <th className="px-6 py-5">Status</th>
                                <th className="px-8 py-5"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-700/80">
                            {filteredMembers.length > 0 ? filteredMembers.map(m => (
                                <tr
                                    key={m.id}
                                    onClick={() => handleViewDetails(m)}
                                    className="hover:bg-rose-50/20 dark:hover:bg-rose-950/30 transition-all group cursor-pointer"
                                >
                                    <td className="px-8 py-5 whitespace-nowrap">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-semibold text-sm transition-all group-hover:scale-110 shadow-sm ${m.tier === 'Platinum' ? 'bg-slate-900 text-rose-500 dark:bg-slate-950 dark:text-rose-400' :
                                                m.tier === 'Gold' ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300' :
                                                    'bg-muted text-muted-foreground dark:bg-slate-800'
                                                }`}>
                                                {m.customerName.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="font-bold text-foreground text-sm group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">{m.customerName}</div>
                                                <div className="text-xs text-muted-foreground font-mono italic tracking-tighter">ID: {m.cardNumber}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5">
                                        <div className="flex flex-col">
                                            <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider inline-block w-fit shadow-sm ${m.tier === 'Platinum' ? 'bg-rose-600 text-white dark:bg-rose-700' :
                                                m.tier === 'Gold' ? 'bg-amber-400 text-amber-900 dark:bg-amber-600 dark:text-amber-950' :
                                                    'bg-slate-200 text-muted-foreground dark:bg-slate-700 dark:text-slate-300'
                                                }`}>
                                                {m.tier} Member
                                            </span>
                                            <span className="text-xs text-muted-foreground italic mt-1 font-medium">Joined {new Date(m.joinDate).toLocaleDateString()}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5 text-center font-semibold text-muted-foreground font-mono text-sm">
                                        {m.visitCount}
                                    </td>
                                    <td className="px-6 py-5 text-right">
                                        <div className="text-sm font-semibold text-foreground font-mono tracking-tighter">{m.pointsBalance.toLocaleString()}</div>
                                        <div className="text-xs text-rose-500 dark:text-rose-400 font-bold uppercase tracking-widest mt-0.5 animate-pulse">Available</div>
                                    </td>
                                    <td className="px-6 py-5 text-right font-mono">
                                        <div className="text-sm font-semibold text-foreground tracking-tighter">${m.totalSpend.toLocaleString()}</div>
                                        <div className="text-xs text-muted-foreground uppercase font-medium">Gross Value</div>
                                    </td>
                                    <td className="px-6 py-5">
                                        <div className="flex items-center gap-1.5 focus:ring-2">
                                            <div className={`w-2 h-2 rounded-full ${m.status === 'Active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] dark:shadow-emerald-500/30' : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{m.status}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5 text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={(e) => handleDelete(m.id, e)}
                                                className="p-2 text-slate-300 dark:text-slate-600 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-all"
                                            >
                                                {ICONS.trash}
                                            </button>
                                            <div className="p-2 text-rose-600">
                                                {ICONS.chevronRight}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={7} className="px-8 py-20 text-center">
                                        <div className="flex flex-col items-center justify-center gap-3">
                                            <div className="p-6 bg-muted/80 dark:bg-slate-800 rounded-3xl text-slate-200 dark:text-slate-500">
                                                {React.cloneElement(ICONS.users as React.ReactElement<any>, { width: 48, height: 48 })}
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-foreground font-semibold tracking-tight text-lg">No Members Found</p>
                                                <p className="text-muted-foreground text-xs font-medium">Try adjusting your filters or search terms.</p>
                                            </div>
                                            <button
                                                onClick={() => { setSearchQuery(''); setActiveTierFilter('All'); }}
                                                className="mt-4 px-6 py-2 bg-slate-900 dark:bg-slate-700 text-white rounded-xl text-xs font-semibold uppercase tracking-widest hover:bg-slate-800 dark:hover:bg-slate-600"
                                            >
                                                Reset Filters
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Member Details Modal */}
            <Modal
                isOpen={isDetailModalOpen}
                onClose={closeDetailModal}
                title="Member Profile Insights"
                size="xl"
            >
                {selectedMember && (
                    <div className="space-y-8 pb-4">
                        <div className="flex flex-col md:flex-row gap-8 items-start">
                            {/* Left Side: Basic Info Card */}
                            <div className="w-full md:w-1/3 space-y-4">
                                <div className="p-8 bg-muted/80 dark:bg-slate-800/80 rounded-[32px] border border-border dark:border-slate-600 flex flex-col items-center text-center">
                                    <div className={`w-28 h-28 rounded-[40px] flex items-center justify-center font-semibold text-4xl mb-6 shadow-xl ${selectedMember.tier === 'Platinum' ? 'bg-slate-900 text-rose-600 dark:bg-slate-950 dark:text-rose-400' :
                                        selectedMember.tier === 'Gold' ? 'bg-amber-400 text-amber-900 dark:bg-amber-600 dark:text-amber-950' :
                                            'bg-card text-slate-300 border-2 border-border dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600'
                                        }`}>
                                        {(selectedMember.customerName || 'U').charAt(0)}
                                    </div>
                                    <h4 className="text-2xl font-semibold text-foreground tracking-tight">{selectedMember.customerName || 'Unnamed Member'}</h4>
                                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-600 dark:text-rose-400 mt-1">{selectedMember.tier} Elite Member</p>

                                    <div className="w-full mt-8 pt-8 border-t border-border dark:border-slate-600 space-y-4">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="font-bold text-muted-foreground uppercase tracking-widest text-xs">Card Number</span>
                                            <span className="font-mono text-foreground font-semibold">{selectedMember.cardNumber}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="font-bold text-muted-foreground uppercase tracking-widest text-xs">Mobile No</span>
                                            <span className="font-mono text-foreground font-semibold">{selectedMember.phone || 'Not Provided'}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="font-bold text-muted-foreground uppercase tracking-widest text-xs">Enrollment</span>
                                            <span className="text-foreground font-semibold">{new Date(selectedMember.joinDate).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setPwResetOpen(true);
                                        setNewPw('');
                                        setConfirmPw('');
                                    }}
                                    className="w-full inline-flex items-center justify-center gap-2 py-3 text-xs font-semibold uppercase tracking-widest text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 border border-rose-200/80 dark:border-rose-800/80 rounded-2xl bg-card hover:bg-rose-50/50 dark:hover:bg-rose-950/30 transition-all"
                                >
                                    <KeyRound className="w-3.5 h-3.5 shrink-0" />
                                    Reset app password
                                </button>

                                <button
                                    className="w-full py-4 bg-muted dark:bg-slate-800 text-muted-foreground rounded-2xl font-semibold text-xs uppercase tracking-widest hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 transition-all border border-transparent dark:border-slate-600 hover:border-rose-100 dark:hover:border-rose-800"
                                    onClick={() => {
                                        if (window.confirm('Deactivate this member?')) {
                                            updateMember(selectedMember.id, { status: selectedMember.status === 'Active' ? 'Inactive' : 'Active' });
                                            closeDetailModal();
                                        }
                                    }}
                                >
                                    {selectedMember.status === 'Active' ? 'Deactivate Membership' : 'Reactivate Membership'}
                                </button>
                            </div>

                            {/* Right Side: Performance stats and history */}
                            <div className="flex-1 space-y-8">
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="p-6 bg-card dark:bg-slate-900/90 border border-border dark:border-slate-600 rounded-3xl shadow-sm">
                                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Points</p>
                                        <p className="text-2xl font-semibold text-rose-600 dark:text-rose-400 font-mono tracking-tighter">{selectedMember.pointsBalance.toLocaleString()}</p>
                                    </div>
                                    <div className="p-6 bg-card dark:bg-slate-900/90 border border-border dark:border-slate-600 rounded-3xl shadow-sm">
                                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Total LTV</p>
                                        <p className="text-2xl font-semibold text-foreground font-mono tracking-tighter">${selectedMember.totalSpend.toLocaleString()}</p>
                                    </div>
                                    <div className="p-6 bg-card dark:bg-slate-900/90 border border-border dark:border-slate-600 rounded-3xl shadow-sm">
                                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Visit Count</p>
                                        <p className="text-2xl font-semibold text-foreground font-mono tracking-tighter">{selectedMember.visitCount}</p>
                                    </div>
                                </div>

                                {showKhataSummary && (
                                    <div className="p-6 bg-amber-50/80 border border-amber-100 rounded-3xl">
                                        <h5 className="text-xs font-semibold uppercase tracking-widest text-amber-800 mb-3 flex items-center gap-2">Khata Summary</h5>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div>
                                                <p className="text-xs font-bold text-amber-700 uppercase tracking-widest">Total Debit</p>
                                                <p className="text-lg font-semibold text-foreground font-mono">{CURRENCY} {(khataSummary ?? { totalDebit: 0 }).totalDebit.toLocaleString()}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest">Total Credit</p>
                                                <p className="text-lg font-semibold text-foreground font-mono">{CURRENCY} {(khataSummary ?? { totalCredit: 0 }).totalCredit.toLocaleString()}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest">Current Balance</p>
                                                <p className={`text-lg font-semibold font-mono ${(khataSummary?.balance ?? 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>{CURRENCY} {(khataSummary ?? { balance: 0 }).balance.toLocaleString()}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <h5 className="text-sm font-semibold text-foreground tracking-tight flex items-center gap-2 uppercase">
                                            {ICONS.barChart} Transaction History
                                        </h5>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!selectedMember.customerId) return;
                                                closeDetailModal();
                                                navigate('/khata', {
                                                    state: {
                                                        customerId: selectedMember.customerId,
                                                        customerName: selectedMember.customerName,
                                                    },
                                                });
                                            }}
                                            className="text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-widest hover:underline disabled:opacity-40 disabled:no-underline"
                                            disabled={!selectedMember.customerId}
                                        >
                                            Full Ledger
                                        </button>
                                    </div>

                                    <div className="bg-muted/80/50 dark:bg-slate-800/50 rounded-3xl border border-border dark:border-slate-600 overflow-hidden">
                                        {getMemberTransactions(selectedMember.id).length > 0 ? (
                                            <div className="divide-y divide-slate-100 dark:divide-slate-700">
                                                {getMemberTransactions(selectedMember.id).map(tx => (
                                                    <div key={tx.id} className="p-4 flex justify-between items-center hover:bg-card dark:hover:bg-slate-800/80 transition-colors">
                                                        <div className="flex items-center gap-4">
                                                            <div className={`p-2 rounded-lg ${tx.type === 'Earn' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400'}`}>
                                                                {tx.type === 'Earn' ? ICONS.plus : ICONS.minus}
                                                            </div>
                                                            <div>
                                                                <p className="text-xs font-bold text-foreground uppercase tracking-tighter">Sale Ref: #{tx.referenceId.slice(-8)}</p>
                                                                <p className="text-xs text-muted-foreground font-medium italic">{new Date(tx.timestamp).toLocaleString()}</p>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className={`text-xs font-semibold font-mono ${tx.type === 'Earn' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                                {tx.type === 'Earn' ? '+' : '-'}{tx.points} Pts
                                                            </p>
                                                            <p className="text-xs text-muted-foreground font-bold uppercase tracking-[0.1em]">Verified</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="p-12 text-center text-slate-300">
                                                <p className="text-xs font-semibold uppercase tracking-widest italic">No transactions recorded yet</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 rounded-2xl flex items-center gap-4 mt-4">
                            <div className="p-3 bg-indigo-100 text-indigo-600 dark:bg-indigo-950/80 dark:text-indigo-400 rounded-xl">
                                {ICONS.trophy}
                            </div>
                            <div className="flex-1">
                                <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-200 uppercase tracking-widest">Tier Evolution</p>
                                <p className="text-xs text-indigo-700 dark:text-indigo-300/90 font-medium">Spending another <span className="font-semibold">$2,400</span> will upgrade this customer to <span className="font-semibold italic underline">Platinum Status</span>.</p>
                            </div>
                            <div className="w-48 h-2 bg-indigo-200 dark:bg-indigo-950 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-600 dark:bg-indigo-500 w-3/4 rounded-full"></div>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Must use the same Modal portal as Member Profile — a non-portaled overlay stays under #root and below z-[9999], so it never appeared. */}
            <Modal
                isOpen={pwResetOpen && !!selectedMember}
                onClose={() => {
                    if (!pwResetLoading) setPwResetOpen(false);
                }}
                title={
                    <span className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-950/80">
                            <KeyRound className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                        </span>
                        <span className="flex flex-col items-start gap-0.5 min-w-0">
                            <span className="truncate">Reset mobile app password</span>
                            <span className="text-xs font-normal text-muted-foreground font-mono">{selectedMember?.phone || '—'}</span>
                        </span>
                    </span>
                }
                size="sm"
            >
                {selectedMember && (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Set a new password for this customer. They will use it to sign in to the mobile ordering app for your shop.
                        </p>
                        <div>
                            <label htmlFor="member-pw-new" className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">New password</label>
                            <input
                                id="member-pw-new"
                                type="password"
                                autoComplete="new-password"
                                value={newPw}
                                onChange={e => setNewPw(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-border dark:border-slate-600 bg-background dark:bg-slate-800/80 text-foreground text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none"
                                placeholder="At least 6 characters"
                            />
                        </div>
                        <div>
                            <label htmlFor="member-pw-confirm" className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Confirm password</label>
                            <input
                                id="member-pw-confirm"
                                type="password"
                                autoComplete="new-password"
                                value={confirmPw}
                                onChange={e => setConfirmPw(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-border dark:border-slate-600 bg-background dark:bg-slate-800/80 text-foreground text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none"
                                placeholder="Repeat new password"
                            />
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setPwResetOpen(false)}
                                disabled={pwResetLoading}
                                className="flex-1 py-2.5 bg-muted text-foreground rounded-xl text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    if (newPw.length < 6) {
                                        alert('Password must be at least 6 characters.');
                                        return;
                                    }
                                    if (newPw !== confirmPw) {
                                        alert('Passwords do not match.');
                                        return;
                                    }
                                    setPwResetLoading(true);
                                    try {
                                        await mobileOrdersApi.resetCustomerPassword(
                                            selectedMember.mobileCustomerId || selectedMember.customerId,
                                            newPw
                                        );
                                        setPwResetOpen(false);
                                        setNewPw('');
                                        setConfirmPw('');
                                        alert('Password updated. The customer can sign in with the new password.');
                                    } catch (err: any) {
                                        const msg = err?.error ?? err?.message ?? (typeof err === 'string' ? err : 'Failed to reset password');
                                        alert(msg);
                                    } finally {
                                        setPwResetLoading(false);
                                    }
                                }}
                                disabled={pwResetLoading}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-rose-600 text-white rounded-xl text-sm font-bold hover:bg-rose-700 transition-colors disabled:opacity-50"
                            >
                                {pwResetLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                                Save password
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default MemberDirectory;
