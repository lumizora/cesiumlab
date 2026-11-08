import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const EVIDENCE_DIR = path.resolve(process.cwd(), '../../docs/evidence/stage-1');

test.beforeAll(() => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
});

test('Vite dev server renders the Cesium smoke test', async ({ page, browser }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const cesiumResponses: string[] = [];
  const devModuleResponses: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`,
    );
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedRequests.push(`${response.status()} ${response.url()}`);
    }
    if (response.url().includes('/cesium/')) {
      cesiumResponses.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
    if (response.url().includes('/src/') && response.url().includes('.ts')) {
      devModuleResponses.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'CesiumJS 视觉实验库' })).toBeVisible();

  const workerResponse = page.waitForResponse(
    (response) => response.url().includes('/cesium/Workers/') && response.status() === 200,
    { timeout: 40_000 },
  );
  const assetResponse = page.waitForResponse(
    (response) => response.url().includes('/cesium/Assets/') && response.status() === 200,
    { timeout: 40_000 },
  );

  await page.getByRole('link', { name: /Cesium Smoke Test/ }).click();
  await expect(page.getByTestId('viewer-host')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible();

  await workerResponse;
  await assetResponse;
  await page.waitForTimeout(1_500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, 'dev-mode-smoke-test.png'),
    fullPage: false,
  });

  const renderStats = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.viewer-canvas canvas');
    if (!canvas) {
      return { hasCanvas: false, width: 0, height: 0, uniqueColors: 0, nonDarkRatio: 0 };
    }

    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const context = offscreen.getContext('2d');
    if (!context) {
      return {
        hasCanvas: true,
        width: canvas.width,
        height: canvas.height,
        uniqueColors: 0,
        nonDarkRatio: 0,
      };
    }

    context.drawImage(canvas, 0, 0);
    const { data } = context.getImageData(0, 0, offscreen.width, offscreen.height);
    const colors = new Set<number>();
    let nonDark = 0;
    let sampled = 0;

    for (let index = 0; index < data.length; index += 16) {
      const red = data[index] ?? 0;
      const green = data[index + 1] ?? 0;
      const blue = data[index + 2] ?? 0;
      colors.add(((red >> 2) << 12) | ((green >> 2) << 6) | (blue >> 2));
      if (red + green + blue > 60) {
        nonDark += 1;
      }
      sampled += 1;
    }

    return {
      hasCanvas: true,
      width: canvas.width,
      height: canvas.height,
      uniqueColors: colors.size,
      nonDarkRatio: sampled === 0 ? 0 : nonDark / sampled,
    };
  });

  expect(renderStats.hasCanvas).toBe(true);
  expect(renderStats.width).toBeGreaterThan(800);
  expect(renderStats.uniqueColors).toBeGreaterThan(30);
  expect(renderStats.nonDarkRatio).toBeGreaterThan(0.02);
  expect(cesiumResponses.some((entry) => entry.includes('/cesium/Workers/'))).toBe(true);
  expect(cesiumResponses.some((entry) => entry.includes('/cesium/Assets/'))).toBe(true);
  expect(devModuleResponses.length).toBeGreaterThan(0);

  const report = {
    capturedAt: new Date().toISOString(),
    mode: 'vite dev',
    baseURL: 'http://127.0.0.1:5273/',
    browserVersion: browser.version(),
    userAgent: await page.evaluate(() => navigator.userAgent),
    viewport: page.viewportSize(),
    renderStats,
    cesiumResponses: [...new Set(cesiumResponses)].slice(0, 40),
    devModuleResponses: [...new Set(devModuleResponses)].slice(0, 20),
    consoleErrors,
    pageErrors,
    failedRequests,
  };
  writeFileSync(path.join(EVIDENCE_DIR, 'dev-report.json'), `${JSON.stringify(report, null, 2)}\n`);

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
