# @cesiumlab/effects

基于 CesiumJS 的小型视觉效果库。当前实现提供一条发光弧线和沿线循环的光点。

```ts
import { createFlowingArc } from '@cesiumlab/effects';

const arc = createFlowingArc(viewer, {
  from: [103.82, 1.35],
  to: [139.69, 35.68],
  height: 430_000,
  duration: 4,
});

// 离开场景时调用。
arc.destroy();
```

- `viewer` 为调用方创建和持有的 Cesium `Viewer`。需要 CesiumJS 1.147.x，已用 1.147.0 验证。
- `from`、`to` 是经度和纬度，单位为度。坐标必须不同，且不能接近对跖点。
- `height` 为相对于场景椭球的峰值高度，默认为 350,000 米。`duration` 为一次循环的 Cesium 时钟秒数，默认为 4。可用 Cesium `Color` 设置颜色。
- 动画跟随 `viewer.clock`。效果只创建一个 Entity，`destroy()` 可以重复调用，且仅移除该 Entity。
- 首个版本支持三维地球。飞线按椭球计算高度，经过高地形时可能被遮挡。

打包候选产物可通过 `pnpm build` 和 `pnpm pack` 生成。包提供 ESM 与 TypeScript 类型。
