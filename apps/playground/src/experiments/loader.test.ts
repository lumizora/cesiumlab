import { describe, expect, it } from 'vitest';

import { assertExperimentModule, loadExperimentModule } from './loader';

describe('experiment loader', () => {
  it('accepts a module with a mount function', () => {
    const module = { mount: async () => undefined };
    expect(assertExperimentModule(module, 'fixture')).toBe(module);
  });

  it('rejects modules without a mount function', () => {
    expect(() => assertExperimentModule({}, 'fixture')).toThrow(/mount/);
    expect(() => assertExperimentModule(null, 'fixture')).toThrow(/模块对象/);
  });

  it('rejects unknown experiment ids', async () => {
    await expect(loadExperimentModule('does-not-exist')).rejects.toThrow(/找不到实验/);
  });

  it('rejects archived experiments without a runtime entry', async () => {
    await expect(loadExperimentModule('awaiting-visual-reference')).rejects.toThrow(
      /没有已注册的运行入口/,
    );
  });

  it('loads the registered smoke test module', async () => {
    const module = await loadExperimentModule('cesium-smoke-test');
    expect(module.mount).toBeTypeOf('function');
  });
});
