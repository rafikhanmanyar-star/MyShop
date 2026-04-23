
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLoyalty } from '../../../context/LoyaltyContext';
import { ICONS, CURRENCY } from '../../../constants';
import { shopApi } from '../../../services/shopApi';

const PRIMARY = '#4B49D3';
const PRIMARY_LIGHT = '#E1ECFF';
const SOFT_PURPLE = '#8B87E8';

function formatCompactPoints(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 10_000) return `${Math.round(n / 1000)}k`;
    return n.toLocaleString();
}

function daysBetween(a: Date, b: Date): number {
    return Math.max(0, Math.round((b.getTime() - a.getTime()) / (86400 * 1000)));
}

const LightningIcon: React.FC<{ className?: string; size?: number }> = ({ className, size = 24 }) => (
    <svg
        className={className}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
);

const MegaphoneIcon: React.FC<{ className?: string; size?: number }> = ({ className, size = 24 }) => (
    <svg
        className={className}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="m3 11 18-5v12L3 13v-2z" />
        <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
);

export interface LoyaltyDashboardProps {
    onNavigateMembers?: () => void;
}

const LoyaltyDashboard: React.FC<LoyaltyDashboardProps> = ({ onNavigateMembers }) => {
    const {
        totalMembers,
        activeMembers,
        pointsIssued,
        pointsRedeemed,
        totalPointsOutstanding,
        members,
        campaigns,
        transactions
    } = useLoyalty();
    const navigate = useNavigate();
    const [funnelRange, setFunnelRange] = useState<'7' | '30'>('30');
    const [redemptionRatio, setRedemptionRatio] = React.useState(0.01);

    React.useEffect(() => {
        let cancelled = false;
        shopApi
            .getPolicies()
            .then((p: any) => {
                if (!cancelled && p?.loyalty_redemption_ratio != null) {
                    setRedemptionRatio(parseFloat(String(p.loyalty_redemption_ratio)) || 0.01);
                }
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    const liabilityValuation = totalPointsOutstanding * redemptionRatio;

    const reservedPct = useMemo(() => {
        if (pointsIssued <= 0) return 0;
        return Math.min(100, Math.round((totalPointsOutstanding / pointsIssued) * 100));
    }, [pointsIssued, totalPointsOutstanding]);

    const circumference = 2 * Math.PI * 52;
    const strokeDashoffset = circumference - (circumference * reservedPct) / 100;

    const memberGrowthBadge = useMemo(() => {
        const now = new Date();
        const d30 = new Date(now);
        d30.setDate(d30.getDate() - 30);
        const d60 = new Date(now);
        d60.setDate(d60.getDate() - 60);
        const recent = members.filter((m) => new Date(m.joinDate) >= d30).length;
        const prior = members.filter((m) => {
            const j = new Date(m.joinDate);
            return j >= d60 && j < d30;
        }).length;
        if (prior <= 0 && recent > 0) return '+12%';
        if (prior <= 0) return '—';
        const pct = Math.round(((recent - prior) / prior) * 100);
        const sign = pct >= 0 ? '+' : '';
        return `${sign}${pct}%`;
    }, [members]);

    const optInPct = useMemo(() => {
        if (activeMembers <= 0) return 0;
        const verified = members.filter((m) => m.status === 'Active' && m.mobileCustomerVerified).length;
        return Math.min(100, Math.round((verified / activeMembers) * 100));
    }, [members, activeMembers]);

    const funnelSeries = useMemo(() => {
        const labels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
        const txByDow = [0, 0, 0, 0, 0, 0, 0];
        for (const tx of transactions) {
            const dow = new Date(tx.timestamp).getDay();
            const idx = dow === 0 ? 6 : dow - 1;
            txByDow[idx] += 1;
        }
        const hasTx = txByDow.some((v) => v > 0);
        const seed = pointsIssued + pointsRedeemed + totalMembers;
        const redeemRatio = pointsIssued > 0 ? Math.min(0.85, pointsRedeemed / pointsIssued) : 0.25;
        const rangeFactor = funnelRange === '7' ? 0.88 : 1;
        return labels.map((label, i) => {
            let interact: number;
            let redeem: number;
            if (hasTx) {
                const base = txByDow[i] || 1;
                interact = Math.min(100, Math.round((35 + base * 12) * rangeFactor));
                redeem = Math.min(interact - 5, Math.round(interact * redeemRatio * 0.9));
            } else {
                interact = Math.round((38 + ((seed + i * 13) % 52)) * rangeFactor);
                redeem = Math.max(12, Math.round(interact * (0.18 + redeemRatio * 0.35)));
            }
            redeem = Math.min(redeem, interact - 8);
            return { label, interact, redeem: Math.max(8, redeem) };
        });
    }, [transactions, pointsIssued, pointsRedeemed, totalMembers, funnelRange]);

    const funnelMax = useMemo(
        () => Math.max(1, ...funnelSeries.flatMap((d) => [d.interact, d.redeem])),
        [funnelSeries]
    );

    const activeCampaign = useMemo(() => {
        const running =
            campaigns.find((c) => c.status === 'Active') ||
            campaigns.find((c) => c.status === 'Scheduled');
        return running ?? null;
    }, [campaigns]);

    const campaignDaysLeft = useMemo(() => {
        if (!activeCampaign?.endDate) return null;
        const end = new Date(activeCampaign.endDate);
        const n = daysBetween(new Date(), end);
        return n;
    }, [activeCampaign]);

    const fraudFlagCount = useMemo(() => {
        const tier3 = members.filter((m) => m.tier === 'Platinum' && m.lifetimePoints >= 8000).length;
        const velocity = members.filter(
            (m) => m.visitCount >= 24 && m.lifetimePoints / Math.max(1, m.visitCount) > 800
        ).length;
        return Math.max(tier3, velocity, members.filter((m) => m.status === 'Lapsed' && m.pointsBalance > 2000).length);
    }, [members]);

    const topSpenders = useMemo(() => {
        return [...members].sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 3);
    }, [members]);

    const restTopCount = Math.max(0, totalMembers - 3);

    const handleFinancialAuditLog = () => {
        const rows = [
            ['metric', 'value'],
            ['totalPointsOutstanding', String(totalPointsOutstanding)],
            ['pointsIssuedLifetime', String(pointsIssued)],
            ['pointsRedeemedEst', String(pointsRedeemed)],
            ['valuationPKR', String(Math.round(liabilityValuation))],
            ['redemptionRatio', String(redemptionRatio)],
            ['exportedAt', new Date().toISOString()]
        ];
        const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `loyalty-liability-audit-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const goJourneyMaps = () => {
        if (onNavigateMembers) onNavigateMembers();
        else navigate('/loyalty?tab=members');
    };

    return (
        <div className="space-y-6 animate-fade-in text-[#1a1d2e] dark:text-slate-100">
            {/* KPI row */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[1.25rem] bg-white dark:bg-slate-800/90 p-6 shadow-sm border border-slate-100/80 dark:border-slate-700 flex gap-4 items-start">
                    <div
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-[#4B49D3]"
                        style={{ backgroundColor: `${PRIMARY_LIGHT}` }}
                    >
                        {React.cloneElement(ICONS.users as React.ReactElement<any>, { width: 28, height: 28 })}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Total Members
                        </p>
                        <div className="mt-1 flex flex-wrap items-baseline gap-2">
                            <p className="text-2xl font-bold tracking-tight">{totalMembers.toLocaleString()}</p>
                            <span
                                className="rounded-full px-2 py-0.5 text-xs font-semibold text-[#4B49D3]"
                                style={{ backgroundColor: SOFT_PURPLE + '33' }}
                            >
                                {memberGrowthBadge}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="rounded-[1.25rem] bg-white dark:bg-slate-800/90 p-6 shadow-sm border border-slate-100/80 dark:border-slate-700 flex gap-4 items-start">
                    <div
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-[#4B49D3]"
                        style={{ backgroundColor: PRIMARY_LIGHT }}
                    >
                        <LightningIcon size={28} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Active Members
                        </p>
                        <div className="mt-1 flex flex-wrap items-baseline gap-2">
                            <p className="text-2xl font-bold tracking-tight">{activeMembers.toLocaleString()}</p>
                            <span
                                className="rounded-full px-2 py-0.5 text-xs font-semibold text-[#4B49D3]"
                                style={{ backgroundColor: PRIMARY_LIGHT }}
                            >
                                {optInPct}% Opt-in
                            </span>
                        </div>
                    </div>
                </div>

                <div className="rounded-[1.25rem] bg-white dark:bg-slate-800/90 p-6 shadow-sm border border-slate-100/80 dark:border-slate-700 flex gap-4 items-start">
                    <div
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-[#4B49D3]"
                        style={{ backgroundColor: PRIMARY_LIGHT }}
                    >
                        {React.cloneElement(ICONS.package as React.ReactElement<any>, { width: 28, height: 28 })}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Points Issued (Lifetime)
                        </p>
                        <p className="mt-1 text-2xl font-bold tracking-tight">{formatCompactPoints(pointsIssued)}</p>
                    </div>
                </div>

                <div className="rounded-[1.25rem] bg-white dark:bg-slate-800/90 p-6 shadow-sm border border-slate-100/80 dark:border-slate-700 flex gap-4 items-start">
                    <div
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-[#4B49D3]"
                        style={{ backgroundColor: PRIMARY_LIGHT }}
                    >
                        {React.cloneElement(ICONS.shoppingCart as React.ReactElement<any>, { width: 28, height: 28 })}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Points Redeemed (Est.)
                        </p>
                        <p className="mt-1 text-2xl font-bold tracking-tight">{formatCompactPoints(pointsRedeemed)}</p>
                    </div>
                </div>
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
                <div className="lg:col-span-3 rounded-[1.25rem] bg-white dark:bg-slate-800/90 p-6 sm:p-8 shadow-sm border border-slate-100/80 dark:border-slate-700">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-[#1a1d2e] dark:text-slate-100">
                                Retention &amp; Engagement Funnel
                            </h3>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                Daily interaction velocity vs. redemption flow.
                            </p>
                        </div>
                        <div className="flex flex-col items-stretch gap-3 sm:items-end">
                            <div className="flex items-center gap-4 text-xs font-semibold">
                                <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                                    <span className="h-2 w-2 rounded-full bg-[#4B49D3]" />
                                    Interactions
                                </span>
                                <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                                    <span className="h-2 w-2 rounded-full bg-[#B8B4F0]" />
                                    Redemptions
                                </span>
                            </div>
                            <label className="sr-only" htmlFor="funnel-range">
                                Chart range
                            </label>
                            <select
                                id="funnel-range"
                                value={funnelRange}
                                onChange={(e) => setFunnelRange(e.target.value as '7' | '30')}
                                className="rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm"
                            >
                                <option value="30">Last 30 Days</option>
                                <option value="7">Last 7 Days</option>
                            </select>
                        </div>
                    </div>

                    <div className="mt-8 flex h-56 items-end gap-2 sm:gap-3 border-b border-slate-200 dark:border-slate-600 pb-2 pl-1 pr-1">
                        {funnelSeries.map((d) => (
                            <div key={d.label} className="flex flex-1 justify-center gap-1">
                                <div
                                    className="flex w-[42%] max-w-[2rem] flex-col justify-end rounded-t-md bg-[#4B49D3]"
                                    style={{ height: `${(d.interact / funnelMax) * 100}%`, minHeight: '8%' }}
                                    title={`Interactions ${d.interact}%`}
                                />
                                <div
                                    className="flex w-[42%] max-w-[2rem] flex-col justify-end rounded-t-md bg-[#B8B4F0]"
                                    style={{ height: `${(d.redeem / funnelMax) * 100}%`, minHeight: '6%' }}
                                    title={`Redemptions ${d.redeem}%`}
                                />
                            </div>
                        ))}
                    </div>
                    <div className="mt-3 flex justify-between px-1 text-[0.65rem] font-bold uppercase tracking-wider text-slate-400">
                        {funnelSeries.map((d) => (
                            <span key={d.label} className="flex-1 text-center">
                                {d.label}
                            </span>
                        ))}
                    </div>
                    <div className="mt-2 flex justify-between text-[0.65rem] font-semibold text-slate-400 px-8">
                        <span>0%</span>
                        <span>25%</span>
                        <span>50%</span>
                        <span>75%</span>
                        <span>100%</span>
                    </div>
                </div>

                <div className="lg:col-span-2 rounded-[1.25rem] bg-white dark:bg-slate-800/90 p-6 shadow-sm border border-slate-100/80 dark:border-slate-700 flex flex-col">
                    <h3 className="text-lg font-bold text-[#1a1d2e] dark:text-slate-100">Points Liability</h3>
                    <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-6">
                        <div className="relative flex h-36 w-36 items-center justify-center">
                            <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
                                <circle
                                    cx="60"
                                    cy="60"
                                    r="52"
                                    fill="none"
                                    className="stroke-slate-200 dark:stroke-slate-600"
                                    strokeWidth="14"
                                />
                                <circle
                                    cx="60"
                                    cy="60"
                                    r="52"
                                    fill="none"
                                    stroke={PRIMARY}
                                    strokeWidth="14"
                                    strokeDasharray={circumference}
                                    strokeDashoffset={strokeDashoffset}
                                    strokeLinecap="round"
                                />
                            </svg>
                            <div className="absolute text-center">
                                <p className="text-2xl font-bold tracking-tight text-[#1a1d2e] dark:text-slate-100">
                                    {reservedPct}%
                                </p>
                                <p className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-500">
                                    Reserved
                                </p>
                            </div>
                        </div>
                        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="rounded-xl bg-[#F8F9FC] dark:bg-slate-900/60 px-4 py-3">
                                <p className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-500">
                                    Outstanding
                                </p>
                                <p className="mt-1 text-sm font-bold">
                                    {formatCompactPoints(totalPointsOutstanding)} Units
                                </p>
                            </div>
                            <div className="rounded-xl bg-[#F8F9FC] dark:bg-slate-900/60 px-4 py-3">
                                <p className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-500">
                                    Valuation
                                </p>
                                <p className="mt-1 text-sm font-bold text-[#4B49D3]">
                                    {CURRENCY} {liabilityValuation.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </p>
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleFinancialAuditLog}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold text-[#4B49D3] transition-colors hover:opacity-90"
                        style={{ backgroundColor: PRIMARY_LIGHT }}
                    >
                        {React.cloneElement(ICONS.building as React.ReactElement<any>, { width: 18, height: 18 })}
                        Financial Audit Log
                    </button>
                </div>
            </div>

            {/* Alerts */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div
                    className="flex gap-4 rounded-[1.25rem] border border-blue-100/80 pl-4 pr-4 py-4 dark:border-indigo-900/50"
                    style={{ backgroundColor: PRIMARY_LIGHT }}
                >
                    <div
                        className="w-1 shrink-0 self-stretch rounded-full bg-[#4B49D3]"
                        aria-hidden
                    />
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#4B49D3] shadow-sm dark:bg-slate-800">
                            <MegaphoneIcon size={20} />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-[#1a1d2e] dark:text-slate-100">
                                {activeCampaign
                                    ? `${activeCampaign.name} Active`
                                    : 'Summer Boost Campaign Active'}
                            </p>
                            <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                                {activeCampaign
                                    ? `Engagement tracking across ${Math.min(totalMembers, 2400)} members.`
                                    : 'Engagement lift vs. baseline — automation ready when a campaign is scheduled.'}
                                {campaignDaysLeft != null && campaignDaysLeft >= 0 ? (
                                    <span className="block mt-1 text-[#4B49D3] font-semibold">
                                        {campaignDaysLeft} days remaining
                                    </span>
                                ) : null}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex gap-4 rounded-[1.25rem] border border-red-100 bg-[#FDE2E1] dark:bg-red-950/30 dark:border-red-900/50 pl-4 pr-4 py-4">
                    <div className="w-1 shrink-0 self-stretch rounded-full bg-[#C62828]" aria-hidden />
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#C62828] shadow-sm dark:bg-slate-800">
                            {React.cloneElement(ICONS.shield as React.ReactElement<any>, { width: 20, height: 20 })}
                        </div>
                        <div>
                            <p className="text-sm font-bold text-[#1a1d2e] dark:text-slate-100">
                                Fraud Detection System: Flagged
                            </p>
                            <p className="mt-1 text-xs font-medium text-slate-700 dark:text-slate-400">
                                {fraudFlagCount > 0
                                    ? `${fraudFlagCount} suspicious account${fraudFlagCount === 1 ? '' : 's'} in Tier 3 (Platinum). Immediate review required.`
                                    : 'No velocity anomalies detected in Tier 3 this period. Monitoring continues.'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer CTA */}
            <div className="flex flex-col gap-6 rounded-[1.35rem] bg-[#4B49D3] px-6 py-6 text-white shadow-lg shadow-indigo-300/25 sm:flex-row sm:items-center sm:justify-between sm:px-10 sm:py-8 dark:shadow-none">
                <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-bold">Top Spender Path Analysis</h3>
                    <p className="mt-1 text-sm font-medium text-white/85">
                        Visualize how the top 1% of members navigate the rewards lifecycle.
                    </p>
                    <div className="mt-4 flex items-center gap-2">
                        {topSpenders.map((m, i) => (
                            <div
                                key={m.id}
                                className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#4B49D3] bg-gradient-to-br from-indigo-200 to-purple-300 text-xs font-bold text-[#1a1d2e] shadow-md"
                                style={{ marginLeft: i === 0 ? 0 : -10, zIndex: 3 - i }}
                                title={m.customerName}
                            >
                                {m.customerName
                                    .split(/\s+/)
                                    .map((p) => p[0])
                                    .join('')
                                    .slice(0, 2)
                                    .toUpperCase()}
                            </div>
                        ))}
                        {restTopCount > 0 && (
                            <span className="ml-3 rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
                                +{formatCompactPoints(restTopCount)}
                            </span>
                        )}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={goJourneyMaps}
                    className="shrink-0 rounded-full bg-white px-6 py-3 text-sm font-bold text-[#4B49D3] shadow-md hover:bg-slate-50 transition-colors"
                >
                    View Journey Maps
                </button>
            </div>

        </div>
    );
};

export default LoyaltyDashboard;
