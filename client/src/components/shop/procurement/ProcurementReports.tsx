import React, { useState, useEffect } from 'react';
import { procurementApi, shopApi } from '../../../services/shopApi';
import { getProcurementCache, setProcurementCache } from '../../../services/procurementSyncService';
import { getTenantId } from '../../../services/posOfflineDb';
import { CURRENCY } from '../../../constants';

type ReportTab = 'ledger' | 'ap-aging' | 'inventory';

export default function ProcurementReports() {
  const [tab, setTab] = useState<ReportTab>('ledger');
  const [vendors, setVendors] = useState<any[]>([]);
  const [supplierFilter, setSupplierFilter] = useState('');
  const [ledger, setLedger] = useState<any>(null);
  const [apAging, setApAging] = useState<any>(null);
  const [inventoryVal, setInventoryVal] = useState<any>(null);
  const [loading, setLoading] = useState(false);

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
  }, [tab, supplierFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1 rounded-xl border border-border bg-muted p-1">
          {(['ledger', 'ap-aging', 'inventory'] as ReportTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`button-text rounded-lg px-4 py-2 font-semibold capitalize transition-all duration-200 active:scale-[0.98] ${
                tab === t
                  ? 'bg-card text-primary shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'ledger' ? 'Supplier Ledger' : t === 'ap-aging' ? 'AP Aging' : 'Inventory Valuation'}
            </button>
          ))}
        </div>
        {tab === 'ledger' && (
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="input input-text rounded-xl py-2"
          >
            <option value="">All suppliers</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        )}
      </div>

      {loading && <p className="body-text text-muted-foreground">Loading...</p>}

      {tab === 'ledger' && ledger && !loading && (
        <div className="card overflow-hidden p-0">
          <h3 className="section-title border-b border-border p-4">Purchases &amp; payments</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
            <div>
              <h4 className="table-header mb-2">Purchases</h4>
              <div className="max-h-96 space-y-2 overflow-y-auto">
                {(ledger.purchases || []).map((p: any) => (
                  <div key={p.id} className="body-text flex justify-between border-b border-border pb-2">
                    <span>{p.bill_number} ({p.bill_date?.slice(0, 10)})</span>
                    <span className="numeric-data text-right">
                      {CURRENCY} {Number(p.total_amount).toLocaleString()} | Due: {CURRENCY}{' '}
                      {Number(p.balance_due).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="table-header mb-2">Payments</h4>
              <div className="max-h-96 space-y-2 overflow-y-auto">
                {(ledger.payments || []).map((p: any) => (
                  <div key={p.id} className="body-text flex justify-between border-b border-border pb-2">
                    <span>{p.payment_date?.slice(0, 10)} {p.reference && `- ${p.reference}`}</span>
                    <span className="numeric-data text-emerald-600">
                      -{CURRENCY} {Number(p.amount).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {Object.keys(ledger.outstandingBySupplier || {}).length > 0 && (
            <div className="border-t border-border bg-amber-500/10 p-4 dark:bg-amber-500/5">
              <h4 className="table-header mb-2 text-warning">Outstanding by supplier</h4>
              <ul className="body-text space-y-1">
                {Object.entries(ledger.outstandingBySupplier).map(([sid, amt]: [string, any]) => (
                  <li key={sid}>
                    {vendors.find((v) => v.id === sid)?.name || sid}:{' '}
                    <span className="numeric-data">
                      {CURRENCY} {Number(amt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === 'ap-aging' && apAging && !loading && (
        <div className="card overflow-hidden p-0">
          <h3 className="section-title border-b border-border p-4">Accounts Payable Aging</h3>
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="table-header text-slate-500">Current</p>
                <p className="numeric-data text-xl font-semibold text-slate-800 dark:text-slate-100">
                  {CURRENCY} {Number(apAging.summary?.current || 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 p-4">
                <p className="table-header text-amber-700">1–30 days</p>
                <p className="numeric-data text-xl font-semibold text-amber-800">
                  {CURRENCY} {Number(apAging.summary?.days30 || 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl bg-orange-50 p-4">
                <p className="table-header text-orange-700">31–60 days</p>
                <p className="numeric-data text-xl font-semibold text-orange-800">
                  {CURRENCY} {Number(apAging.summary?.days60 || 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl bg-rose-50 p-4">
                <p className="table-header text-rose-700">61+ days</p>
                <p className="numeric-data text-xl font-semibold text-rose-800">
                  {CURRENCY} {Number(apAging.summary?.days90Plus || 0).toLocaleString()}
                </p>
              </div>
            </div>
            <p className="section-title mb-4 text-slate-700 dark:text-slate-200">
              Total outstanding:{' '}
              <span className="numeric-data">
                {CURRENCY} {Number(apAging.totalOutstanding || 0).toLocaleString()}
              </span>
            </p>
            <div className="overflow-x-auto">
              <table className="table-modern w-full">
                <thead>
                  <tr>
                    <th className="table-header pb-2">Supplier</th>
                    <th className="table-header pb-2">Bill</th>
                    <th className="table-header pb-2">Date</th>
                    <th className="table-header pb-2 text-right">Balance due</th>
                  </tr>
                </thead>
                <tbody>
                  {(apAging.rows || []).map((r: any) => (
                    <tr key={r.bill_id} className="border-b border-border">
                      <td className="py-2 text-sm">{r.supplier_name}</td>
                      <td className="py-2 text-sm">{r.bill_number}</td>
                      <td className="py-2 text-sm text-muted-foreground">{r.bill_date?.slice(0, 10)}</td>
                      <td className="numeric-data py-2 text-right">
                        {CURRENCY} {Number(r.balance_due).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'inventory' && inventoryVal && !loading && (
        <div className="card overflow-hidden p-0">
          <h3 className="section-title border-b border-border p-4">Inventory valuation (weighted average cost)</h3>
          <div className="p-6">
            <p className="section-title mb-4 text-slate-700 dark:text-slate-200">
              Total inventory value:{' '}
              <span className="numeric-data">
                {CURRENCY} {Number(inventoryVal.totalValue || 0).toLocaleString()}
              </span>
            </p>
            <div className="overflow-x-auto">
              <table className="table-modern w-full">
                <thead>
                  <tr>
                    <th className="table-header pb-2">Product</th>
                    <th className="table-header pb-2">SKU</th>
                    <th className="table-header pb-2 text-right">Qty</th>
                    <th className="table-header pb-2 text-right">Unit cost</th>
                    <th className="table-header pb-2 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {(inventoryVal.items || []).map((r: any) => (
                    <tr key={r.id} className="border-b border-border">
                      <td className="py-2 text-sm">{r.name}</td>
                      <td className="py-2 font-mono text-xs text-muted-foreground">{r.sku}</td>
                      <td className="numeric-data py-2 text-right text-sm">{Number(r.quantity_on_hand)}</td>
                      <td className="numeric-data py-2 text-right text-sm">
                        {CURRENCY} {Number(r.unit_cost).toLocaleString()}
                      </td>
                      <td className="numeric-data py-2 text-right text-sm">
                        {CURRENCY} {Number(r.total_value).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
