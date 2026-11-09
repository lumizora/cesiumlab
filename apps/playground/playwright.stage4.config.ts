import { defineConfig } from '@playwright/test';

const channel = process.env.CESIUMLAB_BROWSER_CHANNEL ?? 'msedge';
const headless = process.env.CESIUMLAB_HEADFUL !== '1';

/**
 * Stage 4 public Playground verification. Runs against the production preview
 * and exercises the Gallery, direct experiment URLs, refresh, experiment
 * switching, archived metadata, and the approved S2-001 showcase.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'stage4.spec.ts',
  timeout: 180_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results-stage4',
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
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
