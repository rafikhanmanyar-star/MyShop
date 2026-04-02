import { apiClient } from './apiClient';

export interface LoginResponse {
  token: string;
  tenantId: string;
  userId: string;
  username: string;
  role: string;
  name: string;
}

export interface RegisterResponse extends LoginResponse {}

export interface PublicOrganizationInfo {
  id: string;
  name: string;
  company_name: string;
  slug: string | null;
  branch_name: string | null;
}

export const authApi = {
  /** Public: resolve tenant (and optional branch) for login UI */
  getPublicOrganization: (orgId: string, branchId?: string | null) => {
    const q = new URLSearchParams();
    q.set('org_id', orgId);
    if (branchId) q.set('branch_id', branchId);
    return apiClient.get<PublicOrganizationInfo>(`/auth/organization?${q.toString()}`);
  },

  login: (data: { username: string; password: string; org_id?: string }) =>
    apiClient.post<LoginResponse>('/auth/login', data),

  register: (data: { name: string; email: string; username: string; password: string; companyName?: string }) =>
    apiClient.post<RegisterResponse>('/auth/register', data),

  logout: () => apiClient.post('/auth/logout'),
};
