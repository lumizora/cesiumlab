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
  {
    id: 'energy-wall',
    path: '/docs/energy-wall',
    section: 'Visual Effects',
    titleEn: 'Energy Wall',
    titleZh: '流光电子围栏',
    tag: 'Polygon Fence · GLSL',
    summaryEn:
      'Luminous vertical energy fence along any polygon or polyline with rising energy waves and grounded base glow.',
    summaryZh: '沿任意多边形或折线路径伸展的立体流光围栏，带上升能量扫描波与底部高光边界。',
  },
  {
    id: 'radar-scan',
    path: '/docs/radar-scan',
    section: 'Visual Effects',
    titleEn: 'Radar Scan',
    titleZh: '雷达扫描扇面',
    tag: 'Polar Sweep · GLSL',
    summaryEn:
      'Rotating ENU radar sweep with a sharp leading beam, exponential afterglow sector, and concentric range rings.',
    summaryZh: 'ENU 切平面旋转雷达扫描扇面，具备锐利前锋光束、指数余晖与同心测距刻度环。',
  },
  {
    id: 'holo-dome',
    path: '/docs/holo-dome',
    section: 'Visual Effects',
    titleEn: 'Holo Dome',
    titleZh: '全息能量穹顶',
    tag: '3D Hex Shield · GLSL',
    summaryEn:
      '3D hemisphere energy shield with Fresnel rim glow, procedural hexagonal honeycomb mesh, and latitude scan band.',
    summaryZh: '三维半球能量护盾，融合菲涅尔轮廓辉光、程序化六边形蜂巢网格与纬向扫描光带。',
  },
  {
    id: 'ground-flow-path',
    path: '/docs/ground-flow-path',
    section: 'Visual Effects',
    titleEn: 'Ground Flow Path',
    titleZh: '贴地流光路径',
    tag: 'Terrain Clamped · GLSL',
    summaryEn:
      'Terrain- and 3D-Tiles-clamped flowing energy path with a glowing base track and tapered pulse streams.',
    summaryZh: '自动贴合地形与 3D Tiles 的流光路径，具备发光底路、错位脉冲与收尖渐隐拖尾。',
  },
  {
    id: 'holo-beacon',
    path: '/docs/holo-beacon',
    section: 'Visual Effects',
    titleEn: 'Holo Beacon',
    titleZh: '全息悬浮信标',
    tag: '3D Crystal · GLSL',
    summaryEn:
      'Floating self-rotating octahedron crystal with edge glow, vertical energy tether, and rotating ground lock ring.',
    summaryZh: '三维悬浮自转八面体晶核，带棱边高光、垂直牵引光丝与地面双层旋转锁定环。',
  },
  {
    id: 'water-surface',
    path: '/docs/water-surface',
    section: 'Visual Effects',
    titleEn: 'Water Surface',
    titleZh: '程序化流动水面',
    tag: 'Wave Normals · GLSL',
    summaryEn:
      'Procedural multi-octave flowing water surface with Fresnel sky reflections, solar glint, and dynamic water levels.',
    summaryZh: '纯 GPU 程序化多频流动水面，融合菲涅尔天空反射、太阳波光闪烁与动态水位调节。',
  },
  {
    id: 'weather-overlay',
    path: '/docs/weather-overlay',
    section: 'Visual Effects',
    titleEn: 'Weather Overlay',
    titleZh: '屏幕空间气象特效',
    tag: 'PostProcess · GLSL',
    summaryEn:
      'Pure-GPU screen-space rain, swaying snow, and depth-buffer atmospheric fog driven by a single PostProcessStage.',
    summaryZh: '单 PostProcessStage 驱动的多层视差雨丝、风摆飘雪与真实深度缓冲大气距离雾。',
  },
];

export const DEFAULT_MODULE_PATH = MODULE_CATALOG[0]?.path ?? '/docs/introduction';
