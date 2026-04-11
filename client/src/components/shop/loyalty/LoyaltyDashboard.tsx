
import React, { useEffect, useState } from 'react';
import { useLoyalty } from '../../../context/LoyaltyContext';
import { ICONS, CURRENCY } from '../../../constants';
import Card from '../../ui/Card';
import { shopApi } from '../../../services/shopApi';

const LoyaltyDashboard: React.FC = () => {
    const {
        totalMembers,
        activeMembers,
        pointsIssued,
        pointsRedeemed,
        totalPointsOutstanding,
        members,
        tiers
    } = useLoyalty();
    const [redemptionRatio, setRedemptionRatio] = useState(0.01);

    useEffect(() => {
        let cancelled = false;
        shopApi.getPolicies()
            .then((p: any) => {
                if (!cancelled && p?.loyalty_redemption_ratio != null) {
                    setRedemptionRatio(parseFloat(String(p.loyalty_redemption_ratio)) || 0.01);
                }
            })
            .catch(() => { });
        return () => { cancelled = true; };
    }, []);

    const burnRatePct = pointsIssued > 0
        ? Math.min(100, Math.round((pointsRedeemed / pointsIssued) * 100))
        : 0;
    const liabilityValuation = totalPointsOutstanding * redemptionRatio;
    const circumference = 2 * Math.PI * 70;
    const strokeDashoffset = circumference - (circumference * burnRatePct) / 100;

    const tierThresholds = [...tiers].sort((a, b) => a.threshold - b.threshold);
    const nextTierUp = (spend: number) => {
        const above = tierThresholds.filter(t => t.threshold > spend);
        return above.length ? above[0] : null;
    };
    const sampleMember = members.length
        ? members.reduce((a, b) => (a.totalSpend >= b.totalSpend ? a : b))
        : null;
    const next = sampleMember ? nextTierUp(sampleMember.totalSpend) : null;
    const spendToNext = next && sampleMember
        ? Math.max(0, next.threshold - sampleMember.totalSpend)
        : 0;

    const stats = [
        { label: 'Total Members', value: totalMembers, icon: ICONS.users, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/50' },
        { label: 'Active members', value: activeMembers, icon: ICONS.heart, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/50' },
        { label: 'Points issued (lifetime)', value: pointsIssued.toLocaleString(), icon: ICONS.plus, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/50' },
        { label: 'Points redeemed (est.)', value: pointsRedeemed.toLocaleString(), icon: ICONS.trash, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/50' },
    ];

    return (
        <div className="space-y-8 animate-fade-in text-foreground">
            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat, i) => (
                    <Card key={i} className="p-6 border-none shadow-sm dark:shadow-none dark:bg-slate-900/90 dark:border dark:border-slate-600 flex items-center gap-4 hover:shadow-md transition-all group">
                        <div className={`w-14 h-14 rounded-2xl ${stat.bg} ${stat.color} flex items-center justify-center transition-transform group-hover:scale-110`}>
                            {React.cloneElement(stat.icon as React.ReactElement<any>, { width: 28, height: 28 })}
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{stat.label}</p>
                            <p className="text-2xl font-semibold text-foreground tracking-tight">{stat.value}</p>
                        </div>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Engagement Overview */}
                <Card className="lg:col-span-2 border-none shadow-sm dark:shadow-none dark:bg-slate-900/90 dark:border dark:border-slate-600 p-8 bg-card relative overflow-hidden">
                    <div className="flex justify-between items-center mb-8">
                        <h3 className="font-bold text-foreground text-lg">Retention & Engagement Funnel</h3>
                        <div className="flex gap-2">
                            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                                <span className="w-2 h-2 rounded-full bg-rose-500 dark:bg-rose-400"></span> Repeat Buyers
                            </div>
                        </div>
                    </div>

                    <div className="h-64 flex items-end gap-4 px-4 pb-4 border-b border-border dark:border-slate-600">
                        {[45, 62, 85, 30, 95, 70, 55].map((val, i) => (
                            <div key={i} className="flex-1 bg-rose-50 dark:bg-rose-950/40 rounded-t-xl relative group transition-all hover:bg-rose-500 dark:hover:bg-rose-600 h-[20%] hover:h-[90%]" style={{ height: `${val}%` }}>
                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 text-xs font-semibold text-rose-600 dark:text-rose-300 bg-card dark:bg-slate-800 shadow-sm px-2 py-1 rounded border border-rose-100 dark:border-rose-800 whitespace-nowrap">
                                    {val}% Retention
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between mt-4 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                        <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                    </div>
                </Card>

                {/* Liability Breakdown */}
                <Card className="border-none shadow-sm dark:shadow-none dark:bg-slate-900/90 dark:border dark:border-slate-600 p-6 space-y-6 flex flex-col">
                    <h3 className="font-bold text-foreground">Points Liability</h3>
                    <div className="flex-1 flex flex-col justify-center items-center gap-6">
                        <div className="relative w-40 h-40 flex items-center justify-center">
                            <svg className="w-full h-full -rotate-90">
                                <circle cx="80" cy="80" r="70" fill="none" className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="12" />
                                <circle
                                    cx="80"
                                    cy="80"
                                    r="70"
                                    fill="none"
                                    stroke="#e11d48"
                                    strokeWidth="12"
                                    strokeDasharray={circumference}
                                    strokeDashoffset={strokeDashoffset}
                                    strokeLinecap="round"
                                />
                            </svg>
                            <div className="absolute text-center">
                                <p className="text-3xl font-semibold text-foreground tracking-tighter">{burnRatePct}%</p>
                                <p className="text-xs font-semibold uppercase text-muted-foreground leading-tight">Burn Rate</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 w-full">
                            <div className="p-3 bg-muted/80 dark:bg-slate-800/80 rounded-xl border border-border dark:border-slate-600">
                                <p className="text-xs font-semibold text-muted-foreground uppercase">Outstanding</p>
                                <p className="text-sm font-semibold text-foreground mt-1">{totalPointsOutstanding.toLocaleString()} Pts</p>
                            </div>
                            <div className="p-3 bg-muted/80 dark:bg-slate-800/80 rounded-xl border border-border dark:border-slate-600">
                                <p className="text-xs font-semibold text-muted-foreground uppercase">Valuation</p>
                                <p className="text-sm font-semibold text-rose-600 dark:text-rose-400 mt-1">{CURRENCY} {liabilityValuation.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                            </div>
                        </div>
                    </div>
                    <button type="button" className="w-full py-4 bg-slate-900 dark:bg-slate-950 text-white rounded-2xl font-semibold text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-black dark:hover:bg-slate-800 transition-all border border-transparent dark:border-slate-700">
                        Financial Audit Log
                    </button>
                </Card>
            </div>

            {/* Recent Campaigns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 rounded-2xl flex items-center gap-4">
                    <div className="p-3 bg-indigo-100 text-indigo-600 dark:bg-indigo-950/80 dark:text-indigo-400 rounded-xl">
                        {ICONS.target}
                    </div>
                    <div>
                        <p className="text-sm font-bold text-indigo-900 dark:text-indigo-200">Campaign Alert: Double Points Friday</p>
                        <p className="text-xs text-indigo-700 dark:text-indigo-300/90">Automation active. Tracking {Math.min(totalMembers, 1200)} participants currently.</p>
                    </div>
                </div>
                <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/60 rounded-2xl flex items-center gap-4">
                    <div className="p-3 bg-amber-100 text-amber-600 dark:bg-amber-950/80 dark:text-amber-400 rounded-xl">
                        {ICONS.alertTriangle}
                    </div>
                    <div>
                        <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Fraud System Flagged: 3 Accounts</p>
                        <p className="text-xs text-amber-700 dark:text-amber-300/90">Velocity rules triggered for rapid point earns. Manual review required.</p>
                    </div>
                </div>
            </div>

            {sampleMember && next && spendToNext > 0 && (
                <div className="p-4 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="p-3 bg-indigo-100 text-indigo-600 dark:bg-indigo-950/80 dark:text-indigo-400 rounded-xl shrink-0">
                        {ICONS.trophy}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-200 uppercase tracking-widest">Top spender path</p>
                        <p className="text-xs text-indigo-700 dark:text-indigo-300/90 font-medium">
                            Highest LTV member ({sampleMember.customerName}): spend another{' '}
                            <span className="font-semibold">{CURRENCY} {spendToNext.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>{' '}
                            to reach <span className="font-semibold italic">{next.tier}</span>.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LoyaltyDashboard;
