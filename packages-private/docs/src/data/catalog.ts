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
    id: 'flow-path',
    path: '/docs/flow-path',
    section: 'Visual Effects',
    titleEn: 'Flow Path',
    titleZh: '流光路径',
    tag: 'Batched · GLSL',
    summaryEn:
      'Batched GPU flowing energy paths supporting seamless switching between terrain-clamped GroundPolylinePrimitive and lightweight Primitive.',
    summaryZh:
      '支持多路径自动合批的 GPU 流光路径，可在贴合地形/3D Tiles 与高性能非贴地模式间无缝切换。',
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
  {
    id: 'heatmap',
    path: '/docs/heatmap',
    section: 'Visual Effects',
    titleEn: 'Heatmap',
    titleZh: '热力图',
    tag: 'KDE · GroundPrimitive',
    summaryEn:
      'GPU-shaded Gaussian kernel-density heatmap with live palette, isoline contours, and seamless terrain clamping.',
    summaryZh:
      '高斯核密度 GPU 热力图，支持 O(1) 实时色带与等值线切换，以及贴合地形/悬浮平面无缝切换。',
  },
  {
    id: 'wind-field',
    path: '/docs/wind-field',
    section: 'Visual Effects',
    titleEn: 'Wind Field',
    titleZh: 'GPU 粒子风场 / 洋流场',
    tag: 'WebGL2 · Streamlines',
    summaryEn:
      'GPU-accelerated particle streamline wind & ocean current visualization with speed-mapped color ramps and terrain clamping.',
    summaryZh:
      'WebGL2 拖尾累积粒子风场与洋流场，支持万级流线按风速 5 段色带着色及贴合地表/高空切换。',
  },
  {
    id: 'pulse-scatter',
    path: '/docs/pulse-scatter',
    section: 'Visual Effects',
    titleEn: 'Pulse Scatter',
    titleZh: '海量脉冲散点 / 呼吸点阵',
    tag: '1 Draw Call · 30K+',
    summaryEn:
      'Single-Draw-Call batched GPU pulsing, breathing, and multi-ripple scatter layer supporting 30,000+ points with per-point color and phase.',
    summaryZh:
      '单 Draw Call 合批 GPU 散点图层，支持 3 万+ 独立颜色与交错相位的脉冲、呼吸与双波纹点阵。',
  },
  {
    id: 'terrain-analysis',
    path: '/docs/terrain-analysis',
    section: 'Visual Effects',
    titleEn: 'Terrain Analysis',
    titleZh: '地形等高线与坡度分析',
    tag: 'Globe Material · GLSL',
    summaryEn:
      'Pure-GPU globe.material terrain analysis shader with anti-aliased major/minor contours, elevation bands, slope hazard, and 360° aspect.',
    summaryZh:
      '基于 Cesium 原生 globe.material 的地形分析着色器，支持抗锯齿主次等高线、高程设色、坡度与坡向实时切换。',
  },
  {
    id: 'world-scan',
    path: '/docs/world-scan',
    section: 'Visual Effects',
    titleEn: 'World Scan',
    titleZh: '全地形立体扫描波',
    tag: 'PostProcess · 3D Depth',
    summaryEn:
      'Depth-reconstructed 3D holographic scan wave sweeping across real mountain ridges and 3D Tiles building facades in radial or linear modes.',
    summaryZh:
      '基于深度缓冲反算三维坐标的全息扫描波，0 几何体像素级扫过山体地形与 3D 建筑立面，支持环形与线性双模式。',
  },
  {
    id: 'hex-prism',
    path: '/docs/hex-prism',
    section: 'Visual Effects',
    titleEn: '3D Hex Prism',
    titleZh: '3D 蜂窝柱阵',
    tag: '1 Draw Call · 3D Grid',
    summaryEn:
      'Single-Draw-Call 3D hexagonal honeycomb & square column matrix with automatic spatial binning, 5-stop GPU color ramps, and rising growth animation.',
    summaryZh:
      '单 Draw Call 合批三维六棱柱与方柱统计矩阵，支持原始点自动蜂窝聚合、5 段 GPU 色带与 O(1) 实时高度拉伸。',
  },
  {
    id: 'building-style',
    path: '/docs/building-style',
    section: 'Visual Effects',
    titleEn: '3D Building Style',
    titleZh: '3D 建筑赛博流光',
    tag: 'CustomShader · 3D Tiles',
    summaryEn:
      'Zero-texture CustomShader for 3D Tilesets & Models with height gradients, rising holographic scan halos, procedural night windows, and roof rim glow.',
    summaryZh:
      '基于 Cesium CustomShader 的零贴图城市建筑着色器，支持高度渐变、全息扫描光环、程序化夜间窗格与屋顶高光。',
  },
  {
    id: 'viewshed',
    path: '/docs/viewshed',
    section: 'Visual Effects',
    titleEn: '3D Viewshed',
    titleZh: '三维通视分析',
    tag: 'ShadowMap · LOS',
    summaryEn:
      'Real-time GPU 3D viewshed & line-of-sight analysis projecting visible (green) and occluded (red) zones onto terrain and 3D buildings with 3D frustum wireframe.',
    summaryZh:
      '基于离屏 ShadowMap 与深度投射的纯 GPU 三维通视分析，实时区分地形与建筑可见区/盲区，支持 3D 视锥与自动巡航扫描。',
  },
];

export const DEFAULT_MODULE_PATH = MODULE_CATALOG[0]?.path ?? '/docs/introduction';
