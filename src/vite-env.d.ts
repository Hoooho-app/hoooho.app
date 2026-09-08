/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_APP_UPDATED_AT: string
  readonly VITE_APP_VERSION: string
  readonly VITE_BUILD_COMMIT: string
  readonly VITE_BUILD_TIMESTAMP: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
