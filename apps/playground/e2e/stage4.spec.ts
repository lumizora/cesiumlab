import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { isAbortedRequest, redactText, redactUrl } from './redact';

const EVIDENCE_DIR = path.resolve(process.cwd(), '../../docs/evidence/stage-4');

test.beforeAll(() => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
});

async function waitForScene(page: Page) {
  await expect(page.getByTestId('viewer-host')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible();
}

test('public Playground gallery, direct URLs, switching and approved showcase', async ({
  page,
  browser,
}) => {
  const consoleErrors: string[] = [];
  const networkNoise: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = redactText(message.text());
      if (/Failed to load resource.*ERR_(CONNECTION_CLOSED|TIMED_OUT)/.test(text)) {
        networkNoise.push(text);
        return;
      }
      consoleErrors.push(text);
    }
  });
  page.on('pageerror', (error) => pageErrors.push(redactText(error.message)));
  page.on('requestfailed', (request) => {
    const errorText = request.failure()?.errorText;
    if (isAbortedRequest(errorText)) {
      return;
    }
    const isTransientIon =
      /ERR_CONNECTION_CLOSED|ERR_TIMED_OUT/.test(errorText ?? '') &&
      /(^|\.)cesium\.com$/.test(new URL(request.url()).hostname);
    if (isTransientIon) {
      networkNoise.push(
        `${request.method()} ${redactUrl(request.url())} :: ${errorText ?? 'unknown'}`,
      );
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
  });

  // Gallery: all registered archives remain visible, with maturity/status
  // separated. The approved experiment is discoverable from the card.
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'CesiumJS 视觉实验库' })).toBeVisible();
  await expect(page.getByTestId('experiment-card')).toHaveCount(3);
  await expect(page.getByText('S2-001 已通过用户视觉验收。')).toBeVisible();
  await expect(
    page.locator('.stat').filter({ hasText: 'Visual Approved' }).getByText('1'),
  ).toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCE_DIR, 'gallery.png'), fullPage: true });

  // Independent experiment URL and approved default showcase.
  await page.getByRole('link', { name: /Earth Network Convergence/ }).click();
  await expect(page).toHaveURL(/#\/experiments\/earth-network-convergence/);
  await expect(page.getByTestId('experiment-detail')).toBeVisible();
  await expect(page.locator('.badge').filter({ hasText: 'Visual Approved' }).first()).toBeVisible();
  await waitForScene(page);
  await expect(page.locator('.viewer-canvas')).toHaveAttribute(
    'data-stage2-state',
    'visual-approved',
  );
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, 's2-001-detail.png'),
    fullPage: true,
  });

  // Deterministic regression control: paused at t=0 and terrain disabled so
  // the screenshot is stable across ion availability.
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/?capture=1&paused=1&terrain-off#/experiments/earth-network-convergence');
  await waitForScene(page);
  const sceneData = await page.evaluate(() => {
    const element = document.querySelector<HTMLElement>('.viewer-canvas');
    return { ...element?.dataset };
  });
  expect(sceneData.experiment).toBe('earth-network-convergence');
  expect(sceneData.stage2State).toBe('visual-approved');
  expect(sceneData.paused).toBe('true');
  expect(sceneData.terrain).toBe('ellipsoid');
  expect(sceneData.routeCount).toBe('7');
  expect(sceneData.nodeCount).toBe('7');
  await page.waitForTimeout(600);
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, 's2-001-regression.png'),
    fullPage: false,
  });

  // Refresh keeps the direct URL and recreates exactly one scene.
  await page.reload();
  await expect(page).toHaveURL(/paused=1&terrain-off/);
  await waitForScene(page);
  await expect(page.locator('.viewer-canvas canvas')).toHaveCount(1);

  // Switching to another runnable experiment and back must not leave a
  // second canvas or a stale scene.
  await page.goto('/#/experiments/cesium-smoke-test');
  await waitForScene(page);
  await expect(page.locator('.viewer-canvas canvas')).toHaveCount(1);
  await page.goto('/#/experiments/earth-network-convergence');
  await waitForScene(page);
  await expect(page.locator('.viewer-canvas canvas')).toHaveCount(1);

  // Archived metadata-only experiment stays publicly accessible, without a
  // viewer or a broken execution path.
  await page.goto('/#/experiments/awaiting-visual-reference');
  await expect(page.getByText('该实验暂无运行场景')).toBeVisible();
  await expect(page.getByTestId('viewer-host')).toHaveCount(0);

  // Unknown experiment is isolated to a not-found detail, not a global crash.
  await page.goto('/#/experiments/not-registered');
  await expect(page.getByRole('heading', { level: 1, name: '找不到实验' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByTestId('experiment-card')).toHaveCount(3);

  const report = {
    capturedAt: new Date().toISOString(),
    status: 'Stage 4 / public Playground verification',
    viewport: page.viewportSize(),
    browserVersion: browser.version(),
    userAgent: await page.evaluate(() => navigator.userAgent),
    galleryCards: 3,
    approvedShowcase: {
      url: '/?capture=1&paused=1&terrain-off#/experiments/earth-network-convergence',
      status: 'Visual Approved',
      baseline: 'docs/visual-baselines/S2-001',
      sceneData,
    },
    checks: {
      directUrl: true,
      refresh: true,
      experimentSwitch: true,
      archivedDetail: true,
      unknownRouteIsolated: true,
      canvasCountAfterSwitch: 1,
    },
    consoleErrors,
    networkNoise,
    pageErrors,
    failedRequests,
  };

  writeFileSync(
    path.join(EVIDENCE_DIR, 'stage4-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
