
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound, RefreshCw, BadgeCheck, Filter, Download, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLoyalty } from '../../../context/LoyaltyContext';
import { ICONS, CURRENCY } from '../../../constants';
import Card from '../../ui/Card';
import Modal from '../../ui/Modal';
import { LoyaltyMember, LoyaltyTier } from '../../../types/loyalty';
import { khataApi, shopApi } from '../../../services/shopApi';
import { mobileOrdersApi } from '../../../services/mobileOrdersApi';

const PAGE_SIZE = 25;
/** Matches `LoyaltyContext` redemption cash value (10 pts ≈ 1 PKR). */
const PKR_PER_POINT = 0.1;

type StatusFilter = 'All' | 'Active' | 'Inactive' | 'Lapsed';
type SortKey = 'ltv_desc' | 'ltv_asc' | 'points_desc' | 'name_asc' | 'visits_desc';

function formatRelativeLastVisit(ts: number | undefined): string {
    if (ts == null || !Number.isFinite(ts)) return 'No visit data';
    const diffMs = Date.now() - ts;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return days === 1 ? '1 day ago' : `${days} days ago`;
    if (days < 30) return `${days} days ago`;
    return new Date(ts).toLocaleDateString();
}

function formatCompactPoints(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    return n.toLocaleString();
}

function periodJoinGrowth(members: LoyaltyMember[], days: number): { label: string; raw: number } {
    const now = Date.now();
    const span = days * 24 * 60 * 60 * 1000;
    let recent = 0;
    let prior = 0;
    for (const m of members) {
        const j = new Date(m.joinDate).getTime();
        if (Number.isNaN(j)) continue;
        if (now - j <= span) recent++;
        else if (now - j > span && now - j <= span * 2) prior++;
    }
    if (prior === 0) return { label: recent > 0 ? '+100%' : '+0%', raw: recent > 0 ? 100 : 0 };
    const pct = ((recent - prior) / prior) * 100;
    const rounded = Math.abs(pct) >= 10 ? pct.toFixed(0) : pct.toFixed(1);
    return { label: `${pct >= 0 ? '+' : ''}${rounded}%`, raw: pct };
}

