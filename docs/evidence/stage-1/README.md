# Stage 1 验证证据

本目录记录 Stage 0 / Stage 1 的实际运行、构建与浏览器检查。所有图片均为 **headless Microsoft Edge 157（Chromium）实际 WebGL 输出**的 Playwright 截图；不是 AI 生成图、概念图或手绘示意。

**结论范围：**这些证据证明工程链路与真实 CesiumJS 渲染可用，**不**代表任何视觉参考复现或视觉验收通过。Smoke Test 不是视觉实验。

## 环境

| 项目         | 值                                                 |
| ------------ | -------------------------------------------------- |
| OS           | Windows 10                                         |
| Node.js      | 24.14.1                                            |
| pnpm         | 12.8.1                                             |
| 浏览器       | Microsoft Edge 157.0.4341.42（Chromium，headless） |
| GPU / API    | NVIDIA GeForce GTX 1070 Ti · ANGLE / Direct3D 11   |
| WebGL        | WebGL 2.0（OpenGL ES 3.0 Chromium）                |
| 主视口       | 1440 × 900                                         |
| 非根路径视口 | 1280 × 800                                         |

更完整的 UA、请求与渲染统计见 `browser-report.json` 和 `base-path-report.json`。

## 执行命令与结果

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm test:e2e:base
pnpm test:e2e:dev
```

| 检查                     | 结果                        |
| ------------------------ | --------------------------- |
| Prettier                 | 通过                        |
| ESLint                   | 通过                        |
| TypeScript               | 通过                        |
| Vitest                   | 6 个文件、23 个测试通过     |
| 生产构建                 | 通过（`dist`、`dist-base`） |
| Playwright 根路径        | 3 个测试通过                |
| Playwright `/cesiumlab/` | 1 个测试通过                |
| Playwright Vite dev      | 1 个测试通过                |

命令原始输出保存在 `logs/`：

| 文件                      | 命令                             |
| ------------------------- | -------------------------------- |
| `logs/install-frozen.txt` | `pnpm install --frozen-lockfile` |
| `logs/format-check.txt`   | `pnpm format:check`              |
| `logs/lint.txt`           | `pnpm lint`                      |
| `logs/typecheck.txt`      | `pnpm typecheck`                 |
| `logs/unit-test.txt`      | `pnpm test`                      |
| `logs/build.txt`          | `pnpm build`                     |
| `logs/e2e.txt`            | `pnpm test:e2e`                  |
| `logs/e2e-base.txt`       | `pnpm test:e2e:base`             |
| `logs/e2e-dev.txt`        | `pnpm test:e2e:dev`              |
| `logs/revision.txt`       | 本次证据对应的实现提交           |

截图页眉 / 页脚中的 `rev 910425e` 对应实现提交；本目录证据在该提交之后归档。

## 关键结果

根路径 `pnpm test:e2e`：

- Cesium Worker 请求：`/cesium/Workers/createGeometry.js`、`createPolygonGeometry.js`、`createBoxGeometry.js`、`createEllipsoidGeometry.js`、`createPolylineGeometry.js` 等；
- Cesium Assets 请求：`approximateTerrainHeights.json`、`IAU2006_XYS_18.json`、SkyBox 贴图等；
- 全部请求 HTTP 200；
- console error：0；page error：0；失败请求：0；
- 画布：1002 × 574；
- 采样渲染统计：1695 个颜色簇，非暗像素比例约 47.7%（证明不是空白画布）。

非根路径 `pnpm test:e2e:base`：

- 所有 Cesium 请求均为 `/cesiumlab/cesium/...`；
- 无 `/cesium/...` 根路径回落；
- 全部 200；console/page error 与失败请求均为 0。

开发模式 `pnpm test:e2e:dev`：

- Playwright 自行启动 `pnpm dev`（Vite dev server，5273）；
- `/src/main.ts`、`/src/catalog/registry.ts`、`/src/experiments/loader.ts` 等开发模块均为 200；
- `/cesium/Workers/...` 与 `/cesium/Assets/...` 仍为 200；
- 画布 1002 × 574，1740 个颜色簇，非暗像素比例约 47.7%；
- console/page error 与失败请求均为 0。

## 图片

| 文件                       | 内容                                                                            |
| -------------------------- | ------------------------------------------------------------------------------- |
| `gallery.png`              | Gallery 全页：两个登记档案、真实状态、阶段说明                                  |
| `smoke-test-detail.png`    | Smoke Test 详情页首屏（1440×900 视口，非全页拼接）                              |
| `smoke-test-viewer.png`    | Viewer 元素截图：真实 CesiumJS 网格地球、椭球、立方体、发光连线、异步多边形区域 |
| `smoke-test-notes.png`     | 实现说明区：它做了什么 / 技术路线 / 已知限制                                    |
| `archived-detail.png`      | 未实现视觉实验档案：无运行场景，导航可用                                        |
| `webgl-unavailable.png`    | 模拟 WebGL 不可用时的明确提示与重试入口                                         |
| `base-path-smoke-test.png` | `/cesiumlab/` 非根路径部署下的真实渲染                                          |
| `dev-mode-smoke-test.png`  | Vite dev server（5273）下的真实渲染                                             |

> 详情页采用视口截图而不是 `fullPage`，避免浏览器对 `position: sticky` 页头做全页拼接时产生重复页头伪影。

## 数据文件

- `browser-report.json`：根路径的浏览器版本、UA、WebGL vendor/renderer、画布尺寸、采样颜色统计、Cesium 响应、console/page error、失败请求。
- `base-path-report.json`：非根路径的对应记录，用于确认 Workers/Assets 的 URL 前缀。
- `dev-report.json`：Vite dev server 的对应记录，包含开发模块与 Cesium 静态资源的响应。

## 可重复性

在仓库根目录执行：

```bash
pnpm test:e2e
pnpm test:e2e:base
```

测试会自动构建、启动 preview、执行检查并覆盖本目录中的截图与报告。不同浏览器/GPU/驱动可能产生像素差异；本项目不把跨设备严格像素一致作为验收条件。

## 未验证

- 没有视觉参考或视觉验收；
- 未测试 Firefox / Safari / 移动端；
- 未做真实公开部署；
- 未进行性能基准、显存统计或内存泄漏 profile；
- 未人工观察非 headless 桌面窗口（自动化 headless WebGL 已使用真实 GPU/D3D11）。
