import React, { useState } from 'react';
import { FileText, CreditCard, BarChart3 } from 'lucide-react';
import PurchaseBillsSection from './procurement/PurchaseBillsSection';
import SupplierPaymentsSection from './procurement/SupplierPaymentsSection';
import ProcurementReports from './procurement/ProcurementReports';

type TabId = 'bills' | 'payments' | 'reports';

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'bills', label: 'Purchase Bills', icon: FileText },
  { id: 'payments', label: 'Supplier Payments', icon: CreditCard },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
];

const ProcurementPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('bills');

  return (
    <div className="flex flex-col h-full bg-slate-50 -m-4 md:-m-8">
      <div className="bg-white border-b border-slate-200 px-8 pt-6 shadow-sm z-10">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Procurement & Supplier Payments</h1>
          <p className="text-slate-500 text-sm font-medium">
            Purchase bills, supplier payments, and double-entry accounting. Inventory is recorded as an asset; COGS when sold.
          </p>
        </div>
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-4 text-sm font-bold transition-all relative flex items-center gap-2 ${
                activeTab === tab.id ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-t-full" />
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-8">
        {activeTab === 'bills' && <PurchaseBillsSection />}
        {activeTab === 'payments' && <SupplierPaymentsSection />}
        {activeTab === 'reports' && <ProcurementReports />}
      </div>
    </div>
  );
};

export default ProcurementPage;
