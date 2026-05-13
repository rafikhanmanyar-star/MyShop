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
  status: string;
  projectId: string;
  unitId: string;
  brokerId: string;
  ownerId: string;
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
    status: '',
    projectId: '',
    unitId: '',
    brokerId: '',
    ownerId: '',
    search: '',
  };
}
