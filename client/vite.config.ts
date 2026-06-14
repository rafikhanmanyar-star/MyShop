import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));
/** Set by release script so the UI matches the installer before package.json is bumped. */
const appVersion = process.env.RELEASE_APP_VERSION || pkg.version || '0.0.0';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const rawApiTarget = env.VITE_API_URL || 'http://localhost:3001';
  /** Browser calls `/api/...`; proxy forwards to `target + /api/...`. Strip a trailing `/api` from env so we never hit `/api/api/...`. */
  const proxyApiTarget = rawApiTarget.replace(/\/api\/?$/, '');

  /** Electron `loadFile()` uses file:// — absolute `/assets/...` breaks (ERR_FILE_NOT_FOUND). Only apply in production builds, not `vite dev`. */
  const useRelativeAssetBase =
    command === 'build' &&
    (process.env.VITE_ELECTRON_BUILD === '1' || mode === 'cloud');

  const disablePwa = useRelativeAssetBase;

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        disable: disablePwa,
        registerType: 'autoUpdate',
        includeAssets: [
          'icons/icon-192.svg',
          'icons/icon-512.svg',
          'icons/icon-192.png',
          'icons/icon-512.png',
          'icons/apple-touch-icon.png',
        ],
        manifest: {
          name: 'MyShop - POS & Inventory',
          short_name: 'MyShop',
          description: 'Shop dashboard, POS, inventory, orders, and accounting — install for quick mobile access.',
          theme_color: '#4A90E2',
          background_color: '#ECEFF3',
          display: 'standalone',
          orientation: 'any',
          scope: '/',
          start_url: '/',
          categories: ['business', 'finance', 'productivity'],
          icons: [
            {
              src: '/icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/icons/icon-192.svg',
              sizes: '192x192',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: '/icons/icon-512.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
          navigateFallback: 'index.html',
          navigateFallbackAllowlist: [/^\//],
          navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /\/api\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 },
                cacheableResponse: { statuses: [0, 200] },
                networkTimeoutSeconds: 10,
              },
            },
            {
              urlPattern: /\/uploads\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'image-cache',
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
        },
      }),
    ],
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    optimizeDeps: {
      exclude: ['react-window'],
    },
    base: useRelativeAssetBase ? './' : '/',
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: proxyApiTarget,
          changeOrigin: true,
          secure: true,
        },
        '/uploads': {
          target: proxyApiTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      outDir: 'dist',
    },
  };
});
