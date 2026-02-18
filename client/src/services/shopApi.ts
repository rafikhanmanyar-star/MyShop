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
};
