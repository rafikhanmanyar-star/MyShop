import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiClient } from '../services/apiClient';
import { authApi, type LoginResponse } from '../services/authApi';
import { getAppContext, setAppContext } from '../services/appContext';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: { id: string; userId: string; username: string; name: string; role: string; tenantId: string } | null;
  tenant: { id: string; name: string; company_name: string } | null;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string, orgId?: string) => Promise<void>;
  register: (data: { name: string; email: string; username: string; password: string; companyName?: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    tenant: null,
  });

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const tenantId = localStorage.getItem('tenant_id');

    if (token && tenantId && apiClient.isAuthenticated()) {
      try {
        const parts = token.split('.');
        const payload = JSON.parse(atob(parts[1]));
        setState({
          isAuthenticated: true,
          isLoading: false,
          user: {
            id: payload.userId,
            userId: payload.userId,
            username: payload.username,
            name: payload.username,
            role: payload.role,
            tenantId: payload.tenantId,
          },
          tenant: { id: payload.tenantId, name: '', company_name: '' },
        });
      } catch {
        setState({ isAuthenticated: false, isLoading: false, user: null, tenant: null });
      }
    } else {
      setState({ isAuthenticated: false, isLoading: false, user: null, tenant: null });
    }

    const handleExpired = () => {
      setState({ isAuthenticated: false, isLoading: false, user: null, tenant: null });
    };
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, []);

  const login = useCallback(async (username: string, password: string, orgId?: string) => {
    const result: LoginResponse = await authApi.login({ username, password, org_id: orgId });
    apiClient.setAuth(result.token, result.tenantId);

    // Persist branch context: if we had QR branch for this org, keep it and set API client
    const ctx = getAppContext();
    if (ctx.branch_id && ctx.organization_id === result.tenantId) {
      apiClient.setBranchId(ctx.branch_id);
    } else if (ctx.organization_id !== result.tenantId) {
      setAppContext({ organization_id: result.tenantId, branch_id: null, selected_by_qr: false });
      apiClient.setBranchId(null);
    } else {
      apiClient.setBranchId(ctx.branch_id);
    }

    setState({
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: result.userId,
        userId: result.userId,
        username: result.username,
        name: result.name,
        role: result.role,
        tenantId: result.tenantId,
      },
      tenant: { id: result.tenantId, name: result.name, company_name: '' },
    });
  }, []);

  const register = useCallback(async (data: { name: string; email: string; username: string; password: string; companyName?: string }) => {
    const result = await authApi.register(data);
    apiClient.setAuth(result.token, result.tenantId);
    setState({
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: result.userId,
        userId: result.userId,
        username: result.username,
        name: result.name,
        role: result.role,
        tenantId: result.tenantId,
      },
      tenant: { id: result.tenantId, name: result.name, company_name: data.companyName || '' },
    });
  }, []);

  const logout = useCallback(() => {
    authApi.logout().catch(() => {});
    apiClient.clearAuth();
    apiClient.setBranchId(null);
    setState({ isAuthenticated: false, isLoading: false, user: null, tenant: null });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
