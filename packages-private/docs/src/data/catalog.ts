export interface ModuleCatalogItem {
  id: string;
  path: string;
  section: 'Visual Effects';
  titleEn: string;
  titleZh: string;
  tag: string;
  summaryEn: string;
  summaryZh: string;
}

export const MODULE_CATALOG: readonly ModuleCatalogItem[] = [
  {
    id: 'comet-arc',
    path: '/docs/comet-arc',
    section: 'Visual Effects',
    titleEn: 'Comet Arc',
    titleZh: '拖尾飞线',
    tag: '1 Primitive · GLSL',
    summaryEn:
      'GPU-driven 3D geodesic arc with a luminous base curve, tapered comet trail, and multi-comet streams.',
    summaryZh: '纯 GPU 测地线飞线，融合双层底弧、横向收尖彗星拖尾、无缝光头与同轨多光流。',
  },
  {
    id: 'pulse-ring',
    path: '/docs/pulse-ring',
    section: 'Visual Effects',
    titleEn: 'Pulse Ring',
    titleZh: '扩散波纹',
    tag: 'ENU Radar Shader',
    summaryEn:
      'Single-quad radar ripples with crisp leading wavefronts, inward wakes, loop and trigger burst modes.',
    summaryZh: '单张 ENU 切平面雷达波纹，具备锐利前沿与向内尾迹，支持循环与事件触发强脉冲。',
  },
  {
    id: 'energy-beam',
    path: '/docs/energy-beam',
    section: 'Visual Effects',
    titleEn: 'Energy Beam',
    titleZh: '全息光束',
    tag: 'Fresnel Volumetric',
    summaryEn:
      'Dual open-ended cylinder shells with Fresnel edge falloff, rising energy bands, and a hollow ground ring.',
    summaryZh: '双层无封口锥形圆柱与菲涅尔体积着色器，带上升能量波纹与镂空双环底座。',
  },
];

export const DEFAULT_MODULE_PATH = MODULE_CATALOG[0]?.path ?? '/docs/introduction';
