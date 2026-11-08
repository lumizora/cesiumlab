import type * as CesiumNamespace from 'cesium';

let pending: Promise<typeof CesiumNamespace> | undefined;

/**
 * Loads CesiumJS once and applies the optional Cesium ion public token before
 * any ion-backed asset is requested. The app sets `window.CESIUM_BASE_URL` and
 * `window.CESIUM_ION_TOKEN` before experiments are dynamically imported.
 */
export function loadCesium(): Promise<typeof CesiumNamespace> {
  if (!pending) {
    pending = import('cesium').then((Cesium) => {
      const token = (window as Window & { CESIUM_ION_TOKEN?: string }).CESIUM_ION_TOKEN;
      if (token) {
        Cesium.Ion.defaultAccessToken = token;
      }
      return Cesium;
    });
  }
  return pending;
}
