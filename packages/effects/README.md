# @cesiumlab/effects

基于 CesiumJS 的轻量、框架无关三维视觉特效库。所有特效均采用 **纯 GPU 自定义 GLSL 着色器 + `Primitive`** 构建（0 每帧 CPU 顶点重建），使用独立的 `scene.preRender` 动画时钟，并支持实时 `update()`、暂停/恢复与幂等 `destroy()` 清理。

## 包含特效

- **`createCometArc`**：单 `Primitive` GPU 着色器驱动的三维测地线彗星飞线，融合双层底弧、横向收尖渐隐拖尾、无缝炽白光头、同轨多光流（`cometCount`）与 `onArrive` 抵达回调。
- **`createPulseRing`**：单张 ENU 切平面 `Primitive` + 自定义 GLSL 雷达波纹着色器，具备锐利前沿与向内渐隐尾迹，支持循环（`mode: 'loop'`）与事件触发强脉冲（`mode: 'trigger'` + `trigger()`）。
- **`createEnergyBeam`**：双层无封口锥形圆柱网格 + 自定义 GLSL 菲涅尔（Fresnel）体积着色器构建的连续三维全息光束，带上升能量波纹、顶部指数消散与镂空双环底座。
- **`createEnergyWall`**：单 `Primitive` 立体流光电子围栏，支持任意多边形或折线路径（自动闭合 / 开放），带上升能量扫描波与底部高光边界。
- **`createRadarScan`**：单张 ENU 切平面极坐标雷达扫描扇面，融合锐利前锋光束、指数衰减余晖、同心测距环与十字准星刻度。
- **`createHoloDome`**：三维无底半球能量护盾，基于自定义 GLSL 菲涅尔边缘辉光、程序化六边形蜂巢网格与纬向能量扫描光带。
- **`createGroundFlowPath`**：基于 `GroundPolylinePrimitive` 与自定义 GLSL 的贴地流光路径，自动贴合起伏地形与 3D Tiles 表面，融合双层发光底路、错位脉冲与收尖渐隐拖尾。
- **`createHoloBeacon`**：三维全息悬浮八面体信标，融合晶面棱边高光与菲涅尔轮廓、平滑自转与上下呼吸、垂直能量牵引光丝及地面双层旋转锁定环。
- **`createWaterSurface`**：零外部法线贴图的纯 GPU 程序化多频流动水面，融合菲涅尔天空反射、太阳高光波光闪烁与动态水位高度调节。

## 快速开始

```ts
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

- `viewer` 为调用方创建和持有的 Cesium `Viewer`（需要 CesiumJS `~1.147.0`）。
- 构建产物通过 `pnpm --filter @cesiumlab/effects build`（`vp pack`）生成，仅输出 ESM 与合并后的 TypeScript 类型声明。
