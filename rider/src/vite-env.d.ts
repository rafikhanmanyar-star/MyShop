/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Default shop slug prefilled on login (optional). */
  readonly VITE_SHOP_SLUG?: string;
  /** Google Maps JavaScript API key (Directions + Maps). Restrict by HTTP referrer in Cloud Console. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}

declare const __APP_VERSION__: string;
