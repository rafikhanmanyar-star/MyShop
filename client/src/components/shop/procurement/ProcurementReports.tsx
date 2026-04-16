import React, { useState, useEffect, useCallback } from 'react';
import { Bell, Calendar, Settings } from 'lucide-react';
import { procurementApi, shopApi } from '../../../services/shopApi';
import { getProcurementCache, setProcurementCache } from '../../../services/procurementSyncService';
import { getTenantId } from '../../../services/posOfflineDb';
import APAgingReport from './APAgingReport';
import InventoryValuationReport from './InventoryValuationReport';
import SupplierLedgerReport from './SupplierLedgerReport';

type ReportTab = 'ledger' | 'ap-aging' | 'inventory';

export type ProcurementReportsProps = {
  /** Opens the new purchase bill flow (Procurement → Purchase Bills). */
  onNewBill?: () => void;
};

export default function ProcurementReports({ onNewBill }: ProcurementReportsProps) {
  const [tab, setTab] = useState<ReportTab>('ledger');
  const [vendors, setVendors] = useState<any[]>([]);
  const [supplierFilter, setSupplierFilter] = useState('');
  const [ledger, setLedger] = useState<any>(null);
  const [apAging, setApAging] = useState<any>(null);
  const [inventoryVal, setInventoryVal] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);

  useEffect(() => {
    shopApi.getVendors().then((v) => setVendors(Array.isArray(v) ? v : []));
  }, []);

  useEffect(() => {
    if (tab === 'ledger') {
      setLoading(true);
      const tenantId = getTenantId();
      const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
      if (isOnline) {
        procurementApi.getSupplierLedger(supplierFilter || undefined)
          .then((data) => {
            setLedger(data);
            if (tenantId) setProcurementCache(tenantId, { supplierLedger: data }, `ledger_${supplierFilter || 'all'}`).catch(() => {});
          })
          .catch(() => {
            if (tenantId) getProcurementCache(tenantId, `ledger_${supplierFilter || 'all'}`).then((c) => { if (c?.data?.supplierLedger) setLedger(c.data.supplierLedger); });
          })
          .finally(() => setLoading(false));
      } else if (tenantId) {
        getProcurementCache(tenantId, `ledger_${supplierFilter || 'all'}`)
          .then((c) => { if (c?.data?.supplierLedger) setLedger(c.data.supplierLedger); })
          .finally(() => setLoading(false));
      } else setLoading(false);
    } else if (tab === 'ap-aging') {
      setLoading(true);
      const tenantId = getTenantId();
      const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
      if (isOnline) {
        procurementApi.reports.apAging()
          .then((data) => {
            setApAging(data);
            if (tenantId) setProcurementCache(tenantId, { apAging: data }).catch(() => {});
          })
          .catch(() => {
            if (tenantId) getProcurementCache(tenantId).then((c) => { if (c?.data?.apAging) setApAging(c.data.apAging); });
          })
          .finally(() => setLoading(false));
      } else if (tenantId) {
        getProcurementCache(tenantId)
          .then((c) => { if (c?.data?.apAging) setApAging(c.data.apAging); })
          .finally(() => setLoading(false));
      } else setLoading(false);
    } else if (tab === 'inventory') {
      setLoading(true);
      const tenantId = getTenantId();
      const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
      if (isOnline) {
        procurementApi.reports.inventoryValuation()
          .then((data) => {
            setInventoryVal(data);
            if (tenantId) setProcurementCache(tenantId, { inventoryValuation: data }).catch(() => {});
          })
          .catch(() => {
            if (tenantId) getProcurementCache(tenantId).then((c) => { if (c?.data?.inventoryValuation) setInventoryVal(c.data.inventoryValuation); });
          })
          .finally(() => setLoading(false));
      } else if (tenantId) {
        getProcurementCache(tenantId)
          .then((c) => { if (c?.data?.inventoryValuation) setInventoryVal(c.data.inventoryValuation); })
          .finally(() => setLoading(false));
      } else setLoading(false);
    }
  }, [tab, supplierFilter, inventoryRefreshKey]);

  const refetchInventoryValuation = useCallback(() => {
    setInventoryRefreshKey((k) => k + 1);
  }, []);

  const exportInventoryCsv = useCallback(() => {
    const items = inventoryVal?.items;
    if (!Array.isArray(items) || items.length === 0) return;
    const escape = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const lines: string[] = [
      ['Product name', 'SKU', 'Quantity', 'Unit cost', 'Total value', 'Stock status'].join(','),
    ];
    for (const r of items as any[]) {
      const rp = Math.max(1, Number(r.reorder_point ?? 10) || 10);
      const q = Number(r.quantity_on_hand) || 0;
      let status = 'HEALTHY';
      if (q <= rp) status = 'LOW STOCK';
      else if (q <= rp * 3) status = 'MEDIUM';
      lines.push(
        [
          escape(String(r.name ?? '')),
          escape(String(r.sku ?? '')),
          String(q),
          String(Number(r.unit_cost) || 0),
          String(Number(r.total_value) || 0),
          escape(status),
        ].join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `inventory-valuation-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [inventoryVal]);

  const exportApAgingCsv = useCallback(() => {
    if (!apAging?.rows?.length) return;
    const now = new Date();
    const escape = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const lines: string[] = [
      ['Supplier', 'Invoice', 'Due date', 'Days overdue', 'Amount', 'Aging bucket'].join(','),
    ];
    for (const r of apAging.rows as any[]) {
      const rawDue = r.due_date || r.bill_date;
      const due = rawDue ? new Date(rawDue) : null;
      let days = 0;
      if (due && !Number.isNaN(due.getTime())) {
        days = Math.floor((now.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
      }
      const d = Math.max(0, days);
      let bucket = 'CURRENT';
      if (d <= 0) bucket = 'CURRENT';
      else if (d <= 30) bucket = '1-30 DAYS';
      else if (d <= 60) bucket = '31-60 DAYS';
      else bucket = '61+ DAYS';
      const inv = `#${r.bill_number || ''}`;
      const dueStr = rawDue ? new Date(rawDue).toISOString().slice(0, 10) : '';
      lines.push(
        [
          escape(String(r.supplier_name || '')),
          escape(inv),
          escape(dueStr),
          String(d),
          String(Number(r.balance_due) || 0),
          escape(bucket),
        ].join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ap-aging-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [apAging]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <nav className="flex min-w-0 flex-wrap gap-6 border-b border-slate-200 lg:border-0 lg:pb-0 dark:border-slate-700" aria-label="Report sections">
            {(['ledger', 'ap-aging', 'inventory'] as ReportTab[]).map((t) => {
              const label =
                t === 'ledger' ? 'Supplier Ledger' : t === 'ap-aging' ? 'AP Aging' : 'Inventory Valuation';
              const active = tab === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`relative pb-3 text-sm font-semibold transition-colors lg:pb-1 ${
                    active
                      ? 'text-[#1e3a5f] dark:text-indigo-400'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {label}
                  {active ? (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#1e3a5d] dark:bg-indigo-500 lg:bottom-[-2px]" />
                  ) : null}
                </button>
              );
            })}
          </nav>

          <div className="flex flex-wrap items-center justify-end gap-2 lg:gap-3">
            {tab === 'ledger' && (
              <select
                aria-label="Filter supplier for ledger"
                title="Filter supplier for ledger"
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="input input-text min-w-[200px] rounded-xl border-slate-200 py-2 dark:border-slate-600"
              >
                <option value="">All suppliers</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            )}

            {tab === 'ap-aging' && (
              <>
                <div className="mr-1 flex items-center gap-0.5 text-slate-500 dark:text-slate-400">
                  <button
                    type="button"
                    className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="Calendar"
                  >
                    <Calendar className="h-5 w-5" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="Notifications"
                  >
                    <Bell className="h-5 w-5" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="Settings"
                  >
                    <Settings className="h-5 w-5" strokeWidth={1.75} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={exportApAgingCsv}
                  className="text-sm font-semibold text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                >
                  Export
                </button>
                {onNewBill ? (
                  <button
                    type="button"
                    onClick={onNewBill}
                    className="rounded-xl bg-[#1e3a5f] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#152a45] dark:bg-indigo-700 dark:hover:bg-indigo-600"
                  >
                    New Bill
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-12 text-center text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          Loading report…
        </div>
      )}

      {tab === 'ledger' && ledger && !loading && <SupplierLedgerReport data={ledger} />}

      {tab === 'ap-aging' && !loading && apAging && <APAgingReport data={apAging} />}
      {tab === 'ap-aging' && !loading && !apAging && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-12 text-center text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          No AP aging data available. Check your connection or try again.
        </div>
      )}

      {tab === 'inventory' && inventoryVal && !loading && (
        <InventoryValuationReport
          data={inventoryVal}
          onExportCsv={exportInventoryCsv}
          onNewBill={onNewBill}
          onManualReconcile={refetchInventoryValuation}
        />
      )}
      {tab === 'inventory' && !loading && !inventoryVal && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-12 text-center text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          No inventory valuation data available. Check your connection or try again.
        </div>
      )}
    </div>
  );
}
