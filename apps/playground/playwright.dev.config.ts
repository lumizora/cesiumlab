import { defineConfig } from '@playwright/test';

const channel = process.env.CESIUMLAB_BROWSER_CHANNEL ?? 'msedge';
const headless = process.env.CESIUMLAB_HEADFUL !== '1';

/**
 * Verifies the actual Vite dev server (not a production preview). This covers
 * the separate dev-only module graph and the `/cesium/` public asset path.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'dev-mode.spec.ts',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results-dev',
  use: {
    baseURL: 'http://127.0.0.1:5273',
    channel,
    headless,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'],
    },
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:5273',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
