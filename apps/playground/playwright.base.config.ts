import { defineConfig } from '@playwright/test';

const channel = process.env.CESIUMLAB_BROWSER_CHANNEL ?? 'msedge';
const headless = process.env.CESIUMLAB_HEADFUL !== '1';

/**
 * Runs the same smoke check against `/cesiumlab/` to prove that Cesium
 * Workers, Assets and Widgets resolve correctly on non-root deployments.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'base-path.spec.ts',
  timeout: process.env.CI ? 240_000 : 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-base' }]],
  outputDir: 'test-results-base',
  use: {
    baseURL: 'http://127.0.0.1:4274/cesiumlab/',
    channel,
    headless,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'],
    },
  },
  webServer: {
    command: 'pnpm preview:base',
    url: 'http://127.0.0.1:4274/cesiumlab/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
