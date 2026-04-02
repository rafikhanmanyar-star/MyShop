
import React from 'react';
import { useLoyalty } from '../../../context/LoyaltyContext';
import { ICONS } from '../../../constants';
import Card from '../../ui/Card';

const TierMatrix: React.FC = () => {
    const { tiers, programs } = useLoyalty();

    return (
        <div className="space-y-8 animate-fade-in text-foreground">
            {/* Active Rules Snapshot */}
            <div className="flex justify-between items-center mb-4 px-2">
                <div>
                    <h3 className="text-lg font-semibold text-foreground dark:text-slate-200 tracking-tight">Enterprise Rule Engine</h3>
                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Global configurations for earning & burning.</p>
                </div>
                <div className="flex gap-3">
                    <button className="px-4 py-2 bg-slate-900 dark:bg-slate-800 text-white rounded-xl text-xs font-semibold uppercase tracking-widest shadow-lg hover:bg-black dark:hover:bg-slate-700 transition-all border border-transparent dark:border-slate-600">
                        {ICONS.settings} Configuration Wizard
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Earning Rules */}
                <Card className="border-none shadow-sm p-8 bg-card space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                            {ICONS.plus}
                        </div>
                        <h4 className="font-semibold text-foreground uppercase tracking-widest text-sm">Base Earning Rules</h4>
                    </div>
                    {programs.map(prog => (
                        <div key={prog.id} className="p-6 bg-muted/80 dark:bg-slate-800/60 rounded-2xl border border-border dark:border-slate-600 space-y-4">
                            <div className="flex justify-between items-center pb-4 border-b border-border/50 dark:border-slate-600/80">
                                <span className="text-xs font-bold text-muted-foreground uppercase">Conversion Ratio</span>
                                <span className="text-sm font-semibold text-foreground font-mono">1 Point per {1 / prog.earnRate} PKR</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-muted-foreground uppercase">Min Redemption</span>
                                <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 font-mono">{prog.minRedeemPoints} Pts</span>
                            </div>
                        </div>
                    ))}
                    <div className="space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.2em] mb-4">Bonus Multipliers</p>
                        <div className="flex flex-wrap gap-2">
                            <span className="px-3 py-1.5 bg-amber-50 border border-amber-100 text-amber-600 dark:bg-amber-950/40 dark:border-amber-900/60 dark:text-amber-400 rounded-full text-xs font-semibold uppercase">Weekend 1.2x</span>
                            <span className="px-3 py-1.5 bg-indigo-50 border border-indigo-100 text-indigo-600 dark:bg-indigo-950/40 dark:border-indigo-900/60 dark:text-indigo-400 rounded-full text-xs font-semibold uppercase">Birthday 2.0x</span>
                            <span className="px-3 py-1.5 bg-rose-50 border border-rose-100 text-rose-600 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-400 rounded-full text-xs font-semibold uppercase">Welcome Bonus: 500 Pts</span>
                        </div>
                    </div>
                </Card>

                {/* Redemption Rules */}
                <Card className="border-none shadow-sm dark:shadow-none dark:bg-slate-900/90 dark:border dark:border-slate-600 p-8 bg-card space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 rounded-lg">
                            {ICONS.trash}
                        </div>
                        <h4 className="font-semibold text-foreground uppercase tracking-widest text-sm">Redemption Controls</h4>
                    </div>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center p-4 bg-rose-50/30 dark:bg-rose-950/30 rounded-xl border border-rose-100 dark:border-rose-900/50">
                            <div>
                                <p className="text-xs font-semibold text-rose-900 dark:text-rose-200">Maximum Redemption / Bill</p>
                                <p className="text-xs text-rose-600 dark:text-rose-400 opacity-70">Capped to prevent point dumping.</p>
                            </div>
                            <span className="text-sm font-semibold text-rose-900 dark:text-rose-200">30% of Bill</span>
                        </div>
                        <div className="flex justify-between items-center p-4 bg-muted/80 dark:bg-slate-800/60 rounded-xl border border-border dark:border-slate-600">
                            <div>
                                <p className="text-xs font-semibold text-foreground">Point Expiry Period</p>
                                <p className="text-xs text-muted-foreground">Rolling window for issued points.</p>
                            </div>
                            <span className="text-sm font-semibold text-foreground">12 Months</span>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Tier Ladder Matrix */}
            <div className="mt-12 space-y-6 px-2">
                <h3 className="text-lg font-semibold text-foreground uppercase tracking-widest text-center">Benefit Tier Lifecycle Matrix</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {tiers.map((t, i) => (
                        <Card key={i} className={`p-8 border-none shadow-xl dark:shadow-none transform transition-all hover:-translate-y-2 flex flex-col items-center relative overflow-hidden ${t.tier === 'Platinum' ? 'bg-slate-900 text-white dark:bg-slate-950' :
                                t.tier === 'Gold' ? 'bg-amber-50 border-t-8 border-amber-400 dark:bg-amber-950/40 dark:border-amber-500 dark:text-amber-100' :
                                    'bg-card border-t-8 border-border dark:bg-slate-900/90 dark:border-slate-600'
                            }`}>
                            {t.tier === 'Platinum' && (
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    {React.cloneElement(ICONS.trophy as React.ReactElement<any>, { width: 120, height: 120 })}
                                </div>
                            )}
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 shadow-2xl ${t.tier === 'Platinum' ? 'bg-indigo-500/20 text-indigo-300' :
                                    t.tier === 'Gold' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-300' :
                                        'bg-muted text-muted-foreground dark:bg-slate-800'
                                }`}>
                                {React.cloneElement(ICONS.trophy as React.ReactElement<any>, { width: 32, height: 32 })}
                            </div>
                            <h4 className={`text-2xl font-semibold mb-1 ${t.tier === 'Gold' ? 'text-amber-950 dark:text-amber-100' : ''}`}>{t.tier}</h4>
                            <p className={`text-xs font-semibold uppercase tracking-widest inline-block px-3 py-1 rounded-full mb-8 ${t.tier === 'Platinum' ? 'bg-indigo-500/30 text-indigo-400' : 'bg-slate-200/50 text-muted-foreground dark:bg-slate-700 dark:text-slate-300'
                                }`}>
                                Threshold: ${t.threshold.toLocaleString()}
                            </p>

                            <div className="w-full space-y-4 flex-1">
                                <p className="text-xs font-semibold uppercase tracking-widest opacity-40 mb-2">Member Privileges</p>
                                {t.benefits.map((b, idx) => (
                                    <div key={idx} className={`flex items-center gap-2 text-xs font-bold leading-relaxed ${t.tier === 'Gold' ? 'text-amber-900 dark:text-amber-200/90' : ''}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${t.tier === 'Platinum' ? 'bg-indigo-400' : 'bg-emerald-500 dark:bg-emerald-400'}`}></div>
                                        {b}
                                    </div>
                                ))}
                            </div>

                            <div className="mt-8 pt-6 border-t border-border/20 dark:border-slate-600/80 w-full text-center">
                                <span className={`text-xl font-semibold font-mono ${t.tier === 'Platinum' ? 'text-indigo-400' : t.tier === 'Gold' ? 'text-amber-900 dark:text-amber-200' : 'text-foreground dark:text-slate-200'}`}>{t.multiplier}x</span>
                                <p className="text-xs font-semibold uppercase tracking-tighter opacity-40 mt-1">Multiplied Earn Velocity</p>
                            </div>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TierMatrix;
