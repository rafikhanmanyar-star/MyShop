/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
    readonly VITE_API_URL?: string;
    /** Optional — enables map picker on checkout */
    readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}
