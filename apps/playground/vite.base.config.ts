import { createPlaygroundConfig } from './vite.shared.ts';

/**
 * Build used to verify Cesium Workers/Assets under a non-root deployment path.
 * Kept separate from the default build so both outputs can coexist.
 */
export default createPlaygroundConfig({
  base: '/cesiumlab/',
  outDir: 'dist-base',
  previewPort: 4274,
});
