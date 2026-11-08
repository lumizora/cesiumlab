/**
 * Cesium resolves Workers, Assets, Widgets and ThirdParty against
 * `window.CESIUM_BASE_URL`. This module must be evaluated before any dynamic
 * `import('cesium')`; the Playground imports it first from main.ts and never
 * statically imports a Cesium value module.
 */
export function resolveCesiumBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalized}cesium/`;
}

if (typeof window !== 'undefined') {
  window.CESIUM_BASE_URL = resolveCesiumBaseUrl(import.meta.env.BASE_URL);

  const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN?.trim();
  if (ionToken) {
    window.CESIUM_ION_TOKEN = ionToken;
  }
}
