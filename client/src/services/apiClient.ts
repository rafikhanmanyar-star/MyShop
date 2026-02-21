import { getApiBaseUrl } from '../config/apiUrl';

export interface ApiError {
  error: string;
  message?: string;
  status?: number;
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private tenantId: string | null = null;

  constructor() {
    this.baseUrl = getApiBaseUrl();
    this.loadAuth();
  }

  private loadAuth(): void {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
      this.tenantId = localStorage.getItem('tenant_id');
    }
  }

  setAuth(token: string, tenantId: string): void {
    this.token = token;
    this.tenantId = tenantId;
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('tenant_id', tenantId);
    }
  }

  clearAuth(): void {
    this.token = null;
    this.tenantId = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('tenant_id');
    }
  }

  getToken(): string | null { return this.token; }
  getTenantId(): string | null { return this.tenantId; }

  isAuthenticated(): boolean {
    if (!this.token) return false;
    try {
      const parts = this.token.split('.');
      if (parts.length !== 3) return false;
      const payload = JSON.parse(atob(parts[1]));
      return !(payload.exp && payload.exp * 1000 < Date.now());
    } catch {
      return false;
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}, data?: any): Promise<T> {
    this.loadAuth();

    const isFormData = data instanceof FormData;
    const url = `${this.baseUrl}${endpoint}`;
    const headers: HeadersInit = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    };

    if (this.token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const body = isFormData ? data : (data ? JSON.stringify(data) : undefined);
      const response = await fetch(url, { ...options, headers, body });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
        }
        return {} as T;
      }

      const responseData = await response.json();

      if (response.status === 401) {
        const hadToken = !!this.token;
        if (hadToken) {
          this.clearAuth();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('auth:expired', { detail: responseData }));
          }
        }
        throw { error: responseData.error || 'Unauthorized', message: responseData.message, status: 401 };
      }

      if (!response.ok) {
        throw { error: responseData.error || 'Request failed', message: responseData.message, status: response.status };
      }

      return responseData as T;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.name === 'TypeError') {
          throw { error: 'NetworkError', message: 'No internet connection.', status: 0 };
        }
      }
      throw error;
    }
  }

  async get<T>(endpoint: string, headers?: HeadersInit): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', headers });
  }

  async post<T>(endpoint: string, data?: any, options: { headers?: HeadersInit } = {}): Promise<T> {
    return this.request<T>(endpoint, { method: 'POST', headers: options.headers }, data);
  }

  async put<T>(endpoint: string, data?: any, options: { headers?: HeadersInit } = {}): Promise<T> {
    return this.request<T>(endpoint, { method: 'PUT', headers: options.headers }, data);
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
