# @cesiumlab/effects

基于 [`@cesiumlab/cesium`](../cesium/README.md)（定制增强版 CesiumJS）的轻量、框架无关三维视觉特效库。所有特效均采用 **纯 GPU 自定义 GLSL 着色器 + `Primitive`** 构建（0 每帧 CPU 顶点重建），使用独立的 `scene.preRender` 动画时钟，并支持实时 `update()`、暂停/恢复与幂等 `destroy()` 清理。

## 包含特效

- **`createCometArc`**：单 `Primitive` GPU 着色器驱动的三维测地线彗星飞线，融合双层底弧、横向收尖渐隐拖尾、无缝炽白光头、同轨多光流（`cometCount`）与 `onArrive` 抵达回调。
- **`createPulseRing`**：单张 ENU 切平面 `Primitive` + 自定义 GLSL 雷达波纹着色器，具备锐利前沿与向内渐隐尾迹，支持循环（`mode: 'loop'`）与事件触发强脉冲（`mode: 'trigger'` + `trigger()`）。
- **`createEnergyBeam`**：双层无封口锥形圆柱网格 + 自定义 GLSL 菲涅尔（Fresnel）体积着色器构建的连续三维全息光束，带上升能量波纹、顶部指数消散与镂空双环底座。
- **`createEnergyWall`**：单 `Primitive` 立体流光电子围栏，支持任意多边形或折线路径（自动闭合 / 开放），带上升能量扫描波、底部高光边界及基于 `czm_globeDepthTexture` 的地形/建筑贴合交线（`clampToGround`）。
- **`createRadarScan`**：单张 ENU 切平面极坐标雷达扫描扇面，融合锐利前锋光束、指数衰减余晖、同心测距环与十字准星刻度。
- **`createHoloDome`**：三维无底半球能量护盾，基于自定义 GLSL 菲涅尔边缘辉光、程序化六边形蜂巢网格与纬向能量扫描光带。
- **`createFlowPath`**：支持单路径、多路径与独立样式项（`FlowPathItem[]`）自动合批（1 Draw Call）的 GPU 流光路径，支持每段路径独立颜色/相位及运行时 `setPathStyle(id, style)` 局部更新，可在贴合地形 / 3D Tiles（`GroundPolylinePrimitive`）与非贴地（`Primitive`）模式间无缝切换。
- **`createHoloBeacon`**：三维全息悬浮八面体信标，融合晶面棱边高光与菲涅尔轮廓、平滑自转与上下呼吸、垂直能量牵引光丝及地面双层旋转锁定环。
- **`createWaterSurface`**：零外部法线贴图的纯 GPU 程序化多频流动水面，融合菲涅尔天空反射、太阳高光波光闪烁与动态水位高度调节。
- **`createWeatherOverlay`**：单 `PostProcessStage` 驱动的纯 GPU 屏幕空间气象引擎，支持多层视差雨丝、柔和风摆飘雪与真实深度缓冲大气距离雾。
- **`createHeatmap`**：基于高斯核密度估计（KDE）与 GPU 实时色带映射的三维地理热力图，支持 O(1) 实时色带/强度/等值线更新及 `GroundPrimitive` 贴地无缝切换。
- **`createWindField`**：基于离屏 WebGL2 拖尾累积 FBO 的万级粒子风场与洋流场引擎，支持自定义 U/V 矢量场与台风/黑潮内置预设，以及 `GroundPrimitive` 贴地/高空等压面无缝切换。
- **`createPulseScatter`**：单 Draw Call 硬件实例化 GPU 海量脉冲散点与呼吸点阵，支持 3 万+ 独立颜色/半径/交错相位的脉冲、呼吸与双波纹涟漪点阵，并通过 `GroundInstancedDecalPrimitive` 实现 60fps 实时贴合地形与 3D Tiles（`clampToGround`）。
- **`createTerrainAnalysis`**：基于 CesiumJS 原生 `globe.material` 的纯 GPU 地形分析着色器，支持抗锯齿主/次等高线、高程分层设色、工程坡度分级与 360° 坡向分析实时切换。
- **`createWorldScan`**：基于 `PostProcessStage` 深度缓冲世界坐标反算的全地形/全建筑立体扫描波，0 几何体像素级扫过山脊与 3D Tiles 建筑立面，支持环形扩散与线性推进双模式、抗锯齿全息网格及 `trigger()` 触发。
- **`createHexPrism`**：单 Draw Call 合批 3D 蜂窝六棱柱与方柱统计矩阵，支持原始点自动空间蜂窝聚合、4 套 5 段 GPU 色带、O(1) 实时高度倍率缩放及平滑生长入场动画。
- **`createBuildingStyle`**：基于 Cesium 原生 `CustomShader` 的零贴图城市建筑赛博流光着色器，支持任意 `Cesium3DTileset` / `Model`，提供 4 套风格预设、高度渐变、全息扫描光环与程序化夜间窗格矩阵，销毁时无损还原原有着色器。
- **`createViewshed`**：基于观察点虚拟相机 + 离屏 `ShadowMap` 深度贴图与 `PostProcessStage` 投射着色器的纯 GPU 三维通视分析，实时区分地形与 3D 建筑可见区（绿）/盲区（红），支持 3D 视锥线框与自动巡航扫描。

## 安装

```sh
pnpm add @cesiumlab/effects @cesiumlab/cesium
```

## 快速开始

```ts
import { Viewer } from '@cesiumlab/cesium';
import { createCometArc, createEnergyBeam, createPulseRing } from '@cesiumlab/effects';

const arc = createCometArc(viewer, {
  from: [104.07, 30.57],
  to: [121.47, 31.23],
  color: '#ffa31a',
  cometCount: 2,
});

const pulse = createPulseRing(viewer, {
  position: [121.47, 31.23],
  mode: 'loop',
  color: '#00a8ff',
});

const beam = createEnergyBeam(viewer, {
  position: [104.07, 30.57],
  color: '#00a8ff',
});

// 离开场景时释放资源
arc.destroy();
pulse.destroy();
beam.destroy();
```

- `viewer` 为调用方创建和持有的 `@cesiumlab/cesium` `Viewer` 实例（peer 依赖 `@cesiumlab/cesium` `~1.147.0`）。
- 构建产物通过 `pnpm --filter @cesiumlab/effects build`（`vp pack`）生成，仅输出 ESM 与合并后的 TypeScript 类型声明。
