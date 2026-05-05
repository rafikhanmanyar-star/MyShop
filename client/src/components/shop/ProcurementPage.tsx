import React, { useState, useRef, useCallback, useMemo } from 'react';
import { FileText, BarChart3, Building2 } from 'lucide-react';
import { InventoryProvider } from '../../context/InventoryContext';
import PurchaseBillsSection, { type PurchaseBillsSectionHandle } from './procurement/PurchaseBillsSection';
import ProcurementReports from './procurement/ProcurementReports';
import VendorDirectorySection from './procurement/VendorDirectorySection';
import { useRegisterProcurementPageHeader, type ProcurementTabId } from '../../context/ProcurementPageHeaderContext';

const ProcurementPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ProcurementTabId>('bills');
  const purchaseRef = useRef<PurchaseBillsSectionHandle>(null);

  const handleNewBill = useCallback(() => {
    setActiveTab('bills');
    purchaseRef.current?.openNewPurchaseBill();
  }, []);

  const tabs = useMemo(
    () => [
      { id: 'bills' as const, label: 'Purchase Bills', icon: <FileText /> },
      { id: 'vendors' as const, label: 'Vendor Directory', icon: <Building2 /> },
      { id: 'reports' as const, label: 'Procurement Reports', icon: <BarChart3 /> },
    ],
    []
  );

  const procurementHeaderPayload = useMemo(
    () => ({
      activeTab,
      setActiveTab,
      tabs: [...tabs],
    }),
    [activeTab, tabs]
  );

  useRegisterProcurementPageHeader(procurementHeaderPayload);

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col px-4 py-4 sm:px-6 lg:px-8">
      {activeTab === 'bills' && (
        <InventoryProvider>
          <PurchaseBillsSection ref={purchaseRef} />
        </InventoryProvider>
      )}
      {activeTab === 'vendors' && <VendorDirectorySection />}
      {activeTab === 'reports' && <ProcurementReports onNewBill={handleNewBill} />}
    </div>
  );
};

export default ProcurementPage;
