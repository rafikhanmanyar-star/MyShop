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

    // Cloud production: If no env var, assume API is on the same domain or use window origin
    return `${protocol}//${hostname}${hostname === 'localhost' ? `:${API_PORT}` : ''}/api`;
  }

  if (env) {
    return env.endsWith('/api') ? env : env.replace(/\/?$/, '') + '/api';
  }

  return `http://localhost:${API_PORT}/api`;
}

export function getBaseUrl(): string {
  const url = getApiBaseUrl();
  return url.replace(/\/api$/, '');
}

export function getFullImageUrl(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:')) return path;

  const base = getBaseUrl();
  // Ensure we don't end up with "//uploads" if base is empty or just "/"
  const cleanBase = base === '/' ? '' : base;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  return `${cleanBase}${cleanPath}`;
}
