const API_PORT = 3000;

export function getApiBaseUrl(): string {
  const env = import.meta.env.VITE_API_URL as string | undefined;

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    const isElectron = protocol === 'file:' || !hostname;
    const isDevServer = import.meta.env.DEV && !isElectron;

    // In Vite dev server mode, use relative URL so requests go through the Vite proxy
    if (isDevServer) {
      return '/api';
    }

    // Electron or production builds: use VITE_API_URL if available
    if (env) {
      return env.endsWith('/api') ? env : env.replace(/\/?$/, '') + '/api';
    }

    if (isElectron) {
      return `http://localhost:${API_PORT}/api`;
    }

    return `${protocol}//${hostname}:${API_PORT}/api`;
  }

  if (env) {
    return env.endsWith('/api') ? env : env.replace(/\/?$/, '') + '/api';
  }

  return `http://localhost:${API_PORT}/api`;
}
