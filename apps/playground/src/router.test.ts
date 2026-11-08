import { describe, expect, it } from 'vitest';

import { experimentHref, parseRoute } from './router';

describe('parseRoute', () => {
  it('treats empty hashes and the root as the gallery', () => {
    expect(parseRoute('')).toEqual({ name: 'gallery' });
    expect(parseRoute('#')).toEqual({ name: 'gallery' });
    expect(parseRoute('#/')).toEqual({ name: 'gallery' });
  });

  it('parses experiment detail routes', () => {
    expect(parseRoute('#/experiments/smoke-test')).toEqual({
      name: 'experiment',
      id: 'smoke-test',
    });
    expect(parseRoute('#/experiments/smoke-test/')).toEqual({
      name: 'experiment',
      id: 'smoke-test',
    });
    expect(parseRoute('#/experiments/smoke-test?tab=notes')).toEqual({
      name: 'experiment',
      id: 'smoke-test',
    });
  });

  it('decodes URL-encoded ids and rejects malformed encodings', () => {
    expect(parseRoute('#/experiments/foo%20bar')).toEqual({
      name: 'experiment',
      id: 'foo bar',
    });
    expect(parseRoute('#/experiments/%E0%A4%A')).toEqual({
      name: 'not-found',
      path: '/experiments/%E0%A4%A',
    });
  });

  it('returns not-found for unknown paths', () => {
    expect(parseRoute('#/nope')).toEqual({ name: 'not-found', path: '/nope' });
    expect(parseRoute('#/experiments/a/b')).toEqual({
      name: 'not-found',
      path: '/experiments/a/b',
    });
  });

  it('encodes experiment links', () => {
    expect(experimentHref('foo bar')).toBe('#/experiments/foo%20bar');
  });
});
