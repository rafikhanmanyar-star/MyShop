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
  created_at?: string;
}

export interface ShopBankAccount {
  id: string;
  name: string;
  code?: string;
  account_type: string;
  currency: string;
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

export const shopApi = {
  getBranches: () => apiClient.get<ShopBranch[]>('/shop/branches'),
  createBranch: (data: any) => apiClient.post('/shop/branches', data),
  updateBranch: (id: string, data: any) => apiClient.put(`/shop/branches/${id}`, data),

  getWarehouses: () => apiClient.get<any[]>('/shop/warehouses'),
  createWarehouse: (data: any) => apiClient.post('/shop/warehouses', data),

  getTerminals: () => apiClient.get<any[]>('/shop/terminals'),
  createTerminal: (data: any) => apiClient.post('/shop/terminals', data),
  updateTerminal: (id: string, data: any) => apiClient.put(`/shop/terminals/${id}`, data),
  deleteTerminal: (id: string) => apiClient.delete(`/shop/terminals/${id}`),

  getShopCategories: () => apiClient.get<ShopProductCategory[]>('/shop/categories'),
  createShopCategory: (data: { name: string }) => apiClient.post<{ id: string }>('/shop/categories', data),
  updateShopCategory: (id: string, data: { name: string }) => apiClient.put(`/shop/categories/${id}`, data),
  deleteShopCategory: (id: string) => apiClient.delete(`/shop/categories/${id}`),

  getProducts: () => apiClient.get<ShopProduct[]>('/shop/products'),
  createProduct: (data: any) => apiClient.post('/shop/products', data),
  updateProduct: (id: string, data: any) => apiClient.put(`/shop/products/${id}`, data),
  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return apiClient.post<{ imageUrl: string }>('/shop/upload-image', formData);
  },

  getInventory: () => apiClient.get<any[]>('/shop/inventory'),
  adjustInventory: (data: any) => apiClient.post('/shop/inventory/adjust', data),
  getMovements: (productId?: string) => apiClient.get<any[]>(`/shop/inventory/movements${productId ? `?productId=${productId}` : ''}`),

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
  getJournalEntries: (limit = 200) => apiClient.get<any[]>(`/shop/accounting/journal-entries?limit=${limit}`),
  postJournalEntry: (data: any) => apiClient.post('/shop/accounting/journal-entries', data),
  getFinancialSummary: () => apiClient.get<any>('/shop/accounting/summary'),
  getBankBalances: () => apiClient.get<any[]>('/shop/accounting/bank-balances'),
  getSalesBySource: () => apiClient.get<any>('/shop/accounting/sales-by-source'),
  getDailyTrend: (days = 30) => apiClient.get<any>(`/shop/accounting/daily-trend?days=${days}`),
  getCategoryPerformance: () => apiClient.get<any[]>('/shop/accounting/category-performance'),
  getTransactions: (limit = 50) => apiClient.get<any[]>(`/shop/accounting/transactions?limit=${limit}`),
};
