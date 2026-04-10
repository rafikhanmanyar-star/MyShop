import type { ApiError } from '../services/apiClient';

/** True when the failure is likely an unreachable/restarting API server or transport failure (not validation). */
export function isApiConnectivityFailure(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Partial<ApiError> & { status?: number };
  if (e.connectivity === true) return true;
  if (e.status === 0) return true;
  if (e.status === 502 || e.status === 503 || e.status === 504) return true;
  if (String(e.error ?? '') === 'NetworkError') return true;
  return false;
}

/** User-facing message: prefers server-provided text; uses a clear fallback for connectivity issues. */
export function userMessageForApiError(err: unknown, fallback: string): string {
  if (isApiConnectivityFailure(err)) {
    const e = err as Partial<ApiError>;
    if (typeof e.message === 'string' && e.message.trim()) return e.message;
    if (typeof e.error === 'string' && e.error !== 'NetworkError' && e.error.trim()) return e.error;
    return 'Cannot reach the API server. It may be restarting or temporarily unavailable. Check your connection and try again.';
  }
  const e = err as Partial<ApiError>;
  if (typeof e.message === 'string' && e.message.trim()) return e.message;
  if (typeof e.error === 'string' && e.error.trim()) return e.error;
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}
