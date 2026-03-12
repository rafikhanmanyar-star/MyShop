import React, { useState, useRef } from 'react';
import Card from '../../ui/Card';
import Button from '../../ui/Button';
import { shopApi, procurementApi, dataApi, ImportRowError } from '../../../services/shopApi';
import { downloadTemplate, downloadExport, parseExcelFile, DataType } from '../../../services/dataExportImport';
import { FileSpreadsheet, Download, Upload, AlertCircle } from 'lucide-react';

type DataKind = 'skus' | 'inventory' | 'bills' | 'payments';

const LABELS: Record<DataKind, string> = {
  skus: 'SKUs (Products)',
  inventory: 'Inventory quantity',
  bills: 'Purchase bills',
  payments: 'Bill payments',
};

export default function DataExportImportSection() {
  const [importing, setImporting] = useState<DataKind | null>(null);
  const [lastImportKind, setLastImportKind] = useState<DataKind | null>(null);
  const [importErrors, setImportErrors] = useState<ImportRowError[] | null>(null);
  const [importSuccess, setImportSuccess] = useState<number | null>(null);
  const [exporting, setExporting] = useState<DataKind | null>(null);
  const fileInputRefs = useRef<Record<DataKind, HTMLInputElement | null>>({
    skus: null,
    inventory: null,
    bills: null,
    payments: null,
  });

  const handleDownloadTemplate = (type: DataKind) => {
    downloadTemplate(type as DataType);
  };

  const handleExport = async (kind: DataKind) => {
    setExporting(kind);
    setImportErrors(null);
    setImportSuccess(null);
    try {
      if (kind === 'skus') {
        const data = await shopApi.getProducts();
        const rows = (Array.isArray(data) ? data : []).map((p: any) => ({
          Name: p.name,
          SKU: p.sku,
          Barcode: p.barcode ?? '',
          Category: '',
          Unit: p.unit ?? 'pcs',
          'Cost Price': p.cost_price ?? 0,
          'Retail Price': p.retail_price ?? 0,
          'Tax Rate (%)': p.tax_rate ?? 0,
          'Reorder Point': p.reorder_point ?? 10,
        }));
        downloadExport('skus', rows);
      } else if (kind === 'inventory') {
        const data = await shopApi.getInventory();
        const rows = (Array.isArray(data) ? data : []).map((i: any) => ({
          SKU: i.sku,
          'Warehouse Code': i.warehouse_name ?? 'MAIN',
          Quantity: i.quantity_on_hand ?? 0,
        }));
        downloadExport('inventory', rows);
      } else if (kind === 'bills') {
        const bills = await procurementApi.getPurchaseBills();
        const list = Array.isArray(bills) ? bills : [];
        const rows: any[] = [];
        for (const b of list) {
          const full = await procurementApi.getPurchaseBillById(b.id).catch(() => null);
          const items = full?.items ?? [];
          if (items.length === 0) {
            rows.push({
              'Bill Number': b.bill_number,
              'Bill Date': b.bill_date?.slice?.(0, 10),
              'Due Date': b.due_date?.slice?.(0, 10) ?? '',
              'Supplier Name': b.supplier_name ?? '',
              SKU: '',
              Quantity: '',
              'Unit Cost': '',
              'Tax Amount': '',
              Subtotal: '',
            });
          } else {
            items.forEach((it: any, idx: number) => {
              rows.push({
                'Bill Number': b.bill_number,
                'Bill Date': b.bill_date?.slice?.(0, 10),
                'Due Date': b.due_date?.slice?.(0, 10) ?? '',
                'Supplier Name': b.supplier_name ?? '',
                SKU: it.sku ?? '',
                Quantity: it.quantity ?? 0,
                'Unit Cost': it.unit_cost ?? 0,
                'Tax Amount': it.tax_amount ?? 0,
                Subtotal: it.subtotal ?? 0,
              });
            });
          }
        }
        downloadExport('bills', rows);
      } else {
        const payments = await procurementApi.getSupplierPayments();
        const list = Array.isArray(payments) ? payments : [];
        const rows = list.map((p: any) => ({
          'Supplier Name': p.supplier_name ?? '',
          'Payment Date': p.payment_date?.slice?.(0, 10) ?? '',
          Amount: p.amount ?? 0,
          'Payment Method': p.payment_method ?? 'Cash',
          'Bank Account Name': '',
          Reference: p.reference ?? '',
          Notes: p.notes ?? '',
          'Bill Number': '',
          'Amount Allocated': '',
        }));
        downloadExport('payments', rows);
      }
    } catch (e: any) {
      alert(e?.message || 'Export failed');
    } finally {
      setExporting(null);
    }
  };

  const handleFileSelect = (kind: DataKind, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(kind);
    setLastImportKind(kind);
    setImportErrors(null);
    setImportSuccess(null);
    parseExcelFile(file)
      .then(async (rows) => {
        if (!rows.length) {
          setImportErrors([{ row: 1, message: 'No data rows found in the file. Ensure the first row contains headers and data starts from row 2.' }]);
          setImporting(null);
          return;
        }
        let result;
        if (kind === 'skus') result = await dataApi.importSkus(rows);
        else if (kind === 'inventory') result = await dataApi.importInventory(rows);
        else if (kind === 'bills') result = await dataApi.importBills(rows);
        else result = await dataApi.importPayments(rows);

        if (result.success) {
          setImportErrors(null);
          setImportSuccess(result.imported ?? 0);
        } else {
          setImportErrors(result.errors || []);
          setImportSuccess(null);
        }
      })
      .catch((err) => {
        setImportErrors([{ row: 0, message: err?.message || 'Failed to read file. Use an Excel (.xlsx) file.' }]);
        setImportSuccess(null);
      })
      .finally(() => {
        setImporting(null);
      });
  };

  const activeKind = importing || exporting;

  return (
    <div className="space-y-6 max-w-3xl">
      <Card className="border-none shadow-sm p-6">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-2">Export / Import data</h3>
        <p className="text-slate-600 text-sm mb-6">
          Download a template, fill it in Excel, then import. If any row has errors, the system will show the Excel row number so you can correct and re-import.
        </p>

        <div className="grid gap-6 sm:grid-cols-2">
          {(['skus', 'inventory', 'bills', 'payments'] as DataKind[]).map((kind) => (
            <Card key={kind} className="border border-slate-100 p-4 bg-slate-50/50">
              <div className="flex items-center gap-2 mb-3">
                <FileSpreadsheet className="w-5 h-5 text-indigo-500" />
                <span className="font-bold text-slate-800">{LABELS[kind]}</span>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleDownloadTemplate(kind)}
                  className="flex items-center gap-1"
                >
                  <Download className="w-4 h-4" />
                  Template
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleExport(kind)}
                  disabled={!!activeKind}
                  className="flex items-center gap-1"
                >
                  {exporting === kind ? 'Exporting…' : 'Export'}
                </Button>
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="sr-only"
                    ref={(el) => { fileInputRefs.current[kind] = el; }}
                    onChange={(e) => handleFileSelect(kind, e)}
                    disabled={!!activeKind}
                  />
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 border-slate-200 bg-white text-sm font-bold text-slate-700 hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
                    <Upload className="w-4 h-4" />
                    {importing === kind ? 'Importing…' : 'Import'}
                  </span>
                </label>
              </div>
              {lastImportKind === kind && importErrors && importErrors.length > 0 && (
                <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg">
                  <p className="text-rose-800 text-sm font-bold flex items-center gap-1 mb-2">
                    <AlertCircle className="w-4 h-4" />
                    Correct the following and re-import
                  </p>
                  <ul className="text-sm text-rose-700 space-y-1 max-h-32 overflow-y-auto">
                    {importErrors.map((err, i) => (
                      <li key={i}>
                        {err.row > 0 ? `Row ${err.row}` : 'File'}: {err.field ? `[${err.field}] ` : ''}{err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {lastImportKind === kind && importSuccess !== null && (
                <p className="mt-3 text-sm font-medium text-emerald-600">
                  Imported {importSuccess} record(s) successfully.
                </p>
              )}
            </Card>
          ))}
        </div>
      </Card>
    </div>
  );
}
