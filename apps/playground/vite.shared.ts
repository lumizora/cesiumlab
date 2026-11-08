import { execFileSync } from 'node:child_process';

import vue from '@vitejs/plugin-vue';
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

/**
 * Shared Vite configuration for the default root build and the non-root
 * deployment smoke build. `base` must match the path where the site is served
 * because it also feeds `CESIUM_BASE_URL` at runtime.
 */
export function createPlaygroundConfig(options: PlaygroundConfigOptions): UserConfig {
  return defineConfig({
    base: options.base,
    plugins: [vue()],
    define: {
      __APP_VERSION__: JSON.stringify('0.0.0'),
      __GIT_REVISION__: JSON.stringify(readGitRevision()),
    },
    resolve: {
      dedupe: ['cesium'],
    },
    server: {
      host: '127.0.0.1',
      port: 5273,
      strictPort: true,
    },
    preview: {
      host: '127.0.0.1',
      port: options.previewPort,
      strictPort: true,
    },
    build: {
      outDir: options.outDir,
      emptyOutDir: true,
      target: 'es2022',
    },
  });
}
