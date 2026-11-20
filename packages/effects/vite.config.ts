import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'es2022',
    platform: 'browser',
    dts: true,
    clean: true,
    tsconfig: './tsconfig.build.json',
    deps: {
      neverBundle: ['cesium'],
    },
  },
});
