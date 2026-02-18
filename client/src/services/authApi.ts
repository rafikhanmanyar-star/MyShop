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

export const authApi = {
  login: (data: { username: string; password: string }) =>
    apiClient.post<LoginResponse>('/auth/login', data),

  register: (data: { name: string; email: string; username: string; password: string; companyName?: string }) =>
    apiClient.post<RegisterResponse>('/auth/register', data),

  logout: () => apiClient.post('/auth/logout'),
};
