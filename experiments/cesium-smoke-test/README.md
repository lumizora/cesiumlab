# Cesium Smoke Test

**类型：工程 Smoke Test，不是视觉实验。**  
**状态：可运行（runnable），成熟度 Prototype。不会标记为 Visual Approved。**

## 目的

用真实 CesiumJS 渲染验证 Stage 1 的工程链路：

- Vue 3 + Vite + TypeScript 页面可启动、可构建、可预览；
- CesiumJS `Viewer` 在真实浏览器中创建 WebGL 上下文并持续渲染；
- `CESIUM_BASE_URL`、Workers、Assets、Widgets、ThirdParty 在根路径与非根路径部署下都可访问；
- Entity API 与异步 Primitive API 均可工作；
- 场景卸载/重新加载时 Viewer 被销毁，画布与场景元素被清理；
- WebGL 不可用或运行时失败时，页面有明确提示而不是空白画面。

## 场景内容

- **可选 Cesium ion**：配置 `VITE_CESIUM_ION_TOKEN` 时使用 Cesium World Imagery（AERIAL_WITH_LABELS）与 Cesium World Terrain；
- **无 token / ion 失败回退**：使用 `GridImageryProvider` 生成本地经纬网格地球与椭球地形；
- 北京位置：半透明椭球 + 点 + 标签；
- 上海位置：立方体 + 点 + 标签；
- 两点之间的 `PolylineGlowMaterialProperty` 发光连线；
- 一个 `asynchronous: true` 的 `PolygonGeometry` + `Primitive`，用于触发 Cesium 几何 Worker；
- 固定太阳时（2026-11-08T04:00:00Z）使光照可重复；
- 相机可拖动旋转、滚轮缩放、右键倾斜。

## Cesium ion 配置

在仓库根目录创建 `.env.local`（已被 `.gitignore` 忽略）：

```dotenv
VITE_CESIUM_ION_TOKEN=<public client token>
```

- Vite 的 `envDir` 指向仓库根目录；
- `src/cesium/base-url.ts` 在启动时读取 token 并写入 `window.CESIUM_ION_TOKEN`；
- `experiments/cesium.ts` 的动态 Cesium 加载器在 `import('cesium')` 后设置 `Ion.defaultAccessToken`；
- 前端 token 会出现在客户端 bundle 中，**不是秘密**；必须在 Cesium ion 后台限制可访问资产与来源；
- 场景通过 `data-imagery-source`、`data-terrain-source`、`data-ion-status` 暴露实际加载结果，供浏览器测试记录。

## 技术选择与理由

| 选择                          | 理由                                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 实验自建 Viewer               | 保留实验技术自由度；由实验自身负责销毁，符合 Contract v0.1                                                        |
| 动态 `import('cesium')`       | 保证 `window.CESIUM_BASE_URL` 在 Cesium 求值前设置，避免静态 import 提升导致资源 404                              |
| 脚本复制静态资源              | 不引入额外 Vite 插件；`Workers/ThirdParty/Assets/Widgets` 从锁定版本 `node_modules/cesium` 复制到 `public/cesium` |
| Entity + Primitive 混用       | 同时验证高层 Entity 与更底层的异步 Primitive/Worker 路径                                                          |
| `preserveDrawingBuffer: true` | 允许自动化检查读取真实 WebGL 像素，作为非空渲染证据                                                               |
| 可选 ion + 本地回退           | 配置 token 时验证真实影像/地形；无 token 或失败时仍保持可运行、可重复的中性场景                                   |

## 资源与清理

`mount(context)` 返回 cleanup。cleanup 会：

- 移除 `postRender`、`renderError` 与 `webglcontextlost` 监听；
- 调用 `viewer.destroy()`；
- 清空容器（包括 Cesium credit 容器与 canvas）。

`ViewerHost` 在路由离开、重新加载场景、`pagehide` 时调用 cleanup；`pageshow`（bfcache 恢复）时重新创建场景。

## 验证记录

已在本机完成真实浏览器检查（2026-11-08）：

- Microsoft Edge 157（Chromium，headless），NVIDIA GTX 1070 Ti / ANGLE D3D11，WebGL 2；
- `data-ion-status="ready"`，`data-imagery-source="cesium-world-imagery"`，`data-terrain-source="cesium-world-terrain"`；
- Cesium ion endpoint 与 World Terrain 瓦片请求均为 HTTP 200；
- 截图、报告与命令日志见 `docs/evidence/stage-1/`。

## 已知限制

- 这是工程验证场景，没有视觉参考，也没有视觉验收结论。
- 配置 ion 后依赖外部 Cesium ion / 影像服务与网络；服务不可用时会回退，但影像/地形不再出现。
- 无 token 时地球外观为中性网格，不代表任何地图产品的真实影像效果。
- 单场景、手工登记；Stage 1 不建设自动发现、参数 Schema 或通用 Runtime。
- 自动化截图对浏览器/GPU 敏感；本仓库只把当前环境的结果作为证据，不宣称跨设备像素一致。
