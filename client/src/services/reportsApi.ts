import { apiClient } from './apiClient';

export type ReportCatalogEntry = {
  category: string;
  slug: string;
  title: string;
  description?: string;
};

export type ReportDataResponse = {
  meta: { category: string; reportSlug: string; limit: number; offset: number };
  columns: string[];
  rows: (string | number | null)[][];
  total: number;
};

export type ExportJobResponse = {
  id: string;
  status: string;
  format?: string;
  filePath?: string | null;
  errorMessage?: string | null;
  createdAt?: string;
  completedAt?: string | null;
};

export type AuditSummaryResponse = {
  voidTransactions: { count: number; trend: string };
  cancelledInvoices: { count: number; trend: string };
  discountAudit: { linesWithDiscount: number };
  priceOverrides: { lineCount: number };
  systemLogs: { entries: number; failedEntries: number; topModules: { module: string; count: number }[] };
  suspicious: { label: string; detail: string }[];
  range: { from: string; to: string };
};

export interface ExecutiveSummaryResponse {
  kpis: {
    totalSales: number;
    netSales: number;
    netProfit: number;
    grossMarginPct: number;
    discounts: number;
    taxes: number;
    expenses: number;
    refunds: number;
    cashInHand: number | null;
    receivables: number | null;
    averageOrderValue: number;
    orders: number;
  };
  series: {
    topProducts: { label: string; value: number }[];
    topBranches: { label: string; value: number }[];
    revenueTrend: { day: string; revenue: number }[];
  };
  generatedAt: string;
}

export const reportsApi = {
  catalog() {
    return apiClient.get<{ items: ReportCatalogEntry[] }>('/shop/reports/catalog');
  },
  reportData(params: {
    category: string;
    slug: string;
    from: string;
    to: string;
    branchId?: string | null;
    limit?: number;
    offset?: number;
  }) {
    const q = new URLSearchParams({
      from: params.from,
      to: params.to,
      limit: String(params.limit ?? 100),
      offset: String(params.offset ?? 0),
    });
    if (params.branchId) q.set('branchId', params.branchId);
    return apiClient.get<ReportDataResponse>(
      `/shop/reports/data/${encodeURIComponent(params.category)}/${encodeURIComponent(params.slug)}?${q.toString()}`
    );
  },
  queueReportExport(body: {
    format: 'csv';
    reportCategory: string;
    reportSlug: string;
    from: string;
    to: string;
    branchId?: string | null;
    savedReportId?: string | null;
  }) {
    return apiClient.post<{ id: string; status: string; message?: string }>('/shop/reports/exports', body);
  },
  getExportJob(id: string) {
    return apiClient.get<ExportJobResponse>(`/shop/reports/exports/${encodeURIComponent(id)}`);
  },
  downloadExportBlob(id: string) {
    return apiClient.getBlob(`/shop/reports/exports/${encodeURIComponent(id)}/download`);
  },
  executiveSummary(params: { from: string; to: string; branchId?: string | null }) {
    const q = new URLSearchParams({ from: params.from, to: params.to });
    if (params.branchId) q.set('branchId', params.branchId);
    return apiClient.get<ExecutiveSummaryResponse>(`/shop/reports/executive-summary?${q.toString()}`);
  },
  listSaved() {
    return apiClient.get<{ items: unknown[] }>('/shop/reports/saved');
  },
  createSaved(body: { name: string; categorySlug: string; definition: unknown; isShared?: boolean }) {
    return apiClient.post<{ id: string }>('/shop/reports/saved', body);
  },
  deleteSaved(id: string) {
    return apiClient.delete<{ ok: boolean }>(`/shop/reports/saved/${encodeURIComponent(id)}`);
  },
  listTemplates() {
    return apiClient.get<{ items: unknown[] }>('/shop/reports/templates');
  },
  upsertTemplate(body: { id?: string; name: string; moduleKey: string; definition: unknown }) {
    return apiClient.post<{ id: string }>('/shop/reports/templates', body);
  },
  listFilterPresets() {
    return apiClient.get<{ items: unknown[] }>('/shop/reports/filter-presets');
  },
  createFilterPreset(body: { name: string; filters: unknown }) {
    return apiClient.post<{ id: string }>('/shop/reports/filter-presets', body);
  },
  auditSummary(params: { from: string; to: string; branchId?: string | null }) {
    const q = new URLSearchParams({ from: params.from, to: params.to });
    if (params.branchId) q.set('branchId', params.branchId);
    return apiClient.get<AuditSummaryResponse>(`/shop/reports/audit/summary?${q.toString()}`);
  },
};
