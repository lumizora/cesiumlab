import {
  EXPERIMENT_KIND_VALUES,
  MATURITY_VALUES,
  REFERENCE_VISIBILITY_VALUES,
  RUNTIME_STATUS_VALUES,
  type ExperimentKind,
  type ExperimentMetadata,
  type ExperimentNotes,
  type ExperimentVerification,
  type Maturity,
  type ReferenceVisibility,
  type RuntimeStatus,
} from './types';

export class ExperimentMetadataError extends Error {
  constructor(source: string, issue: string) {
    super(`Invalid experiment metadata in ${source}: ${issue}`);
    this.name = 'ExperimentMetadataError';
  }
}

function fail(source: string, issue: string): never {
  throw new ExperimentMetadataError(source, issue);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  source: string,
  path = key,
): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(source, `"${path}" must be a non-empty string`);
  }
  return value;
}

function requireEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  values: readonly T[],
  source: string,
): T {
  const value = record[key];
  if (typeof value !== 'string' || !values.includes(value as T)) {
    fail(source, `"${key}" must be one of: ${values.join(', ')}`);
  }
  return value as T;
}

function parseTags(value: unknown, source: string): string[] {
  if (!Array.isArray(value)) {
    fail(source, '"tags" must be an array of strings');
  }
  const tags = value.map((tag, index) => {
    if (typeof tag !== 'string' || tag.trim().length === 0) {
      fail(source, `"tags[${index}]" must be a non-empty string`);
    }
    return tag;
  });
  if (new Set(tags).size !== tags.length) {
    fail(source, '"tags" must not contain duplicates');
  }
  return tags;
}

function parseNotes(value: unknown, source: string): ExperimentNotes {
  if (!isRecord(value)) {
    fail(source, '"notes" must be an object');
  }
  return {
    overview: requireString(value, 'overview', source, 'notes.overview'),
    technology: requireString(value, 'technology', source, 'notes.technology'),
    limitations: requireString(value, 'limitations', source, 'notes.limitations'),
  };
}

function parseVerification(value: unknown, source: string): ExperimentVerification {
  if (!isRecord(value)) {
    fail(source, '"verification" must be an object when present');
  }
  const checkedAt = requireString(value, 'checkedAt', source, 'verification.checkedAt');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkedAt)) {
    fail(source, '"verification.checkedAt" must use YYYY-MM-DD');
  }
  return {
    checkedAt,
    environment: requireString(value, 'environment', source, 'verification.environment'),
    evidence: requireString(value, 'evidence', source, 'verification.evidence'),
  };
}

/**
 * Validates untrusted JSON (or a test fixture) and returns a normalized
 * metadata object. A malformed registered experiment fails loudly at module
 * load/build time instead of rendering a half-valid archive entry.
 */
export function parseExperimentMetadata(value: unknown, source: string): ExperimentMetadata {
  if (!isRecord(value)) {
    fail(source, 'metadata must be a JSON object');
  }

  if (value.schemaVersion !== 1) {
    fail(source, '"schemaVersion" must be 1');
  }

  const id = requireString(value, 'id', source);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    fail(source, '"id" must use lowercase kebab-case');
  }

  const kind: ExperimentKind = requireEnum(value, 'kind', EXPERIMENT_KIND_VALUES, source);
  const maturity: Maturity = requireEnum(value, 'maturity', MATURITY_VALUES, source);
  const runtimeStatus: RuntimeStatus = requireEnum(
    value,
    'runtimeStatus',
    RUNTIME_STATUS_VALUES,
    source,
  );
  const referenceVisibility: ReferenceVisibility = requireEnum(
    value,
    'referenceVisibility',
    REFERENCE_VISIBILITY_VALUES,
    source,
  );

  const runtimeEntry = value.entry;
  if (runtimeStatus === 'runnable') {
    if (typeof runtimeEntry !== 'string' || !runtimeEntry.startsWith('./')) {
      fail(source, '"entry" is required for a runnable experiment and must start with "./"');
    }
  } else if (runtimeEntry !== undefined) {
    fail(source, '"entry" must be omitted when the experiment is not runnable');
  }

  const cover = value.cover;
  if (cover !== undefined && (typeof cover !== 'string' || !cover.startsWith('./'))) {
    fail(source, '"cover" must start with "./" when present');
  }

  const metadata: ExperimentMetadata = {
    schemaVersion: 1,
    id,
    title: requireString(value, 'title', source),
    summary: requireString(value, 'summary', source),
    kind,
    maturity,
    runtimeStatus,
    referenceVisibility,
    tags: parseTags(value.tags, source),
    notes: parseNotes(value.notes, source),
  };

  if (typeof runtimeEntry === 'string') {
    metadata.entry = runtimeEntry;
  }
  if (typeof cover === 'string') {
    metadata.cover = cover;
  }
  if (value.verification !== undefined) {
    metadata.verification = parseVerification(value.verification, source);
  }

  return metadata;
}
