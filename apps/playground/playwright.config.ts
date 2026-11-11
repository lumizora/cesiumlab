import { defineConfig } from '@playwright/test';

const channel = process.env.CESIUMLAB_BROWSER_CHANNEL ?? 'msedge';
const headless = process.env.CESIUMLAB_HEADFUL !== '1';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'playground.spec.ts',
  timeout: process.env.CI ? 240_000 : 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:4273',
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
    command: 'pnpm preview',
    url: 'http://127.0.0.1:4273',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
