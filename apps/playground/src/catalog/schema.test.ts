import { describe, expect, it } from 'vitest';

import { ExperimentMetadataError, parseExperimentMetadata } from './schema';

function createMetadata(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: 'example-experiment',
    title: 'Example Experiment',
    summary: 'A fixture used by unit tests.',
    kind: 'smoke-test',
    maturity: 'prototype',
    runtimeStatus: 'runnable',
    entry: './main.ts',
    referenceVisibility: 'none',
    tags: ['fixture', 'test'],
    notes: {
      overview: 'Overview.',
      technology: 'Technology.',
      limitations: 'Limitations.',
    },
    ...overrides,
  };
}

describe('parseExperimentMetadata', () => {
  it('accepts a valid runnable experiment', () => {
    const metadata = parseExperimentMetadata(createMetadata(), 'fixture.json');

    expect(metadata.id).toBe('example-experiment');
    expect(metadata.runtimeStatus).toBe('runnable');
    expect(metadata.entry).toBe('./main.ts');
    expect(metadata.verification).toBeUndefined();
  });

  it('accepts an archived experiment without an entry', () => {
    const metadata = parseExperimentMetadata(
      createMetadata({ runtimeStatus: 'not-implemented', entry: undefined }),
      'fixture.json',
    );

    expect(metadata.runtimeStatus).toBe('not-implemented');
    expect(metadata.entry).toBeUndefined();
  });

  it('keeps verification records when present', () => {
    const metadata = parseExperimentMetadata(
      createMetadata({
        verification: {
          checkedAt: '2026-11-08',
          environment: 'Test environment',
          evidence: 'docs/evidence/stage-1/',
        },
      }),
      'fixture.json',
    );

    expect(metadata.verification?.checkedAt).toBe('2026-11-08');
  });

  it('rejects a runnable experiment without an entry', () => {
    expect(() =>
      parseExperimentMetadata(createMetadata({ entry: undefined }), 'fixture.json'),
    ).toThrow(ExperimentMetadataError);
  });

  it('rejects an entry on a non-runnable experiment', () => {
    expect(() =>
      parseExperimentMetadata(
        createMetadata({ runtimeStatus: 'not-implemented', entry: './main.ts' }),
        'fixture.json',
      ),
    ).toThrow(/must be omitted/);
  });

  it('rejects invalid ids, enums, tags and dates', () => {
    expect(() => parseExperimentMetadata(createMetadata({ id: 'Bad ID' }), 'fixture.json')).toThrow(
      /kebab-case/,
    );
    expect(() =>
      parseExperimentMetadata(createMetadata({ maturity: 'approved' }), 'fixture.json'),
    ).toThrow(/maturity/);
    expect(() =>
      parseExperimentMetadata(createMetadata({ tags: ['dup', 'dup'] }), 'fixture.json'),
    ).toThrow(/duplicates/);
    expect(() =>
      parseExperimentMetadata(
        createMetadata({
          verification: {
            checkedAt: '08-11-2026',
            environment: 'Test',
            evidence: 'none',
          },
        }),
        'fixture.json',
      ),
    ).toThrow(/YYYY-MM-DD/);
  });

  it('includes the source path in errors', () => {
    expect(() =>
      parseExperimentMetadata(createMetadata({ summary: '' }), 'experiments/bad/metadata.json'),
    ).toThrow(/experiments\/bad\/metadata\.json/);
  });
});
