
import React from 'react';
import { useLoyalty } from '../../../context/LoyaltyContext';
import { ICONS } from '../../../constants';
import Card from '../../ui/Card';

const CampaignManager: React.FC = () => {
    const { campaigns } = useLoyalty();

    return (
        <div className="space-y-6 animate-fade-in shadow-inner">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-foreground dark:text-slate-200 tracking-tight">Promotional Campaign Lifecycle</h3>
                <button className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-100 dark:shadow-rose-900/40 hover:bg-rose-700 transition-all flex items-center gap-2">
                    {ICONS.target} Launch Campaign
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {campaigns.map(camp => (
                    <Card key={camp.id} className="relative overflow-hidden group border-none shadow-sm dark:shadow-none hover:shadow-xl transition-all h-[320px] flex flex-col p-8 bg-card dark:bg-slate-900/90 border-b-4 border-border dark:border-slate-600">
                        {/* Status Overlay */}
                        <div className="flex justify-between items-start mb-6">
                            <div className={`p-4 rounded-2xl ${camp.type === 'DoublePoints' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400' :
                                    camp.type === 'FlashSale' ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400' :
                                        'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'
                                }`}>
                                {React.cloneElement(ICONS.target as React.ReactElement<any>, { width: 24, height: 24 })}
                            </div>
                            <span className={`px-2 py-1 rounded text-xs font-semibold uppercase tracking-widest ${camp.status === 'Active' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100 dark:shadow-emerald-900/40' :
                                    camp.status === 'Scheduled' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 dark:shadow-indigo-900/40' :
                                        'bg-slate-200 text-muted-foreground dark:bg-slate-700 dark:text-slate-300'
                                }`}>
                                {camp.status}
                            </span>
                        </div>

                        <div className="flex-1 space-y-2">
                            <h4 className="text-xl font-semibold text-foreground tracking-tight group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">{camp.name}</h4>
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{camp.type}</p>

                            <div className="pt-6 space-y-4">
                                <div className="flex items-center justify-between text-xs font-bold">
                                    <span className="text-muted-foreground uppercase">Targeting Segment</span>
                                    <span className="text-foreground bg-muted dark:bg-slate-800 px-2 py-0.5 rounded italic">{camp.targetSegment}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs font-bold">
                                    <span className="text-muted-foreground uppercase">Duration</span>
                                    <span className="text-muted-foreground">{new Date(camp.startDate).toLocaleDateString()} - {new Date(camp.endDate).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>

                        <div className="pt-6 border-t border-slate-50 dark:border-slate-700 flex gap-2">
                            <button className="flex-1 py-3 bg-muted/80 dark:bg-slate-800 text-muted-foreground rounded-xl text-xs font-semibold uppercase tracking-widest hover:bg-muted dark:hover:bg-slate-700 transition-all">
                                Edit Campaign
                            </button>
                            <button className="px-3 bg-muted dark:bg-slate-800 text-muted-foreground rounded-xl hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 transition-all">
                                {ICONS.trash}
                            </button>
                        </div>
                    </Card>
                ))}

                {/* Create New Placeholder */}
                <button className="h-[320px] border-4 border-dashed border-border dark:border-slate-600 rounded-3xl flex flex-col items-center justify-center gap-4 text-slate-300 dark:text-slate-600 hover:border-rose-300 dark:hover:border-rose-500/50 hover:text-rose-400 transition-all group p-12">
                    <div className="w-16 h-16 bg-muted/80 dark:bg-slate-800 rounded-full flex items-center justify-center group-hover:bg-rose-50 dark:group-hover:bg-rose-950/40 transition-colors">
                        {React.cloneElement(ICONS.plus as React.ReactElement<any>, { width: 32, height: 32 })}
                    </div>
                    <div className="text-center">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em]">New Campaign</p>
                        <p className="text-xs font-medium italic mt-1 bg-muted/80 dark:bg-slate-800 px-2 py-0.5 rounded text-muted-foreground">Deploy high-ROI retention rules</p>
                    </div>
                </button>
            </div>
        </div>
    );
};

export default CampaignManager;
