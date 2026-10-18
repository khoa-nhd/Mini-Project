/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID: string;
  readonly VITE_USE_FIREBASE_EMULATORS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface WindowEventMap {
    'quicknotes:save': CustomEvent<void>;
    'quicknotes:focus-search': CustomEvent<void>;
    'quicknotes:focus-editor': CustomEvent<void>;
  }
}