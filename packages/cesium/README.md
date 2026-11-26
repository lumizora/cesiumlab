# @cesiumlab/cesium

基于 [CesiumJS](https://cesium.com/platform/cesiumjs/) `1.147.0`（Apache-2.0）精简并针对 `@cesiumlab/*` 视觉特效与数字孪生场景进行底层增强的引擎发行版。

## 模块导出

所有核心子模块均通过同一包名下的子路径导出（无需额外安装 `@cesium/*` 子包）：

| 导入路径                                             | 说明                                        |
| ---------------------------------------------------- | ------------------------------------------- |
| `@cesiumlab/cesium`                                  | 完整入口（含 `Viewer`、渲染引擎与全部 API） |
| `@cesiumlab/cesium/core`                             | 数学、椭球、几何与基础工具                  |
| `@cesiumlab/cesium/gltf`                             | glTF / 3D 模型管线                          |
| `@cesiumlab/cesium/engine`                           | 场景、图元、着色器与数据源引擎              |
| `@cesiumlab/cesium/widgets`                          | `Viewer`、`CesiumWidget` 及 UI 控件         |
| `@cesiumlab/cesium/Build/Cesium/Widgets/widgets.css` | 控件默认样式                                |

```ts
import { Viewer } from '@cesiumlab/cesium';
import '@cesiumlab/cesium/Build/Cesium/Widgets/widgets.css';

const viewer = new Viewer('cesium-container');
```

## 相对上游 CesiumJS 的引擎级增强

1. **海量贴地实例化贴花图元（`GroundInstancedDecalPrimitive`）**：
   - 基于 WebGL2 硬件实例化（`instanceCount`）+ 屏幕空间延迟贴花（采样 `czm_globeDepthTexture`），在单次 Draw Call 内实现 3 万+ 点位的 60fps 实时贴合地形与 3D Tiles。
   - 驱动 `@cesiumlab/effects` 中的 `createPulseScatter({ clampToGround: true })`。
2. **每实例着色器属性直通（`czm_materialInput.batchId`）**：
   - 在 `GroundPolylinePrimitive` 与 `Primitive` 的 `PolylineMaterialAppearance` 渲染管线中注入 `materialInput.batchId`，并将 `BatchTable` 采样函数前置到 `czm_getMaterial` 之前。
   - 支持单 Draw Call 合批流光路径中每条路径独立颜色、相位与运行时 `setPathStyle(id, style)` O(1) 局部更新（`createFlowPath`）。
3. **地形法线与着色器稳定性修复**：
   - 修复 `Globe.js` 中对未定义 `_terrainProvider` 的访问保护，以及 `GlobeVS.glsl` 中投影向量归一化边界导致的 `NaN` 防护。

## 构建

修改 `packages/cesium/packages/*/Source` 源码后，运行以下命令重新生成 `Build/` 产物与 `Source/Cesium.d.ts`：

```sh
pnpm --filter @cesiumlab/cesium build
```

## 开源协议

遵循上游 CesiumJS 的 [Apache 2.0](./LICENSE.md) 协议。
