import { describe, expect, it } from 'vitest';

import { catalog, catalogStats, getExperiment } from './registry';

describe('manual experiment catalog', () => {
  it('registers unique experiment ids', () => {
    const ids = catalog.map((entry) => entry.metadata.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('registers the smoke test as runnable with a loader', () => {
    const smokeTest = getExperiment('cesium-smoke-test');
    expect(smokeTest?.metadata.runtimeStatus).toBe('runnable');
    expect(smokeTest?.metadata.entry).toBe('./main.ts');
    expect(smokeTest?.load).toBeTypeOf('function');
  });

  it('keeps metadata-only experiments visible without a loader', () => {
    const archived = getExperiment('awaiting-visual-reference');
    expect(archived?.metadata.runtimeStatus).toBe('not-implemented');
    expect(archived?.load).toBeNull();
  });

  it('reports totals that match the catalog', () => {
    expect(catalogStats.total).toBe(catalog.length);
    expect(catalogStats.runnable).toBe(
      catalog.filter((entry) => entry.metadata.runtimeStatus === 'runnable').length,
    );
  });
});
