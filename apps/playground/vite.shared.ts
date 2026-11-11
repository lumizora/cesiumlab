import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import stylex from '@stylexjs/unplugin';
import { defineConfig, type UserConfig } from 'vite';

function readGitRevision(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

interface PlaygroundConfigOptions {
  base: string;
  outDir: string;
  previewPort: number;
}

/** Keep Cesium Workers/Assets loading relative to Vite's base in both builds. */
export function createPlaygroundConfig(options: PlaygroundConfigOptions): UserConfig {
  return defineConfig({
    base: options.base,
    envDir: fileURLToPath(new URL('../..', import.meta.url)),
    plugins: [stylex.vite({ useCSSLayers: true }), react()],
    define: {
      __APP_VERSION__: JSON.stringify('0.0.0'),
      __GIT_REVISION__: JSON.stringify(readGitRevision()),
    },
    resolve: {
      dedupe: ['cesium', 'react', 'react-dom'],
    },
    server: { host: '127.0.0.1', port: 5273, strictPort: true },
    preview: { host: '127.0.0.1', port: options.previewPort, strictPort: true },
    build: { outDir: options.outDir, emptyOutDir: true, target: 'es2022' },
  });
}
