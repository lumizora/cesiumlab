import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { isAbortedRequest, redactText, redactUrl } from './redact';

const EVIDENCE_DIR = path.resolve(process.cwd(), '../../docs/evidence/stage-1');
const EXPECT_ION = process.env.CESIUMLAB_EXPECT_ION === '1';

test.beforeAll(() => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
});

test('serves Cesium Workers and Assets under a non-root base path', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const cesiumResponses: string[] = [];
  const ionResponses: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(redactText(message.text()));
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(redactText(error.message));
  });
  page.on('requestfailed', (request) => {
    const errorText = request.failure()?.errorText;
    if (isAbortedRequest(errorText)) {
      return;
    }
    failedRequests.push(
      `${request.method()} ${redactUrl(request.url())} :: ${errorText ?? 'unknown'}`,
    );
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedRequests.push(`${response.status()} ${redactUrl(response.url())}`);
    }
    if (response.url().includes('/cesium/')) {
      cesiumResponses.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
    const hostname = new URL(response.url()).hostname;
    if (hostname.includes('cesium.com')) {
      ionResponses.push(`${response.status()} ${hostname}${new URL(response.url()).pathname}`);
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
  const ionResponse = EXPECT_ION
    ? page.waitForResponse(
        (response) => response.url().includes('api.cesium.com') && response.status() === 200,
        { timeout: 60_000 },
      )
    : null;

  await page.getByRole('link', { name: /Cesium Smoke Test/ }).click();
  await expect(page.getByTestId('viewer-host')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible();

  await workerResponse;
  await assetResponse;
  if (ionResponse) {
    await ionResponse;
  }
  await page.waitForTimeout(2_000);
  await page.evaluate(() => window.scrollTo(0, 0));

  const sceneSources = await page.evaluate(() => {
    const element = document.querySelector<HTMLElement>('.viewer-canvas');
    return {
      ionStatus: element?.dataset.ionStatus ?? 'missing',
      imagery: element?.dataset.imagerySource ?? 'missing',
      terrain: element?.dataset.terrainSource ?? 'missing',
    };
  });

  if (EXPECT_ION) {
    expect(sceneSources.ionStatus).toBe('ready');
    expect(sceneSources.imagery).toBe('cesium-world-imagery');
    expect(sceneSources.terrain).toBe('cesium-world-terrain');
  }

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
    expectIon: EXPECT_ION,
    userAgent: await page.evaluate(() => navigator.userAgent),
    viewport: page.viewportSize(),
    sceneSources,
    cesiumResponses: [...new Set(cesiumResponses)].slice(0, 40),
    ionResponses: [...new Set(ionResponses)].slice(0, 40),
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
