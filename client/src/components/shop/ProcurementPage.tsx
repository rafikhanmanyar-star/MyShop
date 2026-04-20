import React, { useState, useCallback, useRef } from 'react';
import { FileText, CreditCard, BarChart3, Building2 } from 'lucide-react';
import { InventoryProvider } from '../../context/InventoryContext';
import PurchaseBillsSection, { type PurchaseBillsSectionHandle } from './procurement/PurchaseBillsSection';
import SupplierPaymentsSection from './procurement/SupplierPaymentsSection';
import ProcurementReports from './procurement/ProcurementReports';
import VendorDirectorySection from './procurement/VendorDirectorySection';

export type PaymentPrefill = {
  supplierId: string;
  supplierName?: string;
  amount: number;
  allocations: { purchaseBillId: string; amount: number }[];
};

type TabId = 'bills' | 'payments' | 'vendors' | 'reports';

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'bills', label: 'Purchase Bills', icon: FileText },
  { id: 'payments', label: 'Supplier Payments', icon: CreditCard },
  { id: 'vendors', label: 'Vendor Directory', icon: Building2 },
  { id: 'reports', label: 'Procurement Reports', icon: BarChart3 },
];

const ProcurementPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('bills');
  const [paymentPrefill, setPaymentPrefill] = useState<PaymentPrefill | null>(null);
  const purchaseRef = useRef<PurchaseBillsSectionHandle>(null);

  const handlePayRemaining = useCallback(
    (bill: { id: string; supplier_id?: string; supplier_name?: string; balance_due: number }) => {
      const supplierId = bill.supplier_id ?? (bill as any).supplierId;
      const balanceDue = Number(bill.balance_due) || 0;
      if (!supplierId || balanceDue <= 0) return;
      setPaymentPrefill({
        supplierId,
        supplierName: bill.supplier_name ?? (bill as any).supplierName,
        amount: balanceDue,
        allocations: [{ purchaseBillId: bill.id, amount: balanceDue }],
      });
      setActiveTab('payments');
    },
    []
  );

  const clearPaymentPrefill = useCallback(() => setPaymentPrefill(null), []);

  const handleNewBill = () => {
    setActiveTab('bills');
    purchaseRef.current?.openNewPurchaseBill();
  };

  return (
    <div className="flex min-h-full flex-col bg-background transition-all duration-200">
      <header className="sticky top-0 z-20 border-b border-border bg-gradient-to-b from-primary/[0.07] to-card px-4 pb-0 pt-5 shadow-erp sm:px-8 lg:px-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:pb-2">
          <div className="min-w-0">
            <h1 className="page-title">Procurement</h1>
            <p className="secondary-text mt-1 max-w-3xl">
              Manage supplier relations, review purchase bills, and oversee procurement workflows with high-precision data
              metrics.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={handleNewBill} className="btn-primary button-text rounded-xl px-5 py-2.5 active:scale-[0.98]">
              New Bill
            </button>
          </div>
        </div>

        <nav className="mt-5 flex flex-wrap gap-0 border-b border-border/80" aria-label="Procurement sections">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`button-text -mb-px inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-all duration-200 active:scale-[0.99] sm:px-5 ${
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-90" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 lg:px-10">
        {activeTab === 'bills' && (
          <InventoryProvider>
            <PurchaseBillsSection ref={purchaseRef} onPayRemaining={handlePayRemaining} />
          </InventoryProvider>
        )}
        {activeTab === 'payments' && (
          <SupplierPaymentsSection
            initialPrefill={paymentPrefill}
            onClearPrefill={clearPaymentPrefill}
            onViewReports={() => setActiveTab('reports')}
            onNewBill={handleNewBill}
          />
        )}
        {activeTab === 'vendors' && <VendorDirectorySection />}
        {activeTab === 'reports' && <ProcurementReports onNewBill={handleNewBill} />}
      </div>
    </div>
  );
};

export default ProcurementPage;
