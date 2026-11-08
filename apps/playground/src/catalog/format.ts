import type { ExperimentKind, Maturity, ReferenceVisibility, RuntimeStatus } from './types';

export const MATURITY_LABELS: Record<Maturity, string> = {
  idea: 'Idea',
  prototype: 'Prototype',
  'visual-approved': 'Visual Approved',
  reusable: 'Reusable',
  verified: 'Verified',
  published: 'Published',
};

export const RUNTIME_LABELS: Record<RuntimeStatus, string> = {
  runnable: '可运行',
  unavailable: '暂不可用',
  'not-implemented': '未实现',
  error: '运行错误',
};

export const KIND_LABELS: Record<ExperimentKind, string> = {
  'smoke-test': 'Smoke Test',
  'visual-experiment': 'Visual Experiment',
};

export const REFERENCE_LABELS: Record<ReferenceVisibility, string> = {
  public: '可公开查看',
  private: '不公开',
  none: '无参考素材',
};

export function runtimeTone(status: RuntimeStatus): 'ok' | 'warn' | 'muted' | 'danger' {
  switch (status) {
    case 'runnable':
      return 'ok';
    case 'unavailable':
      return 'warn';
    case 'error':
      return 'danger';
    case 'not-implemented':
      return 'muted';
  }
}
