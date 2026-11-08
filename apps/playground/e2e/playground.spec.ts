import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { isAbortedRequest, redactText, redactUrl } from './redact';

const EVIDENCE_DIR = path.resolve(process.cwd(), '../../docs/evidence/stage-1');
const EXPECT_ION = process.env.CESIUMLAB_EXPECT_ION === '1';

test.beforeAll(() => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
});

test('gallery, live Cesium smoke test, reload and archived detail', async ({ page, browser }) => {
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

  await page.goto('/');
  await expect(page).toHaveTitle(/cesiumlab/);
  await expect(page.getByRole('heading', { level: 1, name: 'CesiumJS 视觉实验库' })).toBeVisible();
  await expect(page.getByTestId('experiment-card')).toHaveCount(2);
  await expect(page.getByText('尚未提供首个正式视觉参考。')).toBeVisible();

  await page.screenshot({ path: path.join(EVIDENCE_DIR, 'gallery.png'), fullPage: true });

  const workerResponse = page.waitForResponse(
    (response) => response.url().includes('/cesium/Workers/') && response.status() === 200,
    { timeout: 30_000 },
  );
  const assetResponse = page.waitForResponse(
    (response) => response.url().includes('/cesium/Assets/') && response.status() === 200,
    { timeout: 30_000 },
  );
  const ionResponse = EXPECT_ION
    ? page.waitForResponse(
        (response) => response.url().includes('api.cesium.com') && response.status() === 200,
        { timeout: 60_000 },
      )
    : null;

  await page.getByRole('link', { name: /Cesium Smoke Test/ }).click();
  await expect(page).toHaveURL(/#\/experiments\/cesium-smoke-test/);
  await expect(page.getByTestId('experiment-detail')).toBeVisible();
  await expect(page.getByTestId('viewer-host')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible();

  await workerResponse;
  await assetResponse;
  if (ionResponse) {
    await ionResponse;
  }
  await page.waitForTimeout(2_000);

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

  const renderStats = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.viewer-canvas canvas');
    if (!canvas) {
      return {
        hasCanvas: false,
        width: 0,
        height: 0,
        uniqueColors: 0,
        nonDarkRatio: 0,
        sampledPixels: 0,
      };
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
        sampledPixels: 0,
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
      sampledPixels: sampled,
    };
  });

  expect(renderStats.hasCanvas).toBe(true);
  expect(renderStats.width).toBeGreaterThan(800);
  expect(renderStats.height).toBeGreaterThan(400);
  expect(renderStats.uniqueColors).toBeGreaterThan(30);
  expect(renderStats.nonDarkRatio).toBeGreaterThan(0.02);

  const webglInfo = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.viewer-canvas canvas');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    if (!gl) {
      return { vendor: 'unknown', renderer: 'unknown', version: 'unknown' };
    }
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: debugInfo
        ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL))
        : String(gl.getParameter(gl.VENDOR)),
      renderer: debugInfo
        ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
        : String(gl.getParameter(gl.RENDERER)),
      version: String(gl.getParameter(gl.VERSION)),
    };
  });

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, 'smoke-test-detail.png'),
    fullPage: false,
  });
  await page.locator('.viewer-host').screenshot({
    path: path.join(EVIDENCE_DIR, 'smoke-test-viewer.png'),
  });
  await page.locator('.notes').screenshot({
    path: path.join(EVIDENCE_DIR, 'smoke-test-notes.png'),
  });

  const canvas = page.locator('.viewer-canvas canvas');
  await canvas.evaluate((element) =>
    element.scrollIntoView({ block: 'center', inline: 'nearest' }),
  );
  await page.waitForTimeout(300);
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();

  if (canvasBox) {
    const beforeInteraction = await canvas.screenshot();
    await page.mouse.move(
      canvasBox.x + canvasBox.width * 0.5,
      canvasBox.y + canvasBox.height * 0.55,
    );
    await page.mouse.down();
    await page.mouse.move(
      canvasBox.x + canvasBox.width * 0.68,
      canvasBox.y + canvasBox.height * 0.57,
      { steps: 16 },
    );
    await page.mouse.up();
    await page.waitForTimeout(900);

    const afterDrag = await canvas.screenshot({
      path: path.join(EVIDENCE_DIR, 'interaction-after-drag.png'),
    });
    expect(afterDrag.equals(beforeInteraction)).toBe(false);

    await page.mouse.wheel(0, -700);
    await page.waitForTimeout(900);
    const afterZoom = await canvas.screenshot({
      path: path.join(EVIDENCE_DIR, 'interaction-after-zoom.png'),
    });
    expect(afterZoom.equals(afterDrag)).toBe(false);
  }

  await page.getByRole('button', { name: '重新加载场景' }).click();
  await expect(page.getByTestId('viewer-host')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('.viewer-canvas canvas')).toHaveCount(1);
  await page.waitForTimeout(600);

  await page.getByRole('link', { name: '← 返回 Gallery' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'CesiumJS 视觉实验库' })).toBeVisible();

  await page.getByRole('link', { name: /首个视觉实验/ }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: '首个视觉实验（等待参考）' }),
  ).toBeVisible();
  await expect(page.getByText('该实验暂无运行场景')).toBeVisible();
  await expect(page.locator('.viewer-canvas canvas')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, 'archived-detail.png'),
    fullPage: false,
  });

  const report = {
    capturedAt: new Date().toISOString(),
    baseURL: 'http://127.0.0.1:4273/',
    expectIon: EXPECT_ION,
    browserVersion: browser.version(),
    userAgent: await page.evaluate(() => navigator.userAgent),
    viewport: page.viewportSize(),
    webgl: webglInfo,
    renderStats,
    sceneSources,
    cesiumResponses: [...new Set(cesiumResponses)].slice(0, 40),
    ionResponses: [...new Set(ionResponses)].slice(0, 40),
    consoleErrors,
    pageErrors,
    failedRequests,
  };
  writeFileSync(
    path.join(EVIDENCE_DIR, 'browser-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test('shows a WebGL fallback and keeps navigation usable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
          return null;
        }
        return Reflect.apply(original, this, [type, ...args]);
      },
    });
  });

  await page.goto('/#/experiments/cesium-smoke-test');
  await expect(page.getByTestId('viewer-host')).toHaveAttribute('data-state', 'unsupported');
  await expect(page.getByRole('alert')).toContainText('不支持 WebGL');
  await expect(page.locator('.viewer-canvas canvas')).toHaveCount(0);
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, 'webgl-unavailable.png'),
    fullPage: false,
  });

  await page.getByRole('link', { name: '← 返回 Gallery' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'CesiumJS 视觉实验库' })).toBeVisible();
});

test('unknown experiment route keeps navigation usable', async ({ page }) => {
  await page.goto('/#/experiments/not-registered');
  await expect(page.getByRole('heading', { level: 1, name: '找不到实验' })).toBeVisible();
  await expect(page.getByText('not-registered')).toBeVisible();

  await page.getByRole('link', { name: '回到 Gallery' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'CesiumJS 视觉实验库' })).toBeVisible();
});
