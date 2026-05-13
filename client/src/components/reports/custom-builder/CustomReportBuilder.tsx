import React, { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import Card from '../../ui/Card';
import Button from '../../ui/Button';
import Select from '../../ui/Select';
import Input from '../../ui/Input';

const MODULES = [
  { key: 'sales', label: 'Sales' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'accounting', label: 'Accounting' },
  { key: 'customers', label: 'Customers' },
  { key: 'suppliers', label: 'Suppliers' },
  { key: 'projects', label: 'Projects' },
  { key: 'units', label: 'Units' },
  { key: 'brokers', label: 'Brokers' },
  { key: 'owners', label: 'Owners' },
] as const;

const FIELD_LIBRARY: Record<string, string[]> = {
  sales: ['sale_id', 'sold_at', 'branch', 'cashier', 'sku', 'qty', 'line_total', 'tax', 'discount', 'tender'],
  inventory: ['sku', 'warehouse', 'on_hand', 'reserved', 'batch', 'expiry', 'valuation_fifo', 'valuation_wavg'],
  accounting: ['account_code', 'account_name', 'debit', 'credit', 'journal', 'period'],
  customers: ['customer_id', 'name', 'segment', 'ltv', 'last_purchase', 'ar_balance'],
  suppliers: ['supplier_id', 'name', 'ap_balance', 'lead_time', 'fill_rate'],
  projects: ['project_id', 'name', 'status', 'budget', 'actual'],
  units: ['unit_id', 'label', 'occupancy'],
  brokers: ['broker_id', 'name', 'commission_rate'],
  owners: ['owner_id', 'name', 'equity_share'],
};

const CustomReportBuilder: React.FC = () => {
  const [moduleKey, setModuleKey] = useState<(typeof MODULES)[number]['key']>('sales');
  const [available, setAvailable] = useState<string[]>(() => [...FIELD_LIBRARY.sales]);
  const [selected, setSelected] = useState<string[]>(['sale_id', 'sold_at', 'line_total']);
  const [dragField, setDragField] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');

  const moveToSelected = useCallback(
    (field: string) => {
      setAvailable((a) => a.filter((x) => x !== field));
      setSelected((s) => (s.includes(field) ? s : [...s, field]));
    },
    []
  );

  const moveToAvailable = useCallback(
    (field: string) => {
      setSelected((s) => s.filter((x) => x !== field));
      setAvailable((a) => (a.includes(field) ? a : [...a, field]));
    },
    []
  );

  const onModuleChange = (key: (typeof MODULES)[number]['key']) => {
    setModuleKey(key);
    const lib = FIELD_LIBRARY[key] || [];
    setSelected(lib.slice(0, 3));
    setAvailable(lib.filter((f) => !lib.slice(0, 3).includes(f)));
  };

  const onDragStartField = (field: string) => setDragField(field);

  const onDropOnSelected = () => {
    if (dragField) moveToSelected(dragField);
    setDragField(null);
  };

  const onDropOnAvailable = () => {
    if (dragField) moveToAvailable(dragField);
    setDragField(null);
  };

  const reorderSelected = (from: number, to: number) => {
    setSelected((s) => {
      const next = [...s];
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-[#0B2A5B] dark:text-slate-100">Custom report builder</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Drag fields into the canvas, add aggregates, grouping, and formulas — persisted as templates and schedulable.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border border-slate-200/80 bg-white/85 backdrop-blur-md dark:border-slate-700 dark:bg-slate-950/70">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Module</h3>
          <Select
            className="mt-3"
            label="Dataset"
            value={moduleKey}
            onChange={(e) => onModuleChange(e.target.value as (typeof MODULES)[number]['key'])}
          >
            {MODULES.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </Select>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Dynamic joins and pivot mode map to generated SQL / Prisma queries on the reporting worker.
          </p>
        </Card>

        <Card
          className="border border-dashed border-slate-300/90 bg-slate-50/80 backdrop-blur-md dark:border-slate-600 dark:bg-slate-900/60 xl:col-span-2"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onDropOnSelected();
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Report canvas (columns)</h3>
            <span className="text-xs text-slate-500">Drop fields here</span>
          </div>
          <div className="mt-3 flex min-h-[140px] flex-wrap gap-2">
            {selected.map((f, idx) => (
              <motion.div
                layout
                key={f}
                draggable
                onDragStart={() => onDragStartField(f)}
                className="cursor-grab rounded-full border border-[#0047AB]/30 bg-white px-3 py-1.5 text-xs font-semibold text-[#0B2A5B] shadow-sm dark:border-blue-500/40 dark:bg-slate-950 dark:text-blue-100"
                title="Drag to reorder or move back to library"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.stopPropagation();
                  const target = (e.target as HTMLElement).closest('[data-idx]');
                  if (!target) return;
                  const to = Number(target.getAttribute('data-idx'));
                  if (!Number.isNaN(to)) reorderSelected(idx, to);
                }}
                data-idx={idx}
              >
                {f}
              </motion.div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          className="border border-slate-200/80 bg-white/85 backdrop-blur-md dark:border-slate-700 dark:bg-slate-950/70"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onDropOnAvailable();
          }}
        >
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Field library</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {available.map((f) => (
              <button
                key={f}
                type="button"
                draggable
                onDragStart={() => onDragStartField(f)}
                onClick={() => moveToSelected(f)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-[#0047AB]/50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                {f}
              </button>
            ))}
          </div>
        </Card>

        <Card className="border border-slate-200/80 bg-white/85 backdrop-blur-md dark:border-slate-700 dark:bg-slate-950/70">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Save template</h3>
          <Input
            className="mt-3"
            label="Template name"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="e.g. Weekly branch margin"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent('reports:save-template', {
                    detail: { name: templateName, moduleKey, fields: selected },
                  })
                );
              }}
            >
              Queue save (hook to API)
            </Button>
            <Button type="button" variant="outline" onClick={() => moveToAvailable(selected[selected.length - 1])}>
              Pop last column
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default CustomReportBuilder;
