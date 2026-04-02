
import React, { useState } from 'react';
import { BIProvider, useBI } from '../../context/BIContext';
import ExecutiveOverview from './bi/ExecutiveOverview';
import SalesAnalytics from './bi/SalesAnalytics';
import InventoryIntelligence from './bi/InventoryIntelligence';
import ProfitabilityAnalysis from './bi/ProfitabilityAnalysis';
import { ICONS } from '../../constants';

const BIContent: React.FC = () => {
    const { dateRange, setDateRange } = useBI();
    const [activeTab, setActiveTab] = useState<'overview' | 'sales' | 'inventory' | 'profit'>('overview');

    const handleExport = () => {
        alert(`Exporting BI Report for ${dateRange}...`);
        // In real app, trigger PDF/CSV generation here
    };

    const tabs = [
        { id: 'overview', label: 'Executive Overview', icon: ICONS.barChart },
        { id: 'sales', label: 'Sales Analytics', icon: ICONS.trendingUp },
        { id: 'inventory', label: 'Inventory Intelligence', icon: ICONS.package },
        { id: 'profit', label: 'Profitability Analysis', icon: ICONS.dollarSign },
    ];

    return (
        <div className="flex flex-col h-full min-h-0 flex-1 bg-muted/80 dark:bg-slate-800 -m-4 md:-m-8">
            {/* Header / Tab Navigation */}
            <div className="bg-slate-900 dark:bg-slate-950 border-b border-white/10 dark:border-slate-700/80 px-8 pt-8 shadow-2xl z-20 shrink-0">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-500 dark:bg-indigo-600 rounded-lg text-white shadow-lg shadow-indigo-500/20">
                                {ICONS.globe}
                            </div>
                            <h1 className="text-2xl font-semibold text-white tracking-tight">Intelligence Engine</h1>
                        </div>
                        <p className="text-slate-400 text-sm font-medium mt-1">Enterprise Analytics & Predictive Decision Support.</p>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap justify-end">
                        <div className="flex bg-card/5 dark:bg-slate-800/50 rounded-xl p-1 border border-white/10 dark:border-slate-600">
                            {['Today', 'MTD', 'QTD', 'YTD'].map(range => (
                                <button
                                    key={range}
                                    onClick={() => setDateRange(range)}
                                    className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${dateRange === range
                                        ? 'bg-indigo-600 text-white shadow-lg'
                                        : 'text-slate-400 hover:text-white dark:text-slate-500 dark:hover:text-slate-200'
                                        }`}
                                >
                                    {range}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={handleExport}
                            className="p-3 bg-card/5 dark:bg-slate-800/50 text-white rounded-xl border border-white/10 dark:border-slate-600 hover:bg-card/10 dark:hover:bg-slate-700/80 transition-all"
                            title="Export Report"
                        >
                            {ICONS.download}
                        </button>
                    </div>
                </div>

                <div className="flex gap-8 overflow-x-auto pb-1">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`pb-4 text-sm tracking-wide transition-all duration-300 relative flex items-center gap-2 shrink-0 ${activeTab === tab.id
                                ? 'text-primary font-semibold'
                                : 'font-medium text-slate-400 hover:text-white dark:text-slate-500 dark:hover:text-slate-200'
                                }`}
                        >
                            {React.cloneElement(tab.icon as React.ReactElement<any>, { width: 18, height: 18 })}
                            {tab.label}
                            {activeTab === tab.id && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-full shadow-[0_-4px_12px_rgba(99,102,241,0.5)]"></div>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 min-h-0 overflow-y-auto p-8 custom-scrollbar">
                {activeTab === 'overview' && <ExecutiveOverview />}
                {activeTab === 'sales' && <SalesAnalytics />}
                {activeTab === 'inventory' && <InventoryIntelligence />}
                {activeTab === 'profit' && <ProfitabilityAnalysis />}
            </div>
        </div>
    );
};

const BIDashboardsPage: React.FC = () => {
    return (
        <BIProvider>
            <BIContent />
        </BIProvider>
    );
};

export default BIDashboardsPage;
