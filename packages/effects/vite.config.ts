import { defineConfig } from 'vite-plus';

export default defineConfig({
  build: {
    target: 'es2022',
    minify: false,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index',
    },
    rolldownOptions: {
      external: ['cesium'],
    },
  },
});
