import { catalog } from '../catalog/registry';
import type { ExperimentModule } from '../../../../experiments/contract';

export class ExperimentRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExperimentRuntimeError';
  }
}

export function assertExperimentModule(value: unknown, id: string): ExperimentModule {
  if (typeof value !== 'object' || value === null) {
    throw new ExperimentRuntimeError(`实验 "${id}" 的运行入口没有导出模块对象。`);
  }
  const mount = (value as { mount?: unknown }).mount;
  if (typeof mount !== 'function') {
    throw new ExperimentRuntimeError(`实验 "${id}" 的运行入口没有导出 mount 函数。`);
  }
  return value as ExperimentModule;
}

/**
 * Resolves only loaders explicitly registered in the manual catalog. An
 * unregistered experiment can never be executed through the Gallery.
 */
export async function loadExperimentModule(id: string): Promise<ExperimentModule> {
  const entry = catalog.find((candidate) => candidate.metadata.id === id);
  if (!entry) {
    throw new ExperimentRuntimeError(`找不到实验 "${id}"。`);
  }
  if (!entry.load) {
    throw new ExperimentRuntimeError(`实验 "${id}" 没有已注册的运行入口。`);
  }
  const module = await entry.load();
  return assertExperimentModule(module, id);
}
