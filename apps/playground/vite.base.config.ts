import { createPlaygroundConfig } from './vite.shared.ts';

/**
 * Build used for GitHub Pages / non-root deployment. The default keeps the
 * historical `/cesiumlab/` target; CI overrides this with the actual repository
 * name so project Pages work for a renamed repository.
 */
const requestedBase = process.env.DEPLOY_BASE_PATH?.trim() || '/cesiumlab/';
const base = requestedBase.endsWith('/') ? requestedBase : `${requestedBase}/`;

export default createPlaygroundConfig({
  base,
  outDir: 'dist-base',
  previewPort: 4274,
});
