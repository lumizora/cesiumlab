import { describe, expect, it } from 'vitest';

import { detectWebGLSupport } from './webgl-support';

describe('detectWebGLSupport', () => {
  it('fails gracefully when there is no DOM (unit-test environment)', () => {
    const result = detectWebGLSupport();
    expect(result.supported).toBe(false);
    expect(result.reason).toContain('DOM');
  });
});
