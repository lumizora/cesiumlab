import { describe, expect, it } from 'vitest';

import { resolveCesiumBaseUrl } from './base-url';

describe('resolveCesiumBaseUrl', () => {
  it('appends the Cesium asset directory to root and non-root bases', () => {
    expect(resolveCesiumBaseUrl('/')).toBe('/cesium/');
    expect(resolveCesiumBaseUrl('/cesiumlab/')).toBe('/cesiumlab/cesium/');
    expect(resolveCesiumBaseUrl('/cesiumlab')).toBe('/cesiumlab/cesium/');
  });
});
