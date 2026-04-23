
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BIProvider, useBI } from '../../context/BIContext';
import ExecutiveOverview from './bi/ExecutiveOverview';
import SalesAnalytics from './bi/SalesAnalytics';
import InventoryIntelligence from './bi/InventoryIntelligence';
import ProfitabilityAnalysis from './bi/ProfitabilityAnalysis';
import { ICONS } from '../../constants';

const ProcurementDemand = lazy(() => import('./bi/ProcurementDemand'));

const BI_TAB_IDS = ['overview', 'sales', 'inventory', 'profit', 'procurement'] as const;
type BITabId = (typeof BI_TAB_IDS)[number];

const PERIOD_OPTIONS = ['Today', 'MTD', 'QTD', 'YTD'] as const;

function isValidBITab(t: string | null): t is BITabId {
    return t !== null && (BI_TAB_IDS as readonly string[]).includes(t);
}

const BIContent: React.FC = () => {
    const { dateRange, setDateRange } = useBI();
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = searchParams.get('tab');
    const [activeTab, setActiveTab] = useState<BITabId>(() =>
        isValidBITab(tabParam) ? tabParam : 'overview'
    );

    useEffect(() => {
        if (isValidBITab(tabParam)) {
            setActiveTab(tabParam);
        }
    }, [tabParam]);

    const goToTab = (id: BITabId) => {
        setActiveTab(id);
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                next.set('tab', id);
                return next;
            },
            { replace: false }
        );
    };

    const handleExport = () => {
        alert(`Exporting BI Report for ${dateRange}...`);
    };

    const tabs = [
        { id: 'overview' as const, label: 'Executive Overview' },
        { id: 'sales' as const, label: 'Sales Analytics' },
        { id: 'inventory' as const, label: 'Inventory Intelligence' },
        { id: 'profit' as const, label: 'Profitability Analysis' },
        { id: 'procurement' as const, label: 'Procurement Demand' },
    ];

    return (
        <div className="flex w-full min-w-0 min-h-0 flex-1 flex-col bg-[#ECEFF3] dark:bg-slate-900">
            <header className="z-20 shrink-0 border-b border-slate-200/90 bg-white px-6 pt-6 shadow-sm dark:border-slate-700 dark:bg-slate-950 sm:px-8 sm:pt-8">
                <div className="mb-6 max-w-5xl">
                    <h1 className="text-2xl font-bold tracking-tight text-[#0B2A5B] dark:text-slate-100 sm:text-[1.65rem]">
                        Intelligence Engine — Enterprise Analytics &amp; Predictive Decision Support
                    </h1>
                    <p className="mt-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
                        Real-time performance monitoring and demand forecasting across your supply chain nodes.
                    </p>
                </div>

                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <nav
                        className="flex min-w-0 gap-0 overflow-x-auto border-b border-slate-200 dark:border-slate-700"
                        aria-label="Analytics sections"
                    >
                        {tabs.map((tab) => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => goToTab(tab.id)}
                                    className={`relative shrink-0 whitespace-nowrap px-1 pb-3 text-sm font-semibold transition-colors sm:px-2 ${
                                        isActive
                                            ? 'text-[#0B2A5B] dark:text-[#7eb8ff]'
                                            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                                    }`}
                                >
                                    {tab.label}
                                    {isActive && (
                                        <span
                                            className="absolute bottom-0 left-0 right-0 h-1 rounded-t bg-[#0047AB] dark:bg-[#5b8cff]"
                                            aria-hidden
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </nav>

                    <div className="flex shrink-0 items-center gap-2 pb-3 lg:pb-0">
                        <div className="flex items-center gap-0.5 rounded-full border border-slate-200/80 bg-slate-100/90 p-1 dark:border-slate-600 dark:bg-slate-800/80">
                            {PERIOD_OPTIONS.map((range) => (
                                <button
                                    key={range}
                                    type="button"
                                    onClick={() => setDateRange(range)}
                                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all sm:px-4 ${
                                        dateRange === range
                                            ? 'bg-[#0047AB] text-white shadow-sm dark:bg-[#0047AB]'
                                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                                    }`}
                                >
                                    {range}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={handleExport}
                                className="ml-0.5 flex h-8 w-8 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-white hover:text-[#0047AB] dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-[#5b8cff]"
                                title="Download report"
                                aria-label="Download report"
                            >
                                {ICONS.download}
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-6 sm:p-8">
                {activeTab === 'overview' && <ExecutiveOverview />}
                {activeTab === 'sales' && <SalesAnalytics />}
                {activeTab === 'inventory' && <InventoryIntelligence />}
                {activeTab === 'profit' && <ProfitabilityAnalysis />}
                {activeTab === 'procurement' && (
                    <Suspense
                        fallback={
                            <div className="flex items-center justify-center py-20">
                                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0047AB] border-t-transparent" />
                            </div>
                        }
                    >
                        <ProcurementDemand />
                    </Suspense>
                )}
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
