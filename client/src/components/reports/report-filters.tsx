import React, { useState } from 'react';
import { motion } from 'framer-motion';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import type { DatePreset, ReportFilterState } from '../../types/reports';
import { computePresetRange } from '../../utils/reportDateRange';

const PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_week', label: 'This week' },
  { id: 'this_month', label: 'This month' },
  { id: 'custom', label: 'Custom' },
];

export interface ReportFiltersProps {
  filters: ReportFilterState;
  setFilters: React.Dispatch<React.SetStateAction<ReportFilterState>>;
  commitFiltersToUrl: (full: ReportFilterState) => void;
  setSearchDebounced: (q: string) => void;
  branches: { id: string; name: string }[];
  onSavePreset: (name: string) => Promise<void>;
  onLoadPresets: () => Promise<{ id: string; name: string }[]>;
  onApplyPreset: (id: string) => Promise<ReportFilterState | null>;
}

export const ReportFilters: React.FC<ReportFiltersProps> = ({
  filters,
  setFilters,
  commitFiltersToUrl,
  setSearchDebounced,
  branches,
  onSavePreset,
  onLoadPresets,
  onApplyPreset,
}) => {
  const [presetName, setPresetName] = useState('');
  const [presetList, setPresetList] = useState<{ id: string; name: string }[]>([]);
  const [presetsOpen, setPresetsOpen] = useState(false);

  const applyDatesFromPreset = (preset: DatePreset) => {
    const r = computePresetRange(preset, filters.dateFrom, filters.dateTo);
    setFilters((prev) => ({
      ...prev,
      datePreset: preset,
      dateFrom: preset === 'custom' ? prev.dateFrom : r.from,
      dateTo: preset === 'custom' ? prev.dateTo : r.to,
    }));
  };

  const handleApply = () => {
    let next = { ...filters };
    if (next.datePreset !== 'custom') {
      const r = computePresetRange(next.datePreset, next.dateFrom, next.dateTo);
      next = { ...next, dateFrom: r.from, dateTo: r.to };
    }
    commitFiltersToUrl(next);
  };

  const refreshPresets = async () => {
    const items = await onLoadPresets();
    setPresetList(items);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-950/60"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
          <div className="flex flex-wrap gap-1 rounded-full border border-slate-200/90 bg-slate-100/80 p-1 dark:border-slate-600 dark:bg-slate-800/80">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyDatesFromPreset(p.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                  filters.datePreset === p.id
                    ? 'bg-[#0047AB] text-white shadow-sm dark:bg-[#2563eb]'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {filters.datePreset === 'custom' && (
            <div className="flex flex-wrap items-end gap-2">
              <Input
                label="From"
                type="date"
                compact
                className="w-40"
                value={filters.dateFrom}
                onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
              />
              <Input
                label="To"
                type="date"
                compact
                className="w-40"
                value={filters.dateTo}
                onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
              />
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={handleApply}>
            Apply filters
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <Select
          label="Branch"
          value={filters.branchId}
          onChange={(e) => setFilters((prev) => ({ ...prev, branchId: e.target.value }))}
        >
          <option value="">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Select
          label="Warehouse"
          value={filters.warehouseId}
          onChange={(e) => setFilters((prev) => ({ ...prev, warehouseId: e.target.value }))}
        >
          <option value="">All warehouses</option>
        </Select>
        <Input
          label="Customer ID"
          compact
          placeholder="Optional"
          value={filters.customerId}
          onChange={(e) => setFilters((prev) => ({ ...prev, customerId: e.target.value }))}
        />
        <Input
          label="Supplier ID"
          compact
          placeholder="Optional"
          value={filters.supplierId}
          onChange={(e) => setFilters((prev) => ({ ...prev, supplierId: e.target.value }))}
        />
        <Select
          label="Category"
          value={filters.categoryId}
          onChange={(e) => setFilters((prev) => ({ ...prev, categoryId: e.target.value }))}
        >
          <option value="">All categories</option>
        </Select>
        <Select
          label="Brand"
          value={filters.brandId}
          onChange={(e) => setFilters((prev) => ({ ...prev, brandId: e.target.value }))}
        >
          <option value="">All brands</option>
        </Select>
        <Input
          label="Product ID"
          compact
          value={filters.productId}
          onChange={(e) => setFilters((prev) => ({ ...prev, productId: e.target.value }))}
        />
        <Select
          label="User / Cashier"
          value={filters.userId}
          onChange={(e) => setFilters((prev) => ({ ...prev, userId: e.target.value }))}
        >
          <option value="">All users</option>
        </Select>
        <Select
          label="Payment method"
          value={filters.paymentMethod}
          onChange={(e) => setFilters((prev) => ({ ...prev, paymentMethod: e.target.value }))}
        >
          <option value="">Any</option>
          <option value="Cash">Cash</option>
          <option value="Card">Card</option>
          <option value="Bank">Bank</option>
        </Select>
        <Select
          label="Status"
          value={filters.status}
          onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
        >
          <option value="">Any</option>
          <option value="Completed">Completed</option>
          <option value="Void">Void</option>
        </Select>
        <Input
          label="Project"
          compact
          value={filters.projectId}
          onChange={(e) => setFilters((prev) => ({ ...prev, projectId: e.target.value }))}
        />
        <Input label="Unit" compact value={filters.unitId} onChange={(e) => setFilters((prev) => ({ ...prev, unitId: e.target.value }))} />
        <Input label="Broker" compact value={filters.brokerId} onChange={(e) => setFilters((prev) => ({ ...prev, brokerId: e.target.value }))} />
        <Input label="Owner" compact value={filters.ownerId} onChange={(e) => setFilters((prev) => ({ ...prev, ownerId: e.target.value }))} />
        <Input
          label="Search (debounced)"
          compact
          placeholder="SKU, memo, reference…"
          value={filters.search}
          onChange={(e) => setSearchDebounced(e.target.value)}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-200/80 pt-4 dark:border-slate-700/80">
        <Input
          label="Save filter preset"
          compact
          className="min-w-[200px] max-w-xs"
          placeholder="Preset name"
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            if (!presetName.trim()) return;
            await onSavePreset(presetName.trim());
            setPresetName('');
          }}
        >
          Save preset
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            setPresetsOpen((v) => !v);
            if (!presetsOpen) await refreshPresets();
          }}
        >
          {presetsOpen ? 'Hide' : 'Load'} presets
        </Button>
        {presetsOpen && (
          <Select
            label=" "
            hideIcon
            className="max-w-xs"
            value=""
            onChange={async (e) => {
              const id = e.target.value;
              if (!id) return;
              const loaded = await onApplyPreset(id);
              if (loaded) commitFiltersToUrl(loaded);
            }}
          >
            <option value="">Select saved preset…</option>
            {presetList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
      </div>
    </motion.div>
  );
};

export default ReportFilters;
