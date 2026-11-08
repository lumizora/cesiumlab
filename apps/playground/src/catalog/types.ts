import type { ExperimentModule } from '../../../../experiments/contract';

export const MATURITY_VALUES = [
  'idea',
  'prototype',
  'visual-approved',
  'reusable',
  'verified',
  'published',
] as const;

export type Maturity = (typeof MATURITY_VALUES)[number];

export const RUNTIME_STATUS_VALUES = [
  'runnable',
  'unavailable',
  'not-implemented',
  'error',
] as const;

export type RuntimeStatus = (typeof RUNTIME_STATUS_VALUES)[number];

export const EXPERIMENT_KIND_VALUES = ['smoke-test', 'visual-experiment'] as const;
export type ExperimentKind = (typeof EXPERIMENT_KIND_VALUES)[number];

export const REFERENCE_VISIBILITY_VALUES = ['public', 'private', 'none'] as const;
export type ReferenceVisibility = (typeof REFERENCE_VISIBILITY_VALUES)[number];

export interface ExperimentNotes {
  overview: string;
  technology: string;
  limitations: string;
}

export interface ExperimentVerification {
  checkedAt: string;
  environment: string;
  evidence: string;
}

/**
 * Pure, build-time metadata. It must stay serializable and must never require
 * executing experiment code to be read.
 */
export interface ExperimentMetadata {
  schemaVersion: 1;
  id: string;
  title: string;
  summary: string;
  kind: ExperimentKind;
  maturity: Maturity;
  runtimeStatus: RuntimeStatus;
  /**
   * Present if and only if the experiment has a runnable entry. The string is
   * relative to the experiment directory and is manually registered in the
   * Playground runtime loader map.
   */
  entry?: string;
  cover?: string;
  referenceVisibility: ReferenceVisibility;
  tags: string[];
  notes: ExperimentNotes;
  verification?: ExperimentVerification;
}

export interface CatalogEntry {
  metadata: ExperimentMetadata;
  /** Null for archived metadata-only experiments. */
  load: (() => Promise<ExperimentModule>) | null;
}
