import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    singleQuote: true,
  },
  lint: {
    ignorePatterns: [
      'packages-private/docs/themes/cesiumlab/**',
      'packages-private/docs/src/themes/cesiumlab/**',
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
