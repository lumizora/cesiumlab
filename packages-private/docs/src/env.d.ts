/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly CESIUM_ION_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
