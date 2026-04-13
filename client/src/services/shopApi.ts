import { apiClient } from './apiClient';

export interface ShopBranch {
  id: string;
  name: string;
  code: string;
  type: string;
  status: string;
  location: string;
  region: string;
}

export interface ShopProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  retail_price: number;
  tax_rate: number;
}

export interface ShopProductCategory {
  id: string;
  name: string;
  type: string;
  /** Parent category id when this row is a subcategory */
  parent_id?: string | null;
  /** Resized WebP path for mobile app category rail; set in Inventory → Categories */
  mobile_icon_url?: string | null;
  created_at?: string;
}

export interface ShopBankAccount {
  id: string;
  name: string;
  code?: string;
  /** Chart of accounts code (e.g. AST-100, AST-101) when linked */
  chart_code?: string;
  account_type: string;
  currency: string;
  balance?: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ShopVendor {
  id: string;
  name: string;
  company_name?: string;
  contact_no?: string;
  email?: string;
  address?: string;
  description?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

/** Standard JSON shape for product create/update/get-by-id. */
export interface ProductApiResult {
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

export interface TenantBranding {
  id: string;
  tenant_id: string;
  logo_url: string | null;
  logo_dark_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  font_family: string;
  theme_mode: string;
  created_at?: string;
  updated_at?: string;
}

export const shopApi = {
  getBranches: () => apiClient.get<ShopBranch[]>('/shop/branches'),
  createBranch: (data: any) => apiClient.post('/shop/branches', data),
  updateBranch: (id: string, data: any) => apiClient.put(`/shop/branches/${id}`, data),
  getBranchDeleteStatus: (id: string) => apiClient.get<{ canDelete: boolean; hasTransactions: boolean; terminalCount: number; hasInventory: boolean; message?: string }>(`/shop/branches/${id}/delete-status`),
  deleteBranch: (id: string) => apiClient.delete(`/shop/branches/${id}`),

  getWarehouses: () => apiClient.get<any[]>('/shop/warehouses'),
  createWarehouse: (data: any) => apiClient.post('/shop/warehouses', data),

  getTerminals: () => apiClient.get<any[]>('/shop/terminals'),
  createTerminal: (data: any) => apiClient.post('/shop/terminals', data),
  updateTerminal: (id: string, data: any) => apiClient.put(`/shop/terminals/${id}`, data),
  deleteTerminal: (id: string) => apiClient.delete(`/shop/terminals/${id}`),

  getShopCategories: () => apiClient.get<ShopProductCategory[]>('/shop/categories'),
  createShopCategory: (data: { name: string; parentId?: string | null }) =>
    apiClient.post<{ id: string }>('/shop/categories', data),
  updateShopCategory: (id: string, data: { name: string; parentId?: string | null; mobileIconUrl?: string | null }) =>
    apiClient.put(`/shop/categories/${id}`, data),
  deleteShopCategory: (id: string) => apiClient.delete(`/shop/categories/${id}`),

  getProducts: () => apiClient.get<ShopProduct[]>('/shop/products'),
  getPopularProducts: (limit = 10) => apiClient.get<ShopProduct[]>(`/shop/popular-products?limit=${limit}`),
  getProduct: (id: string) => apiClient.get<ProductApiResult>(`/shop/products/${encodeURIComponent(id)}`),
  createProduct: (data: any) => apiClient.post<ProductApiResult>('/shop/products', data),
  updateProduct: (id: string, data: any) => apiClient.put<ProductApiResult>(`/shop/products/${encodeURIComponent(id)}`, data),
  getProductDeleteStatus: (id: string) => apiClient.get<{ canDelete: boolean; message?: string }>(`/shop/products/${id}/delete-status`),
  deleteProduct: (id: string) => apiClient.delete(`/shop/products/${id}`),
  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return apiClient.post<{ imageUrl: string }>('/shop/upload-image', formData);
  },
  /** Server resizes to 256×256 WebP for the mobile category rail */
  uploadCategoryIcon: (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return apiClient.post<{ imageUrl: string }>('/shop/upload-category-icon', formData);
  },

  getInventory: () => apiClient.get<any[]>('/shop/inventory'),
  /** Paginated SKU + stock (single round-trip; use for inventory UI). */
  getInventorySkus: (params?: { page?: number; limit?: number; search?: string; stockFilter?: string }) => {
    const q = new URLSearchParams();
    if (params?.page != null) q.set('page', String(params.page));
    if (params?.limit != null) q.set('limit', String(params.limit));
    if (params?.search) q.set('search', params.search);
    if (params?.stockFilter) q.set('stockFilter', params.stockFilter);
    const qs = q.toString();
    return apiClient.get<{
      items: any[];
      total: number;
      page: number;
      limit: number;
      serverMs?: number;
      routeMs?: number;
    }>(`/shop/inventory/skus${qs ? `?${qs}` : ''}`);
  },
  getInventoryExpirySummary: () => apiClient.get<any>('/shop/inventory/expiry-summary'),
  updateInventoryBatchExpiry: (batchId: string, data: { expiryDate: string }) =>
    apiClient.patch<{ id: string; expiry_date: string }>(`/shop/inventory/batches/${batchId}/expiry`, data),
  adjustInventory: (data: any) => apiClient.post('/shop/inventory/adjust', data),
  getMovements: (productId?: string, limit?: number) => {
    const q = new URLSearchParams();
    if (productId) q.set('productId', productId);
    if (limit != null) q.set('limit', String(limit));
    const qs = q.toString();
    return apiClient.get<any[]>(`/shop/inventory/movements${qs ? `?${qs}` : ''}`);
  },

  getSales: () => apiClient.get<any[]>('/shop/sales'),
  createSale: (data: any) => apiClient.post('/shop/sales', data),

  getLoyaltyMembers: () => apiClient.get<any[]>('/shop/loyalty/members'),
  createLoyaltyMember: (data: any) => apiClient.post('/shop/loyalty/members', data),
  updateLoyaltyMember: (id: string, data: any) => apiClient.put(`/shop/loyalty/members/${id}`, data),
  deleteLoyaltyMember: (id: string) => apiClient.delete(`/shop/loyalty/members/${id}`),

  getPolicies: () => apiClient.get('/shop/policies'),
  updatePolicies: (data: any) => apiClient.post('/shop/policies', data),

  getBankAccounts: (activeOnly = true) =>
    apiClient.get<ShopBankAccount[]>(`/shop/bank-accounts${activeOnly ? '' : '?activeOnly=false'}`),
  createBankAccount: (data: { name: string; code?: string; account_type?: string; currency?: string }) =>
    apiClient.post<{ id: string }>('/shop/bank-accounts', data),
  updateBankAccount: (id: string, data: { name?: string; code?: string; is_active?: boolean }) =>
    apiClient.put(`/shop/bank-accounts/${id}`, data),
  deleteBankAccount: (id: string) => apiClient.delete(`/shop/bank-accounts/${id}`),

  getVendors: () => apiClient.get<ShopVendor[]>('/shop/vendors'),
  createVendor: (data: { name: string; company_name?: string; contact_no?: string; email?: string; address?: string; description?: string }) =>
    apiClient.post<ShopVendor>('/shop/vendors', data),
  updateVendor: (id: string, data: Partial<ShopVendor>) => apiClient.put(`/shop/vendors/${id}`, data),
  deleteVendor: (id: string) => apiClient.delete(`/shop/vendors/${id}`),

  getBranding: () => apiClient.get<TenantBranding>('/shop/branding'),
  updateBranding: (data: Partial<TenantBranding>) => apiClient.post<TenantBranding>('/shop/branding', data),

  getPosSettings: () => apiClient.get<any>('/shop/pos-settings'),
  updatePosSettings: (data: any) => apiClient.post<any>('/shop/pos-settings', data),

  getReceiptSettings: () => apiClient.get<any>('/shop/receipt-settings'),
  updateReceiptSettings: (data: any) => apiClient.post<any>('/shop/receipt-settings', data),

  getSettingsEditLock: () =>
    apiClient.get<{ locked: boolean; lockedBy?: { userId: string; userName: string }; expiresAt?: string }>(
      '/shop/settings/edit-lock'
    ),
  acquireSettingsEditLock: (userName: string) =>
    apiClient.post<{ acquired: boolean; expiresAt: string }>('/shop/settings/edit-lock', {
      action: 'acquire',
      userName,
    }),
  heartbeatSettingsEditLock: () =>
    apiClient.post<{ ok: boolean; expiresAt: string }>('/shop/settings/edit-lock', { action: 'heartbeat' }),
  releaseSettingsEditLock: () =>
    apiClient.post<{ released: boolean }>('/shop/settings/edit-lock', { action: 'release' }),

  incrementReprintCount: (saleId: string) => apiClient.post<any>(`/shop/sales/${saleId}/reprint`),
  getSaleByInvoiceNumber: (saleNumber: string) => apiClient.get<any>(`/shop/sales/by-invoice/${encodeURIComponent(saleNumber)}`),

  getSaleReturnEligibility: (saleId: string) =>
    apiClient.get<any>(`/shop/sales/return-eligibility/${encodeURIComponent(saleId)}`),
  /** Completed mobile order (delivered + paid) — same return workflow as POS. */
  getMobileOrderReturnEligibility: (orderNumber: string) =>
    apiClient.get<any>(`/shop/sales/mobile-return-eligibility/${encodeURIComponent(orderNumber)}`),
  /** Nested under /sales/returns — avoids some proxies/hyphen path issues */
  getSalesReturns: () => apiClient.get<any[]>('/shop/sales/returns'),
  getSalesReturn: (id: string) => apiClient.get<any>(`/shop/sales/returns/${encodeURIComponent(id)}`),
  createSalesReturn: (data: Record<string, unknown>) =>
    apiClient.post<{ id: string; returnNumber: string; totalReturnAmount: number }>('/shop/sales/returns', data),

  getOffers: () => apiClient.get<any[]>('/shop/offers'),
  getOffer: (id: string) => apiClient.get<any>(`/shop/offers/${id}`),
  createOffer: (data: Record<string, unknown>) => apiClient.post<{ id: string }>('/shop/offers', data),
  updateOffer: (id: string, data: Record<string, unknown>) => apiClient.put(`/shop/offers/${id}`, data),
  deleteOffer: (id: string) => apiClient.delete(`/shop/offers/${id}`),
};

// --- Khata / Customer Credit API ---
export interface KhataLedgerEntry {
  id: string;
  customer_id: string;
  order_id: string | null;
  type: 'debit' | 'credit';
  amount: number;
  note: string | null;
  created_at: string;
  customer_name?: string;
  sale_number?: string;
  /** Debit rows: amount still owed on this line (linked credits + unlinked credits FIFO) */
  remaining_debit?: number;
  linked_debit_id?: string | null;
}

export interface KhataSummaryRow {
  customer_id: string;
  customer_name: string;
  total_debit: number;
  total_credit: number;
  balance: number;
}

export const khataApi = {
  getLedger: (customerId?: string) =>
    apiClient.get<KhataLedgerEntry[]>(`/shop/khata/ledger${customerId ? `?customerId=${encodeURIComponent(customerId)}` : ''}`),
  getBalance: (customerId: string) => apiClient.get<{ balance: number }>(`/shop/khata/balance/${encodeURIComponent(customerId)}`),
  getSummary: () => apiClient.get<KhataSummaryRow[]>('/shop/khata/summary'),
  getCustomerSummary: (customerId: string) =>
    apiClient.get<{ totalDebit: number; totalCredit: number; balance: number }>(`/shop/khata/customer/${encodeURIComponent(customerId)}/summary`),
  receivePayment: (data: {
    customerId: string;
    amount: number;
    note?: string;
    bankAccountId: string;
    /** Settles this debit row (partial or full); omit for unallocated payment */
    applyToLedgerId?: string;
  }) => apiClient.post<{ id: string }>('/shop/khata/receive-payment', data),
  getCustomers: () => apiClient.get<{ id: string; name: string; contact_no: string | null; company_name?: string | null }[]>('/shop/khata/customers'),
  createCustomer: (data: { name: string; contactNo?: string; companyName?: string }) =>
    apiClient.post<{ id: string; name: string; contact_no: string | null; company_name?: string | null }>('/shop/khata/customers', {
      name: data.name,
      contactNo: data.contactNo,
      companyName: data.companyName,
    }),
  updateLedgerEntry: (
    entryId: string,
    data: { type: 'debit' | 'credit'; amount: number; note?: string | null }
  ) => apiClient.put<{ ok: boolean }>(`/shop/khata/ledger/${encodeURIComponent(entryId)}`, data),
  deleteLedgerEntry: (entryId: string) => apiClient.delete<{ ok: boolean }>(`/shop/khata/ledger/${encodeURIComponent(entryId)}`),
};

export interface ShopUser {
  id: string;
  username: string;
  name: string;
  role: string;
  email?: string;
  is_active: boolean;
  login_status: boolean;
  created_at?: string;
}

export const shopUserApi = {
  getUsers: () => apiClient.get<ShopUser[]>('/shop/users'),
  createUser: (data: any) => apiClient.post<{ id: string }>('/shop/users', data),
  updateUser: (id: string, data: any) => apiClient.put(`/shop/users/${id}`, data),
  deleteUser: (id: string) => apiClient.delete(`/shop/users/${id}`),
};

// --- Accounting API ---
export const accountingApi = {
  getAccounts: () => apiClient.get<any[]>('/shop/accounting/accounts'),
  createAccount: (data: any) => apiClient.post('/shop/accounting/accounts', data),
  updateAccount: (id: string, data: any) => apiClient.put(`/shop/accounting/accounts/${id}`, data),
  deleteAccount: (id: string) => apiClient.delete(`/shop/accounting/accounts/${id}`),
  getJournalEntries: (limit = 200) => apiClient.get<any[]>(`/shop/accounting/journal-entries?limit=${limit}`),
  postJournalEntry: (data: any) => apiClient.post('/shop/accounting/journal-entries', data),
  updateJournalEntry: (id: string, data: any) => apiClient.put(`/shop/accounting/journal-entries/${id}`, data),
  deleteJournalEntry: (id: string) => apiClient.delete(`/shop/accounting/journal-entries/${id}`),
  getFinancialSummary: () => apiClient.get<any>('/shop/accounting/summary'),
  getBankBalances: () => apiClient.get<any[]>('/shop/accounting/bank-balances'),
  getSalesBySource: () => apiClient.get<any>('/shop/accounting/sales-by-source'),
  getDailyTrend: (days = 30) => apiClient.get<any>(`/shop/accounting/daily-trend?days=${days}`),
  getCategoryPerformance: () => apiClient.get<any[]>('/shop/accounting/category-performance'),
  getTransactions: (limit = 50) => apiClient.get<any[]>(`/shop/accounting/transactions?limit=${limit}`),
  clearAllTransactions: () => apiClient.post<{ success: boolean; message: string }>('/shop/accounting/clear-transactions'),

  dailyReportSummary: (date: string, branchId?: string | null) => {
    const q = new URLSearchParams();
    q.set('date', date);
    if (branchId) q.set('branchId', branchId);
    return apiClient.get<{
      date: string;
      branchId: string | null;
      posSales: number;
      posReturns: number;
      netPosSales: number;
      mobileSales: number;
      inventoryOutQty: number;
      inventoryInQty: number;
      totalExpenses: number;
      newProductsCount: number;
      khataDebitTotal: number;
      khataCreditTotal: number;
      khataNetChange: number;
      khataEntryCount: number;
      netProfitDaily: number;
    }>(`/shop/accounting/reports/daily/summary?${q.toString()}`);
  },
  dailyReportKhata: (date: string) => {
    const q = new URLSearchParams();
    q.set('date', date);
    return apiClient.get<{
      rows: Array<{
        id: string;
        created_at: string;
        type: string;
        amount: number;
        note: string;
        customer_name: string;
        sale_number: string;
      }>;
    }>(`/shop/accounting/reports/daily/khata?${q.toString()}`);
  },
  dailyReportInventoryOut: (date: string, branchId?: string | null) => {
    const q = new URLSearchParams();
    q.set('date', date);
    if (branchId) q.set('branchId', branchId);
    return apiClient.get<{ rows: any[] }>(`/shop/accounting/reports/daily/inventory-out?${q.toString()}`);
  },
  dailyReportInventoryIn: (date: string, branchId?: string | null) => {
    const q = new URLSearchParams();
    q.set('date', date);
    if (branchId) q.set('branchId', branchId);
    return apiClient.get<{ rows: any[] }>(`/shop/accounting/reports/daily/inventory-in?${q.toString()}`);
  },
  dailyReportExpenses: (date: string, branchId?: string | null) => {
    const q = new URLSearchParams();
    q.set('date', date);
    if (branchId) q.set('branchId', branchId);
    return apiClient.get<{ rows: any[] }>(`/shop/accounting/reports/daily/expenses?${q.toString()}`);
  },
  dailyReportProductsCreated: (date: string) => {
    const q = new URLSearchParams();
    q.set('date', date);
    return apiClient.get<{ rows: any[] }>(`/shop/accounting/reports/daily/products-created?${q.toString()}`);
  },
};

// --- Expenses API ---
export const expensesApi = {
  getCategories: () => apiClient.get<any[]>('/shop/expenses/categories'),
  createCategory: (data: { name: string; accountId: string }) => apiClient.post<any>('/shop/expenses/categories', data),
  list: (params?: { fromDate?: string; toDate?: string; categoryId?: string; vendorId?: string; paymentMethod?: string; search?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params?.fromDate) q.set('fromDate', params.fromDate);
    if (params?.toDate) q.set('toDate', params.toDate);
    if (params?.categoryId) q.set('categoryId', params.categoryId);
    if (params?.vendorId) q.set('vendorId', params.vendorId);
    if (params?.paymentMethod) q.set('paymentMethod', params.paymentMethod);
    if (params?.search) q.set('search', params.search);
    if (params?.limit != null) q.set('limit', String(params.limit));
    if (params?.offset != null) q.set('offset', String(params.offset));
    const query = q.toString();
    return apiClient.get<{ rows: any[]; total: number }>(`/shop/expenses${query ? `?${query}` : ''}`);
  },
  getById: (id: string) => apiClient.get<any>(`/shop/expenses/${id}`),
  create: (data: any) => apiClient.post<{ id: string; journalEntryId: string }>('/shop/expenses', data),
  delete: (id: string) => apiClient.delete(`/shop/expenses/${id}`),
  uploadAttachment: (file: File) => {
    const formData = new FormData();
    formData.append('attachment', file);
    return apiClient.post<{ attachmentUrl: string }>('/shop/expenses/upload-attachment', formData);
  },
  recurring: {
    list: () => apiClient.get<any[]>('/shop/expenses/recurring/list'),
    create: (data: any) => apiClient.post<{ id: string }>('/shop/expenses/recurring', data),
    processDue: (upToDate?: string) => apiClient.post<{ created: number }>('/shop/expenses/recurring/process-due', { upToDate }),
  },
  reports: {
    monthlySummary: (year: number, month: number) => apiClient.get<any>(`/shop/expenses/reports/monthly-summary?year=${year}&month=${month}`),
    categoryWise: (fromDate: string, toDate: string) => apiClient.get<any[]>(`/shop/expenses/reports/category-wise?fromDate=${fromDate}&toDate=${toDate}`),
    expenseVsRevenue: (fromDate: string, toDate: string) => apiClient.get<any>(`/shop/expenses/reports/expense-vs-revenue?fromDate=${fromDate}&toDate=${toDate}`),
    vendor: (fromDate?: string, toDate?: string) =>
      apiClient.get<any[]>(`/shop/expenses/reports/vendor${fromDate != null ? `?fromDate=${fromDate}${toDate ? `&toDate=${toDate}` : ''}` : ''}`),
  },
};

// --- Procurement & Supplier Payments API ---
export const procurementApi = {
  getPurchaseBills: (supplierId?: string) =>
    apiClient.get<any[]>(`/shop/procurement/purchase-bills${supplierId ? `?supplierId=${supplierId}` : ''}`),
  getPurchaseBillById: (id: string) => apiClient.get<any>(`/shop/procurement/purchase-bills/${id}`),
  createPurchaseBill: (data: any) => apiClient.post<{ id: string }>('/shop/procurement/purchase-bills', data),
  updatePurchaseBill: (
    id: string,
    data: {
      billNumber: string;
      billDate: string;
      dueDate?: string;
      notes?: string;
      items: { productId: string; quantity: number; unitCost: number; taxAmount?: number; subtotal: number }[];
      subtotal: number;
      taxTotal: number;
      totalAmount: number;
    }
  ) => apiClient.patch(`/shop/procurement/purchase-bills/${id}`, data),
  deletePurchaseBill: (id: string) => apiClient.delete(`/shop/procurement/purchase-bills/${id}`),
  getSupplierPayments: (supplierId?: string) =>
    apiClient.get<any[]>(`/shop/procurement/supplier-payments${supplierId ? `?supplierId=${supplierId}` : ''}`),
  getSupplierPaymentById: (id: string) => apiClient.get<any>(`/shop/procurement/supplier-payments/${id}`),
  recordSupplierPayment: (data: any) => apiClient.post<{ id: string }>('/shop/procurement/supplier-payments', data),
  updateSupplierPayment: (id: string, data: any) => apiClient.put(`/shop/procurement/supplier-payments/${id}`, data),
  deleteSupplierPayment: (id: string) => apiClient.delete(`/shop/procurement/supplier-payments/${id}`),
  getSupplierLedger: (supplierId?: string) =>
    apiClient.get<any>(`/shop/procurement/supplier-ledger${supplierId ? `?supplierId=${supplierId}` : ''}`),
  getBillsWithBalance: (supplierId: string) =>
    apiClient.get<any[]>(`/shop/procurement/bills-with-balance/${supplierId}`),
  reports: {
    apAging: () => apiClient.get<any>('/shop/procurement/reports/ap-aging'),
    inventoryValuation: () => apiClient.get<any>('/shop/procurement/reports/inventory-valuation'),
  },
};

// --- Data export/import (Settings → Data) ---
export interface ImportRowError {
  row: number;
  field?: string;
  message: string;
}

export interface ImportResult {
  success: boolean;
  errors: ImportRowError[];
  imported?: number;
}

export interface BackupEntry {
  id: string;
  filename: string;
  createdAt: string;
  sizeInBytes: number;
}

export const dataApi = {
  importSkus: (rows: any[]) =>
    apiClient.post<ImportResult>('/shop/data/import/skus', { rows }),
  importInventory: (rows: any[]) =>
    apiClient.post<ImportResult>('/shop/data/import/inventory', { rows }),
  importBills: (rows: any[]) =>
    apiClient.post<ImportResult>('/shop/data/import/bills', { rows }),
  importPayments: (rows: any[]) =>
    apiClient.post<ImportResult>('/shop/data/import/payments', { rows }),
  backups: {
    list: () => apiClient.get<BackupEntry[]>('/shop/data/backups'),
    create: () => apiClient.post<{ filename: string; createdAt: string; sizeInBytes: number }>('/shop/data/backups'),
    restore: (filename: string) =>
      apiClient.post<{ success: boolean; message: string }>('/shop/data/backups/restore', { filename }),
  },
};

// --- Shifts (Cashier & Admin) API ---
export const shiftsApi = {
  getCurrent: (terminalId?: string) =>
    apiClient.get<any | null>(`/shop/shifts/current${terminalId ? `?terminalId=${encodeURIComponent(terminalId)}` : ''}`),
  start: (terminalId: string, openingCash: number) =>
    apiClient.post<any>('/shop/shifts/start', { terminalId, openingCash }),
  getStats: (shiftId: string) => apiClient.get<any>(`/shop/shifts/${shiftId}/stats`),
  close: (shiftId: string, payload: { closingCashActual: number; varianceReason?: string; handoverToUserId?: string; handoverAmount?: number }) =>
    apiClient.post<any>(`/shop/shifts/${shiftId}/close`, payload),
  getHandovers: (shiftId: string) => apiClient.get<any[]>(`/shop/shifts/${shiftId}/handovers`),
  list: (params?: { status?: string; cashierId?: string; terminalId?: string; from?: string; to?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.cashierId) q.set('cashierId', params.cashierId);
    if (params?.terminalId) q.set('terminalId', params.terminalId);
    if (params?.from) q.set('from', params.from);
    if (params?.to) q.set('to', params.to);
    if (params?.limit != null) q.set('limit', String(params.limit));
    const query = q.toString();
    return apiClient.get<any[]>(`/shop/shifts${query ? `?${query}` : ''}`);
  },
  getById: (shiftId: string) => apiClient.get<any>(`/shop/shifts/${shiftId}`),
  getAdminSummary: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    const query = q.toString();
    return apiClient.get<any>(`/shop/shifts/admin/summary${query ? `?${query}` : ''}`);
  },
  reopen: (shiftId: string) => apiClient.post<any>(`/shop/shifts/${shiftId}/reopen`, {}),
  getHandoverRecipients: () => apiClient.get<{ id: string; name: string; role: string }[]>('/shop/shifts/handover-recipients'),
};
