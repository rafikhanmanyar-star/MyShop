/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SHOP_SLUG?: string;
  readonly VITE_SHOP_APP_URL?: string;
  readonly VITE_RIDER_APP_URL?: string;
  readonly VITE_POS_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
