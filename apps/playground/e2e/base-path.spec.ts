import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const EVIDENCE_DIR = path.resolve(process.cwd(), '../../docs/evidence/stage-1');

test.beforeAll(() => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
});

test('serves Cesium Workers and Assets under a non-root base path', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const cesiumResponses: string[] = [];

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
  });

  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'CesiumJS 视觉实验库' })).toBeVisible();

  const workerResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/cesiumlab/cesium/Workers/') && response.status() === 200,
    { timeout: 30_000 },
  );
  const assetResponse = page.waitForResponse(
    (response) => response.url().includes('/cesiumlab/cesium/Assets/') && response.status() === 200,
    { timeout: 30_000 },
  );

  await page.getByRole('link', { name: /Cesium Smoke Test/ }).click();
  await expect(page.getByTestId('viewer-host')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible();

  await workerResponse;
  await assetResponse;
  await page.waitForTimeout(1_500);
  await page.evaluate(() => window.scrollTo(0, 0));

  expect(cesiumResponses.length).toBeGreaterThan(0);
  expect(cesiumResponses.every((entry) => entry.startsWith('200 '))).toBe(true);
  expect(cesiumResponses.some((entry) => entry.includes('/cesiumlab/cesium/Workers/'))).toBe(true);
  expect(cesiumResponses.some((entry) => entry.includes('/cesiumlab/cesium/Assets/'))).toBe(true);
  expect(cesiumResponses.some((entry) => entry.includes(' /cesium/'))).toBe(false);

  await page.screenshot({
    path: path.join(EVIDENCE_DIR, 'base-path-smoke-test.png'),
    fullPage: false,
  });

  const report = {
    capturedAt: new Date().toISOString(),
    baseURL: 'http://127.0.0.1:4274/cesiumlab/',
    userAgent: await page.evaluate(() => navigator.userAgent),
    viewport: page.viewportSize(),
    cesiumResponses: [...new Set(cesiumResponses)].slice(0, 40),
    consoleErrors,
    pageErrors,
    failedRequests,
  };
  writeFileSync(
    path.join(EVIDENCE_DIR, 'base-path-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
