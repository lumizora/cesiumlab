import earthNetworkMetadata from '../../../../experiments/earth-network-convergence/metadata.json';
import smokeTestMetadata from '../../../../experiments/cesium-smoke-test/metadata.json';
import awaitingReferenceMetadata from '../../../../experiments/awaiting-visual-reference/metadata.json';

import { parseExperimentMetadata } from './schema';
import type { CatalogEntry, ExperimentMetadata } from './types';
import type { ExperimentModule } from '../../../../experiments/contract';

/**
 * Manual catalog registration for Stage 1.
 *
 * Metadata and runtime entries are deliberately kept separate: archived
 * experiments appear in the Gallery without being imported into the production
 * bundle, and only explicitly registered entries can ever execute.
 */
const rawMetadata: ReadonlyArray<{ source: string; value: unknown }> = [
  {
    source: 'experiments/earth-network-convergence/metadata.json',
    value: earthNetworkMetadata,
  },
  { source: 'experiments/cesium-smoke-test/metadata.json', value: smokeTestMetadata },
  {
    source: 'experiments/awaiting-visual-reference/metadata.json',
    value: awaitingReferenceMetadata,
  },
];

const metadata: ExperimentMetadata[] = rawMetadata.map(({ source, value }) =>
  parseExperimentMetadata(value, source),
);

const runtimeLoaders: Readonly<Record<string, () => Promise<ExperimentModule>>> = {
  'earth-network-convergence': () =>
    import('../../../../experiments/earth-network-convergence/main'),
  'cesium-smoke-test': () => import('../../../../experiments/cesium-smoke-test/main'),
};

export const catalog: readonly CatalogEntry[] = metadata.map((entry) => {
  const load = runtimeLoaders[entry.id] ?? null;
  if (entry.runtimeStatus === 'runnable' && !load) {
    throw new Error(
      `Experiment "${entry.id}" is marked runnable but has no registered runtime loader.`,
    );
  }
  if (entry.runtimeStatus !== 'runnable' && load) {
    throw new Error(`Experiment "${entry.id}" has a runtime loader but is not marked runnable.`);
  }
  return { metadata: entry, load };
});

export function getExperiment(id: string): CatalogEntry | undefined {
  return catalog.find((entry) => entry.metadata.id === id);
}

export const catalogStats = {
  total: catalog.length,
  runnable: catalog.filter((entry) => entry.metadata.runtimeStatus === 'runnable').length,
};
