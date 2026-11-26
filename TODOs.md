# TODOs

## `@cesiumlab/effects`

### FlowPath (`createFlowPath`) 支持单线段自定义路径色（`color`）与光头高光色（`headColor`）

- **目标**：
  - 将流光着色器中当前写死的光头高光混合色 `vec3(1.0)` 抽离为可配置参数 `headColor`（默认 `#ffffff`）。
  - 支持多路径合批渲染时，每条线段可独立指定路径主色 `color`、光头高光色 `headColor`（以及可选的独立 `phase` / `speed`），适用于交通路况、分类公交/地铁线路、管网分级等场景。

- **技术方案调研结论（基于 CesiumJS 1.147 源码核实）**：
  1. **非贴地模式（`clampToGround: false`，`Primitive + PolylineMaterialAppearance`）—— GPU 原生真·单 Draw Call**：
     - 通过 `GeometryInstance.attributes` 挂载 `pathColor` / `headColor`（`ColorGeometryInstanceAttribute`），由 Cesium `BatchTable` 纹理按实例存储（每条线仅占 2 个纹素）。
     - 自定义 `PolylineMaterialAppearance` 的 `vertexShaderSource` / `fragmentShaderSource`，在顶点阶段读取 `czm_batchTable_pathColor(batchId)` 与 `czm_batchTable_headColor(batchId)` 经 `varying` 透传至片元着色器。
     - 优势：无论 10,000 条线有多少种连续渐变色，永远保持 **1 个 Draw Call**，且支持通过 `primitive.getGeometryInstanceAttributes(id)` 实现 **O(1) 运行时单线实时改色**（零几何重建）。
  2. **贴地模式（`clampToGround: true`，`GroundPolylinePrimitive`）—— 引擎硬限制**：
     - Cesium 1.147 的 `GroundPolylinePrimitive` 会忽略 `appearance.vertexShaderSource` / `fragmentShaderSource`，硬编码使用 `PolylineShadowVolumeVS/FS`，且将 `materialShaderSource` 拼接在 `PolylineShadowVolumeFS` 声明 `v_endPlaneNormalEcAndBatchId` 之前，`czm_materialInput` 中也不包含 `batchId` 或自定义 attribute。
     - 因此在零 Cesium 私有 API 约束下，`GroundPolylinePrimitive` 无法在单 Draw Call 内让自定义 `Material` 读取每条线独立的 `BatchTable` 颜色。

- **已落地实现（基于自研定制 `@cesiumlab/cesium`）**：
  - [x] 已在 `@cesiumlab/cesium` 引擎层为 `czm_materialInput` 增加 `batchId` 通道并在 `GroundPolylinePrimitive` / `Primitive` 中前置注入 `BatchTable` 函数；`createFlowPath` 现已支持 `FlowPathItem[]`（单线独立 `color` / `headColor` / `trailColor` / `phase`）与 `setPathStyle(id, style)` O(1) 动态改色，贴地与非贴地模式均为 1 Draw Call。

### PulseScatter (`createPulseScatter`) 海量散点贴合地形支持

- **已落地实现（基于自研定制 `@cesiumlab/cesium`）**：
  - [x] 已在 `@cesiumlab/cesium` 引擎层新增 `GroundInstancedDecalPrimitive`（单次 `gl.drawElementsInstanced` 硬件实例化屏幕空间延迟贴花，直接读取 `czm_globeDepthTexture`），`createPulseScatter` 现已默认开启 `clampToGround: true`，支持 3 万+ 散点 60fps 像素级贴合地形与 3D Tiles、零 Stencil 重叠穿帮、任意缩放矢量锐利。