function tierJoinGrowth(members: LoyaltyMember[], tier: LoyaltyTier): string {
    const now = Date.now();
    const d30 = 30 * 24 * 60 * 60 * 1000;
    const d60 = 60 * 24 * 60 * 60 * 1000;
    let recent = 0;
    let prior = 0;
    for (const m of members) {
        if (m.tier !== tier) continue;
        const j = new Date(m.joinDate).getTime();
        if (Number.isNaN(j)) continue;
        if (now - j <= d30) recent++;
        else if (now - j > d30 && now - j <= d60) prior++;
    }
    if (prior === 0) return recent > 0 ? '+100%' : '+0%';
    const pct = ((recent - prior) / prior) * 100;
    return `${pct >= 0 ? '+' : ''}${Math.abs(pct) >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

function escapeCsvCell(s: string): string {
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

function quarterGrowthLabel(members: LoyaltyMember[]): string {
    const now = Date.now();
    const q = 90 * 24 * 60 * 60 * 1000;
    let cur = 0;
    let prev = 0;
    for (const m of members) {
        const j = new Date(m.joinDate).getTime();
        if (Number.isNaN(j)) continue;
        if (now - j <= q) cur++;
        else if (now - j > q && now - j <= 2 * q) prev++;
    }
    if (prev === 0) return cur > 0 ? `+${Math.min(99, cur * 5)}%` : '+0%';
    const pct = Math.round(((cur - prev) / prev) * 100);
    return `${pct >= 0 ? '+' : ''}${pct}%`;
}

export interface MemberDirectoryProps {
    onEnrollClick?: () => void;
}

function MemberDirectory({ onEnrollClick }: MemberDirectoryProps) {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const deepLinkKey = useRef<string | null>(null);
    const { members, deleteMember, updateMember, tiers } = useLoyalty();
    const [posSales, setPosSales] = useState<any[] | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTierFilter, setActiveTierFilter] = useState<LoyaltyTier | 'All'>('All');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('Active');
    const [sortKey, setSortKey] = useState<SortKey>('ltv_desc');
    const [page, setPage] = useState(1);
    const [filterBarOpen, setFilterBarOpen] = useState(false);
    const [dataUpdatedAt, setDataUpdatedAt] = useState(() => Date.now());
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
        setDataUpdatedAt(Date.now());
    }, [members]);

    useEffect(() => {
        let cancelled = false;
        shopApi.getSales()
            .then((data) => {
                if (!cancelled) setPosSales(Array.isArray(data) ? data : []);
            })
            .catch(() => {
                if (!cancelled) setPosSales([]);
            });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        const raw = searchParams.get('member');
        if (!raw) {
            deepLinkKey.current = null;
            return;
        }
        if (members.length === 0) return;
        if (deepLinkKey.current === raw) return;
        const digits = raw.replace(/\D/g, '');
        const found =
            members.find((m) => m.id === raw) ||
            members.find((m) => m.customerId === raw) ||
            (digits.length >= 4
                ? members.find((m) => (m.phone || '').replace(/\D/g, '').endsWith(digits))
                : undefined);
        if (found) {
            deepLinkKey.current = raw;
            setSelectedMember(found);
            setIsDetailModalOpen(true);
            setSearchParams(
                (prev) => {
                    const n = new URLSearchParams(prev);
                    n.delete('member');
                    n.delete('tab');
                    return n;
                },
                { replace: true }
            );
        }
    }, [members, searchParams, setSearchParams]);

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

    const lastVisitByMember = useMemo(() => {
        const map = new Map<string, number>();
        if (!posSales) return map;
        const statusOk = (st: string | undefined) =>
            !st || st === 'Completed' || st === 'Delivered';
        for (const s of posSales) {
            if (!statusOk(s.status)) continue;
            const id = s.loyaltyMemberId;
            if (!id) continue;
            const t = new Date(s.createdAt).getTime();
            if (Number.isNaN(t)) continue;
            const prev = map.get(id);
            if (prev === undefined || t > prev) map.set(id, t);
        }
        return map;
    }, [posSales]);

    const salesForMember = useMemo(() => {
        if (!selectedMember?.id || !posSales) return [];
        const statusOk = (st: string | undefined) =>
            !st || st === 'Completed' || st === 'Delivered';
        return posSales
            .filter((s: any) => s.loyaltyMemberId === selectedMember.id && statusOk(s.status))
            .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [selectedMember?.id, posSales]);

    const tierProgress = (m: LoyaltyMember) => {
        const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold);
        const next = sorted.find(t => t.threshold > m.totalSpend);
        if (!next) return { next: null as (typeof sorted)[0] | null, remaining: 0, pct: 100 };
        const prevThreshold = sorted.filter(t => t.threshold <= m.totalSpend).pop()?.threshold ?? 0;
        const span = next.threshold - prevThreshold;
        const pct = span > 0 ? Math.min(100, ((m.totalSpend - prevThreshold) / span) * 100) : 0;
        return { next, remaining: Math.max(0, next.threshold - m.totalSpend), pct };
    };

    const filteredMembers = useMemo(() => {
        return members.filter(m => {
            const q = searchQuery.toLowerCase();
            const nameMatch = (m.customerName || '').toLowerCase().includes(q);
            const cardMatch = (m.cardNumber || '').toLowerCase().includes(q);
            const idMatch = (m.id || '').toLowerCase().includes(q);
            const searchDigits = searchQuery.replace(/\D/g, '');
            const memberDigits = (m.phone || '').replace(/\D/g, '');
            const phoneMatch = searchDigits.length >= 3
                ? memberDigits.includes(searchDigits) || memberDigits.endsWith(searchDigits)
                : (m.phone || '').includes(searchQuery);

            const matchesSearch = nameMatch || cardMatch || phoneMatch || idMatch;
            const matchesTier = activeTierFilter === 'All' || m.tier === activeTierFilter;
            const matchesStatus = statusFilter === 'All' || m.status === statusFilter;

            return matchesSearch && matchesTier && matchesStatus;
        });
    }, [members, searchQuery, activeTierFilter, statusFilter]);

    const sortedMembers = useMemo(() => {
        const list = [...filteredMembers];
        const cmp = (a: LoyaltyMember, b: LoyaltyMember) => {
            switch (sortKey) {
                case 'ltv_desc': return b.totalSpend - a.totalSpend;
                case 'ltv_asc': return a.totalSpend - b.totalSpend;
                case 'points_desc': return b.pointsBalance - a.pointsBalance;
                case 'name_asc':
                    return (a.customerName || '').localeCompare(b.customerName || '', undefined, { sensitivity: 'base' });
                case 'visits_desc': return b.visitCount - a.visitCount;
                default: return 0;
            }
        };
        list.sort(cmp);
        return list;
    }, [filteredMembers, sortKey]);

    const totalPages = Math.max(1, Math.ceil(sortedMembers.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const paginatedMembers = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        return sortedMembers.slice(start, start + PAGE_SIZE);
    }, [sortedMembers, currentPage]);

    useEffect(() => {
        setPage(1);
    }, [searchQuery, activeTierFilter, statusFilter, sortKey]);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

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

    const rosterGrowth = useMemo(() => periodJoinGrowth(members, 30), [members]);
    const silverGrowth = useMemo(() => tierJoinGrowth(members, 'Silver'), [members]);
    const goldGrowth = useMemo(() => tierJoinGrowth(members, 'Gold'), [members]);
    const platinumGrowth = useMemo(() => tierJoinGrowth(members, 'Platinum'), [members]);
    const footerQuarter = useMemo(() => quarterGrowthLabel(members), [members]);

    const pctOf = (n: number, total: number) =>
        total <= 0 ? 0 : Math.round((n / total) * 100);

    const selectClass =
        'rounded-xl border-0 bg-white/95 dark:bg-slate-800/95 text-slate-800 dark:text-slate-200 text-xs font-semibold ' +
        'pl-3 pr-8 py-2.5 shadow-sm ring-1 ring-slate-200/80 dark:ring-slate-600 focus:ring-2 focus:ring-violet-400/40 outline-none cursor-pointer ' +
        'min-w-0 max-w-full';

    const handleViewDetails = (member: LoyaltyMember) => {
        setSelectedMember(member);
        setIsDetailModalOpen(true);
    };

    const handleExportCsv = () => {
        const headers = ['Name', 'Member ID', 'Phone', 'Tier', 'Visits', 'Lifetime Points', 'Points Balance', 'LTV (PKR)', 'Status'];
        const lines = [headers.join(',')];
        for (const m of sortedMembers) {
            const row = [
                m.customerName || '',
                m.cardNumber || m.id,
                m.phone || '',
                m.tier,
                String(m.visitCount),
                String(m.lifetimePoints),
                String(m.pointsBalance),
                String(m.totalSpend),
                m.status
            ].map(escapeCsvCell);
            lines.push(row.join(','));
        }
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `member-directory-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const minsAgo = Math.max(0, Math.floor((Date.now() - dataUpdatedAt) / 60000));
    const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';

    return (
        <div className="space-y-6 animate-fade-in flex flex-col h-full min-h-0">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Member Directory</h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-xl">
                        Manage and monitor your premium membership tiers and loyalty data.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                    <button
                        type="button"
                        onClick={handleExportCsv}
                        className="inline-flex items-center gap-2 rounded-xl bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200 px-4 py-2.5 text-sm font-semibold shadow-sm ring-1 ring-sky-200/80 dark:ring-sky-700/60 hover:bg-sky-200/60 dark:hover:bg-sky-800/50 transition-colors"
                    >
                        <Download className="h-4 w-4" aria-hidden />
                        Export
                    </button>
                    {onEnrollClick ? (
                        <button
                            type="button"
                            onClick={onEnrollClick}
                            className="inline-flex items-center gap-2 rounded-xl bg-violet-700 hover:bg-violet-800 text-white px-4 py-2.5 text-sm font-semibold shadow-md shadow-violet-900/20 transition-colors"
                        >
                            <Plus className="h-4 w-4" aria-hidden />
                            Enroll Member
                        </button>
                    ) : null}
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <button
                    type="button"
                    onClick={() => setActiveTierFilter('All')}
                    className={`text-left p-5 rounded-2xl border transition-all shadow-sm bg-white dark:bg-slate-900/80 ring-1 ${
                        activeTierFilter === 'All'
                            ? 'ring-2 ring-sky-400/50 border-sky-200 dark:border-sky-700'
                            : 'border-slate-200/80 dark:border-slate-600 hover:border-sky-200'
                    }`}
                >
                    <p className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Total roster</p>
                    <div className="mt-1 h-1 w-full rounded-full bg-sky-500" />
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-3 tabular-nums">
                        {tierStats.Total.toLocaleString()}
                    </p>
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1">{rosterGrowth.label} vs prior 30d</p>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTierFilter('Silver')}
                    className={`text-left p-5 rounded-2xl border transition-all shadow-sm bg-white dark:bg-slate-900/80 ${
                        activeTierFilter === 'Silver'
                            ? 'ring-2 ring-slate-400/50 border-slate-300 dark:border-slate-500'
                            : 'border-slate-200/80 dark:border-slate-600'
                    }`}
                >
                    <p className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Silver tiers</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-3 tabular-nums">
                        {tierStats.Silver.toLocaleString()}
                    </p>
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1">{silverGrowth} new momentum</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {pctOf(tierStats.Silver, Math.max(1, tierStats.Total))}% of total population
                    </p>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTierFilter('Gold')}
                    className={`text-left p-5 rounded-2xl border transition-all shadow-sm bg-white dark:bg-slate-900/80 ${
                        activeTierFilter === 'Gold'
                            ? 'ring-2 ring-amber-400/50 border-amber-200 dark:border-amber-800'
                            : 'border-slate-200/80 dark:border-slate-600'
                    }`}
                >
                    <p className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Gold tiers</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-3 tabular-nums">
                        {tierStats.Gold.toLocaleString()}
                    </p>
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1">{goldGrowth} new momentum</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {pctOf(tierStats.Gold, Math.max(1, tierStats.Total))}% of total population
                    </p>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTierFilter('Platinum')}
                    className={`text-left p-5 rounded-2xl border transition-all shadow-sm ${
                        activeTierFilter === 'Platinum'
                            ? 'bg-violet-700 text-white border-violet-600 ring-2 ring-violet-300/50'
                            : 'bg-violet-700/90 hover:bg-violet-700 text-white border-violet-600'
                    }`}
                >
                    <p className="text-[0.65rem] font-bold uppercase tracking-widest text-violet-100/90">Platinum tiers</p>
                    <p className="text-2xl font-bold mt-3 tabular-nums">{tierStats.Platinum.toLocaleString()}</p>
                    <p className="text-xs font-semibold text-emerald-200/90 mt-1">{platinumGrowth} new momentum</p>
                    <p className="text-xs text-violet-100/80 mt-0.5">
                        High value segment · Top {Math.max(1, Math.min(50, Math.round(100 * (tierStats.Platinum / Math.max(1, tierStats.Total)))))}%
                    </p>
                </button>
            </div>

            <div className="rounded-2xl bg-sky-100/80 dark:bg-slate-800/50 p-4 ring-1 ring-sky-200/60 dark:ring-slate-600/60">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="relative flex-1 min-w-0">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            {ICONS.search}
                        </div>
                        <input
                            type="search"
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-900/90 text-sm text-slate-800 dark:text-slate-100 shadow-sm ring-1 ring-slate-200/80 dark:ring-slate-600 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400/50"
                            placeholder="Search by name, ID or phone..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setFilterBarOpen(o => !o)}
                            className="inline-flex items-center gap-2 rounded-xl bg-white dark:bg-slate-900/90 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300 shadow-sm ring-1 ring-slate-200/80 dark:ring-slate-600 lg:hidden"
                        >
                            <Filter className="h-4 w-4" />
                            Filters
                        </button>
                        <div
                            className={`flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center w-full lg:w-auto ${
                                filterBarOpen ? 'flex' : 'hidden lg:flex'
                            }`}
                        >
                            <label className="sr-only" htmlFor="md-tier">Tier</label>
                            <select
                                id="md-tier"
                                value={activeTierFilter}
                                onChange={e => setActiveTierFilter(e.target.value as LoyaltyTier | 'All')}
                                className={selectClass}
                            >
                                <option value="All">Tier: All</option>
                                <option value="Silver">Tier: Silver</option>
                                <option value="Gold">Tier: Gold</option>
                                <option value="Platinum">Tier: Platinum</option>
                            </select>
                            <label className="sr-only" htmlFor="md-status">Status</label>
                            <select
                                id="md-status"
                                value={statusFilter}
                                onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                                className={selectClass}
                            >
                                <option value="All">Status: All</option>
                                <option value="Active">Status: Active</option>
                                <option value="Inactive">Status: Inactive</option>
                                <option value="Lapsed">Status: Lapsed</option>
                            </select>
                            <label className="sr-only" htmlFor="md-sort">Sort</label>
                            <select
                                id="md-sort"
                                value={sortKey}
                                onChange={e => setSortKey(e.target.value as SortKey)}
                                className={selectClass}
                            >
                                <option value="ltv_desc">Sort: LTV high</option>
                                <option value="ltv_asc">Sort: LTV low</option>
                                <option value="points_desc">Sort: Points balance</option>
                                <option value="name_asc">Sort: Name A–Z</option>
                                <option value="visits_desc">Sort: Visits</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <div className="relative flex-1 min-h-0">
                <Card padding="none" className="relative border border-slate-200/80 dark:border-slate-600 shadow-md overflow-hidden flex flex-col bg-white dark:bg-slate-900/90 flex-1">
                    <div className="overflow-x-auto min-h-0">
                        <table className="w-full text-left min-w-[900px]">
                            <thead className="bg-slate-50/95 dark:bg-slate-800/90 sticky top-0 z-10 text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="px-6 py-4">Member identity</th>
                                    <th className="px-4 py-4">Tier segment</th>
                                    <th className="px-4 py-4">Visits</th>
                                    <th className="px-4 py-4 text-right">Lifetime pts earned</th>
                                    <th className="px-4 py-4 text-right">Points balance</th>
                                    <th className="px-4 py-4 text-right">LTV (lifetime)</th>
                                    <th className="px-6 py-4">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/80">
                                {paginatedMembers.length > 0 ? paginatedMembers.map(m => {
                                    const lastTs = lastVisitByMember.get(m.id);
                                    const pkrEq = m.pointsBalance * PKR_PER_POINT;
                                    return (
                                        <tr
                                            key={m.id}
                                            onClick={() => handleViewDetails(m)}
                                            className="hover:bg-sky-50/50 dark:hover:bg-slate-800/50 transition-colors group cursor-pointer"
                                        >
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 shadow ${
                                                            m.tier === 'Platinum'
                                                                ? 'bg-violet-700 text-white'
                                                                : m.tier === 'Gold'
                                                                    ? 'bg-sky-200 text-sky-900 dark:bg-sky-800 dark:text-sky-100'
                                                                    : 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-200'
                                                        }`}
                                                    >
                                                        {(m.customerName || '?').charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-1.5 min-w-0">
                                                            {m.mobileCustomerVerified && (
                                                                <BadgeCheck className="w-3.5 h-3.5 shrink-0 text-emerald-600" aria-label="Verified" />
                                                            )}
                                                            <span className="truncate">{m.customerName}</span>
                                                        </div>
                                                        <div className="text-xs text-slate-500 font-mono">ID: {m.cardNumber || m.id}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span
                                                    className={`inline-block rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider ${
                                                        m.tier === 'Platinum'
                                                            ? 'bg-violet-600 text-white'
                                                            : m.tier === 'Gold'
                                                                ? 'bg-sky-200 text-sky-900 dark:bg-sky-800 dark:text-sky-100'
                                                                : 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-200'
                                                    }`}
                                                >
                                                    {m.tier}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="text-sm font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                                                    {m.visitCount} Visits
                                                </div>
                                                <div className="text-xs text-slate-500">
                                                    Last: {formatRelativeLastVisit(lastTs)}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-right font-mono text-sm font-semibold text-slate-800 dark:text-slate-200">
                                                {formatCompactPoints(m.lifetimePoints)}
                                            </td>
                                            <td className="px-4 py-4 text-right">
                                                <div className="text-sm font-semibold font-mono text-slate-800 dark:text-slate-200">
                                                    {m.pointsBalance.toLocaleString()} pts
                                                </div>
                                                <div className="text-xs text-slate-500">
                                                    ≈ Rs {pkrEq.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-right text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                                                Rs {m.totalSpend.toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-1.5">
                                                    <span
                                                        className={`h-2 w-2 rounded-full ${
                                                            m.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-500'
                                                        }`}
                                                    />
                                                    <span className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                                                        {m.status}
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={7} className="px-8 py-20 text-center">
                                            <div className="flex flex-col items-center justify-center gap-3">
                                                <div className="p-6 bg-slate-100 dark:bg-slate-800 rounded-3xl text-slate-400">
                                                    {React.cloneElement(ICONS.users as React.ReactElement<any>, { width: 48, height: 48 })}
                                                </div>
                                                <p className="text-slate-800 dark:text-slate-200 font-semibold text-lg">No members found</p>
                                                <p className="text-slate-500 text-sm">Try adjusting your filters or search terms.</p>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSearchQuery('');
                                                        setActiveTierFilter('All');
                                                        setStatusFilter('All');
                                                    }}
                                                    className="mt-2 px-6 py-2 bg-violet-700 text-white rounded-xl text-sm font-semibold hover:bg-violet-800"
                                                >
                                                    Reset filters
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {sortedMembers.length > 0 && (
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/30">
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                Showing {(currentPage - 1) * PAGE_SIZE + 1} to{' '}
                                {Math.min(currentPage * PAGE_SIZE, sortedMembers.length)} of {sortedMembers.length} members
                            </p>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage <= 1}
                                    className="p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30"
                                    aria-label="Previous page"
                                >
                                    <ChevronLeft className="h-5 w-5" />
                                </button>
                                {Array.from({ length: totalPages }, (_, i) => i + 1)
                                    .filter(n => n === 1 || n === totalPages || Math.abs(n - currentPage) <= 1)
                                    .map((n, i, arr) => {
                                        const prev = arr[i - 1];
                                        const showGap = i > 0 && n - prev > 1;
                                        return (
                                            <React.Fragment key={n}>
                                                {showGap ? <span className="px-1 text-slate-400">…</span> : null}
                                                <button
                                                    type="button"
                                                    onClick={() => setPage(n)}
                                                    className={`min-w-[2.25rem] h-9 rounded-full text-sm font-semibold transition-colors ${
                                                        n === currentPage
                                                            ? 'bg-sky-700 text-white'
                                                            : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
                                                    }`}
                                                >
                                                    {n}
                                                </button>
                                            </React.Fragment>
                                        );
                                    })}
                                <button
                                    type="button"
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage >= totalPages}
                                    className="p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30"
                                    aria-label="Next page"
                                >
                                    <ChevronRight className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                    )}

                    {onEnrollClick ? (
                        <button
                            type="button"
                            onClick={e => {
                                e.stopPropagation();
                                onEnrollClick();
                            }}
                            className="absolute bottom-6 right-6 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-sky-600 text-white shadow-lg shadow-sky-900/25 hover:bg-sky-700 md:bottom-8 md:right-8"
                            aria-label="Enroll member"
                        >
                            <Plus className="h-6 w-6" strokeWidth={2.5} />
                        </button>
                    ) : null}
                </Card>
            </div>

            <footer className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <span>Data refresh: Updated {minsAgo === 0 ? 'just now' : `${minsAgo} min${minsAgo === 1 ? '' : 's'} ago`}</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Growth: {footerQuarter} vs last quarter (enrollments)</span>
                </div>
                <div className="text-right font-mono text-[0.65rem] tracking-wide text-slate-400">
                    {appVersion ? `MY_SHOP v${appVersion} · LOYALTY MODULE` : 'MY_SHOP · LOYALTY MODULE'}
                </div>
            </footer>

            <Modal
                isOpen={isDetailModalOpen}
                onClose={closeDetailModal}
                title="Member Profile Insights"
                size="xl"
            >
                {selectedMember && (
                    <div className="space-y-8 pb-4">
                        <div className="flex flex-col md:flex-row gap-8 items-start">
                            <div className="w-full md:w-1/3 space-y-4">
                                <div className="p-8 bg-muted/80 dark:bg-slate-800/80 rounded-[32px] border border-border dark:border-slate-600 flex flex-col items-center text-center">
                                    <div className={`w-28 h-28 rounded-[40px] flex items-center justify-center font-semibold text-4xl mb-6 shadow-xl ${selectedMember.tier === 'Platinum' ? 'bg-slate-900 text-rose-600 dark:bg-slate-950 dark:text-rose-400' :
                                        selectedMember.tier === 'Gold' ? 'bg-amber-400 text-amber-900 dark:bg-amber-600 dark:text-amber-950' :
                                            'bg-card text-slate-300 border-2 border-border dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600'
                                        }`}>
                                        {(selectedMember.customerName || 'U').charAt(0)}
                                    </div>
                                    <h4 className="text-2xl font-semibold text-foreground tracking-tight flex items-center justify-center gap-2 flex-wrap">
                                        {selectedMember.mobileCustomerVerified && (
                                            <BadgeCheck className="w-7 h-7 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Verified mobile customer" />
                                        )}
                                        <span>{selectedMember.customerName || 'Unnamed Member'}</span>
                                    </h4>
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

                                    {selectedMember.mobileCustomerId ? (
                                        <div className="w-full mt-6 p-4 rounded-2xl border border-border dark:border-slate-600 bg-card/80 text-left space-y-3">
                                            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-muted-foreground">Mobile app verification</p>
                                            <p className="text-xs text-muted-foreground leading-snug">
                                                After you confirm this customer’s identity (in store or by phone), mark them as verified. This shows on POS and mobile orders.
                                            </p>
                                            <div className="flex rounded-xl border border-border dark:border-slate-600 overflow-hidden">
                                                <button
                                                    type="button"
                                                    className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${selectedMember.mobileCustomerVerified
                                                        ? 'bg-emerald-600 text-white'
                                                        : 'bg-muted/60 dark:bg-slate-800 text-muted-foreground hover:bg-muted'
                                                        }`}
                                                    onClick={async () => {
                                                        await updateMember(selectedMember.id, { mobileCustomerVerified: true });
                                                        setSelectedMember((prev) =>
                                                            prev && prev.id === selectedMember.id ? { ...prev, mobileCustomerVerified: true } : prev
                                                        );
                                                    }}
                                                >
                                                    Verified
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors border-l border-border dark:border-slate-600 ${!selectedMember.mobileCustomerVerified
                                                        ? 'bg-slate-200 dark:bg-slate-700 text-foreground'
                                                        : 'bg-muted/40 dark:bg-slate-800/80 text-muted-foreground hover:bg-muted/60'
                                                        }`}
                                                    onClick={async () => {
                                                        await updateMember(selectedMember.id, { mobileCustomerVerified: false });
                                                        setSelectedMember((prev) =>
                                                            prev && prev.id === selectedMember.id ? { ...prev, mobileCustomerVerified: false } : prev
                                                        );
                                                    }}
                                                >
                                                    Unverified
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground text-center mt-4 px-2">
                                            Mobile app verification is available once this member is linked to a mobile account (same phone as above).
                                        </p>
                                    )}
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
                                    type="button"
                                    className="w-full py-4 bg-muted dark:bg-slate-800 text-muted-foreground rounded-2xl font-semibold text-xs uppercase tracking-widest hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 transition-all border border-transparent dark:border-slate-600 hover:border-rose-100 dark:hover:border-rose-800"
                                    onClick={() => {
                                        if (window.confirm('Deactivate this member?')) {
                                            void updateMember(selectedMember.id, { status: selectedMember.status === 'Active' ? 'Inactive' : 'Active' });
                                            closeDetailModal();
                                        }
                                    }}
                                >
                                    {selectedMember.status === 'Active' ? 'Deactivate Membership' : 'Reactivate Membership'}
                                </button>

                                <button
                                    type="button"
                                    className="w-full py-3 text-xs font-semibold uppercase tracking-widest text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 rounded-2xl bg-card hover:bg-red-50/80 dark:hover:bg-red-950/20 transition-all"
                                    onClick={() => {
                                        if (window.confirm('Remove this member from the loyalty program? This cannot be undone.')) {
                                            void deleteMember(selectedMember.id);
                                            closeDetailModal();
                                        }
                                    }}
                                >
                                    Remove from program
                                </button>
                            </div>

                            <div className="flex-1 space-y-8">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    <div className="p-6 bg-card dark:bg-slate-900/90 border border-border dark:border-slate-600 rounded-3xl shadow-sm">
                                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Points balance</p>
                                        <p className="text-2xl font-semibold text-rose-600 dark:text-rose-400 font-mono tracking-tighter">{selectedMember.pointsBalance.toLocaleString()}</p>
                                    </div>
                                    <div className="p-6 bg-card dark:bg-slate-900/90 border border-border dark:border-slate-600 rounded-3xl shadow-sm">
                                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Lifetime pts earned</p>
                                        <p className="text-2xl font-semibold text-indigo-600 dark:text-indigo-400 font-mono tracking-tighter">{selectedMember.lifetimePoints.toLocaleString()}</p>
                                    </div>
                                    <div className="p-6 bg-card dark:bg-slate-900/90 border border-border dark:border-slate-600 rounded-3xl shadow-sm">
                                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Total LTV</p>
                                        <p className="text-2xl font-semibold text-foreground font-mono tracking-tighter">{CURRENCY} {selectedMember.totalSpend.toLocaleString()}</p>
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
                                            {ICONS.barChart} POS sales and points earned
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
                                        {posSales === null ? (
                                            <div className="p-12 text-center text-muted-foreground text-xs font-semibold uppercase tracking-widest">Loading sales…</div>
                                        ) : salesForMember.length > 0 ? (
                                            <div className="divide-y divide-slate-100 dark:divide-slate-700 max-h-72 overflow-y-auto">
                                                {salesForMember.map((sale: any) => {
                                                    const pts = parseInt(String(sale.pointsEarned ?? 0), 10) || 0;
                                                    return (
                                                        <div key={sale.id} className="p-4 flex justify-between items-center hover:bg-card dark:hover:bg-slate-800/80 transition-colors gap-3">
                                                            <div className="flex items-center gap-4 min-w-0">
                                                                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 shrink-0">
                                                                    {ICONS.plus}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold text-foreground uppercase tracking-tighter truncate">
                                                                        Sale #{String(sale.saleNumber || sale.id || '').slice(-12)}
                                                                    </p>
                                                                    <p className="text-xs text-muted-foreground font-medium italic">
                                                                        {sale.createdAt ? new Date(sale.createdAt).toLocaleString() : '—'}
                                                                    </p>
                                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                                        {CURRENCY} {Number(sale.grandTotal ?? 0).toLocaleString()}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="text-right shrink-0">
                                                                <p className="text-xs font-semibold font-mono text-emerald-600 dark:text-emerald-400">
                                                                    +{pts.toLocaleString()} pts
                                                                </p>
                                                                <p className="text-xs text-muted-foreground font-bold uppercase tracking-[0.1em]">POS</p>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="p-12 text-center text-slate-300">
                                                <p className="text-xs font-semibold uppercase tracking-widest italic">No POS sales linked to this member yet</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {selectedMember && (() => {
                            const { next, remaining, pct } = tierProgress(selectedMember);
                            return (
                                <div className="p-4 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-4 mt-4">
                                    <div className="p-3 bg-indigo-100 text-indigo-600 dark:bg-indigo-950/80 dark:text-indigo-400 rounded-xl shrink-0">
                                        {ICONS.trophy}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-200 uppercase tracking-widest">Tier evolution</p>
                                        {next && remaining > 0 ? (
                                            <p className="text-xs text-indigo-700 dark:text-indigo-300/90 font-medium">
                                                Spending another{' '}
                                                <span className="font-semibold">{CURRENCY} {remaining.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>{' '}
                                                will upgrade this customer to <span className="font-semibold italic underline">{next.tier}</span>.
                                            </p>
                                        ) : (
                                            <p className="text-xs text-indigo-700 dark:text-indigo-300/90 font-medium">
                                                This member is at the highest tier for current spend rules, or no higher tier is configured.
                                            </p>
                                        )}
                                    </div>
                                    <div className="w-full sm:w-48 h-2 bg-indigo-200 dark:bg-indigo-950 rounded-full overflow-hidden shrink-0">
                                        <div
                                            className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full transition-all"
                                            style={{ width: `${next ? pct : 100}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}
            </Modal>

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
                                placeholder="4 characters (letters or digits)"
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
                                    if (newPw.length !== 4 || !/^[a-zA-Z0-9]+$/.test(newPw)) {
                                        alert('Password must be exactly 4 letters or digits.');
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
}

export default MemberDirectory;
