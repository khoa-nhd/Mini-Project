/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// tsconfig uses moduleDetection: "force", so global types must be declared explicitly
declare global {
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

  interface WindowEventMap {
    'quicknotes:save': CustomEvent<void>;
    'quicknotes:focus-search': CustomEvent<void>;
    'quicknotes:focus-editor': CustomEvent<void>;
    'quicknotes:focus-title': CustomEvent<void>;
  }
}

export {};
