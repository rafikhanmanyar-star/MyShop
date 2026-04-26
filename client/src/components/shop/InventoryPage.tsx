import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRegisterInventoryPageHeader, type InventoryTabId } from '../../context/InventoryPageHeaderContext';
import { InventoryProvider, useInventory } from '../../context/InventoryContext';
import InventoryDashboard from './inventory/InventoryDashboard';
import StockMaster from './inventory/StockMaster';
import StockMovements from './inventory/StockMovements';
import StockAdjustments from './inventory/StockAdjustments';
import InventoryCategories from './inventory/InventoryCategories';
import InventoryBrands from './inventory/InventoryBrands';
import IncompleteProductsTab from './inventory/IncompleteProductsTab';
import { ICONS } from '../../constants';
import AddOrEditSkuModal from './pos/AddOrEditSkuModal';
const INVENTORY_TABS: readonly InventoryTabId[] = [
    'dashboard', 'stock', 'movements', 'adjustments', 'categories', 'brands', 'incomplete',
];

const InventoryContent: React.FC = () => {
    const { refreshItems } = useInventory();
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<InventoryTabId>(() => {
        try {
            const p = new URLSearchParams(window.location.search).get('tab');
            if (p && (INVENTORY_TABS as readonly string[]).includes(p)) return p as InventoryTabId;
        } catch {
            /* empty */
        }
        return 'dashboard';
    });
    const [isNewSkuModalOpen, setIsNewSkuModalOpen] = useState(false);

    const setTab = (t: InventoryTabId) => {
        setActiveTab(t);
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                if (t === 'dashboard') next.delete('tab');
                else next.set('tab', t);
                return next;
            },
            { replace: true }
        );
    };

    useEffect(() => {
        refreshItems();
    }, [refreshItems]);

    const tabs = useMemo(
        () =>
            [
                { id: 'dashboard' as const, label: 'Dashboard', icon: ICONS.barChart },
                { id: 'stock' as const, label: 'Stock Master', icon: ICONS.package },
                { id: 'movements' as const, label: 'Movements', icon: ICONS.trendingUp },
                { id: 'adjustments' as const, label: 'Adjustments', icon: ICONS.settings },
                { id: 'categories' as const, label: 'Categories', icon: ICONS.folder },
                { id: 'brands' as const, label: 'Brands', icon: ICONS.layers },
                { id: 'incomplete' as const, label: 'Incomplete SKUs', icon: ICONS.alertTriangle },
            ] as const,
        []
    );

    useEffect(() => {
        const p = searchParams.get('tab');
        if (p && (INVENTORY_TABS as readonly string[]).includes(p)) {
            setActiveTab(p as InventoryTabId);
        } else {
            setActiveTab('dashboard');
        }
    }, [searchParams]);

    const inventoryHeaderPayload = useMemo(
        () => ({
            activeTab,
            setActiveTab: setTab,
            onNewSku: () => setIsNewSkuModalOpen(true),
            tabs: [...tabs],
        }),
        [activeTab, tabs]
    );

    useRegisterInventoryPageHeader(inventoryHeaderPayload);

    return (
        <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col bg-gray-50 dark:bg-slate-950">
            {/* Content area: flex so Stock Master / Dashboard / Movements can fill and scroll internally; other tabs can scroll here */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className={`flex-1 min-h-0 min-w-0 flex flex-col ${['stock', 'dashboard', 'movements', 'categories', 'brands', 'incomplete'].includes(activeTab) ? 'overflow-hidden' : 'overflow-y-auto'}`}>
                    {activeTab === 'dashboard' && <div className="flex-1 min-h-0 flex flex-col"><InventoryDashboard /></div>}
                    {activeTab === 'stock' && <div className="flex-1 min-h-0 flex flex-col"><StockMaster /></div>}
                    {activeTab === 'movements' && <div className="flex-1 min-h-0 flex flex-col"><StockMovements /></div>}
                    {activeTab === 'adjustments' && <StockAdjustments />}
                    {activeTab === 'categories' && (
                        <div className="flex-1 min-h-0 flex flex-col min-w-0">
                            <InventoryCategories />
                        </div>
                    )}
                    {activeTab === 'brands' && (
                        <div className="flex-1 min-h-0 flex flex-col min-w-0">
                            <InventoryBrands />
                        </div>
                    )}
                    {activeTab === 'incomplete' && (
                        <div className="flex min-h-0 flex-1 flex-col">
                            <IncompleteProductsTab />
                        </div>
                    )}
                </div>
            </div>

            <AddOrEditSkuModal
                isOpen={isNewSkuModalOpen}
                onClose={() => setIsNewSkuModalOpen(false)}
                openInAddMode
                closeOnBackFromAdd
            />
        </div>
    );
};

const InventoryPage: React.FC = () => {
    return (
        <InventoryProvider>
            <InventoryContent />
        </InventoryProvider>
    );
};

export default InventoryPage;
