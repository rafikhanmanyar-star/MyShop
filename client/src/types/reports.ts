export type ReportCategoryId =
  | 'executive'
  | 'sales'
  | 'inventory'
  | 'financial'
  | 'customers'
  | 'suppliers'
  | 'cash_shift'
  | 'audit'
  | 'multi_branch'
  | 'restaurant'
  | 'ai'
  | 'custom';

export const REPORT_CATEGORY_IDS: ReportCategoryId[] = [
  'executive',
  'sales',
  'inventory',
  'financial',
  'customers',
  'suppliers',
  'cash_shift',
  'audit',
  'multi_branch',
  'restaurant',
  'ai',
  'custom',
];

export function isReportCategoryId(s: string): s is ReportCategoryId {
  return (REPORT_CATEGORY_IDS as readonly string[]).includes(s);
}

export type DatePreset = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';

export interface ReportFilterState {
  datePreset: DatePreset;
  dateFrom: string;
  dateTo: string;
  branchId: string;
  warehouseId: string;
  customerId: string;
  supplierId: string;
  categoryId: string;
  brandId: string;
  productId: string;
  userId: string;
  paymentMethod: string;
  /** `Completed` (default), `Void`, or `all` for any status */
  status: string;
  search: string;
}

export function defaultReportFilters(): ReportFilterState {
  return {
    datePreset: 'this_month',
    dateFrom: '',
    dateTo: '',
    branchId: '',
    warehouseId: '',
    customerId: '',
    supplierId: '',
    categoryId: '',
    brandId: '',
    productId: '',
    userId: '',
    paymentMethod: '',
    status: 'Completed',
    search: '',
  };
}

/** Drop unknown keys (e.g. legacy saved presets) so merges stay typed. */
export function sanitizeReportFilters(patch: Record<string, unknown> | null | undefined): Partial<ReportFilterState> {
  if (!patch || typeof patch !== 'object') return {};
  const d = defaultReportFilters();
  const out: Partial<ReportFilterState> = {};
  (Object.keys(d) as (keyof ReportFilterState)[]).forEach((k) => {
    if (patch[k] !== undefined && patch[k] !== null) {
      (out as Record<string, unknown>)[k] = patch[k];
    }
  });
  if (typeof patch.status === 'string' && (patch.status === 'all' || patch.status === 'Void' || patch.status === 'Completed')) {
    out.status = patch.status;
  }
  return out;
}
