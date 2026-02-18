const API_PORT = 3000;

export function getApiBaseUrl(): string {
  const env = import.meta.env.VITE_API_URL as string | undefined;

  if (env) {
    return env.endsWith('/api') ? env : env.replace(/\/?$/, '') + '/api';
  }

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    if (protocol === 'file:' || !hostname) {
      return `http://localhost:${API_PORT}/api`;
    }
    return `${protocol}//${hostname}:${API_PORT}/api`;
  }

  return `http://localhost:${API_PORT}/api`;
}
