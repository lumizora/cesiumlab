import { defineConfig } from '@playwright/test';

const channel = process.env.CESIUMLAB_BROWSER_CHANNEL ?? 'msedge';
const headless = process.env.CESIUMLAB_HEADFUL !== '1';

/**
 * Stage 2 visual review capture. Runs against the production preview at the
 * reference aspect ratio (1672 × 941) and uses `?capture=1` to hide Playground
 * chrome. This is evidence collection, not a visual approval pass.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'stage2.spec.ts',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results-stage2',
  use: {
    baseURL: 'http://127.0.0.1:4273',
    channel,
    headless,
    viewport: { width: 1672, height: 941 },
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
