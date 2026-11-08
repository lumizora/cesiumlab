# cesiumlab 实施状态（Stage 0 / Stage 1）

> 更新时间：2026-11-08  
> 对应计划：[`04-implementation-plan.md`](./04-implementation-plan.md)  
> 本文只记录**实际完成与验证事实**，不替代产品需求、架构或实施计划。

## 1. 范围

本轮只执行 Stage 0 与 Stage 1：

```text
S0 仓库基础  →  S1 最小 Web / Cesium 环境  →  [停止]
```

S2（首个视觉参考实验）没有启动，因为没有视觉参考，也没有用户指令。当前没有 `Visual Approved` 实验，没有 `packages/effects` 正式包，没有 npm 发布或公开部署。

## 2. Gate S0：仓库与执行规范

| 退出条件                                   | 实际结果                                                                        | 证据                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------- |
| 全新工作副本可按 README 安装并完成静态检查 | 通过：`pnpm install`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`        | 仓库根 README、`docs/evidence/stage-1/` |
| 无应用秘密或未授权参考素材进入 Git         | 通过：无 Token、无第三方图像/视频/模型；仅本地 Cesium 包资源与自绘 favicon      | 仓库文件清单、`.gitignore`              |
| 未来添加 `packages/*` 不需重做布局         | 通过：`pnpm-workspace.yaml` 覆盖 `apps/*`、`packages/*`；`packages/` 仅保留说明 | `pnpm-workspace.yaml`                   |
| 不创建虚构 npm API / 伪造版本              | 通过：没有 `@cesiumlab/effects` 包或假 API                                      | `packages/README.md`                    |

已建立：

- Git 仓库（`main` 分支）；
- pnpm Monorepo：`apps/*`、`packages/*`；`experiments/` 为普通源码目录，不是每个实验一个 package；
- 根 `package.json`：精确版本、`packageManager: pnpm@12.8.1`、Node/pnpm engines、统一命令；
- `pnpm-workspace.yaml`：catalog 固定共享版本；
- `tsconfig.base.json` + 根 `tsconfig.json` + Playground 的 app/node 配置；
- ESLint 10 flat config + Prettier 3；
- `.gitignore`、`.editorconfig`、`.npmrc`（save-exact、engine-strict）；
- 保留并接入原有 `docs/01`–`docs/04` 和 `AGENTS.md`；
- 重写根 README，说明启动、构建、检查、资源策略、限制与证据位置；
- 项目代码许可证仍未定案，未添加 `LICENSE`，禁止 npm 发布。

## 3. Gate S1：最小 Web + CesiumJS 实验环境

| 退出条件                            | 实际结果                                                                             | 证据                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `dev` 与 `build/preview` 可实际渲染 | 通过：Vite dev 与 production preview 均创建真实 Cesium Viewer                        | `docs/evidence/stage-1/`、Playwright           |
| Cesium Workers/Assets 请求正确      | 通过：Workers、Assets、Widgets、ThirdParty 均为 200；无失败请求                      | `browser-report.json`、`base-path-report.json` |
| 桌面 Chromium 可旋转、缩放基础场景  | 通过：Edge 157（Chromium）headless 实际渲染；Playwright 拖动与滚轮操作后截图发生变化 | 截图与 Playwright 渲染检查                     |
| 一个错误的实验详情不破坏站点导航    | 通过：未登记 ID 显示“找不到实验”；无运行入口的档案显示说明，导航继续可用             | Playwright 测试 2/3                            |
| 没有注册的实验代码不自动进入构建    | 通过：只有 `runtimeLoaders` 显式登记的实验才 `import()`；档案元数据可独立展示        | `src/catalog/registry.ts`                      |
| 非根路径部署 Workers 可访问         | 通过：`/cesiumlab/` 构建下所有 Cesium 请求位于 `/cesiumlab/cesium/...`，无根路径回落 | `base-path-report.json`                        |

已实现：

- `apps/playground`：Vue 3 + TypeScript + Vite + CesiumJS；
- 真实 CesiumJS Viewer，使用 `GridImageryProvider` 本地网格地球，不依赖 Cesium ion Token / 远程影像或地形；
- Entity API（椭球、立方体、点、标签、发光折线）+ 异步 Primitive（`PolygonGeometry`）验证 Workers；
- Cesium 静态资源由 `scripts/sync-cesium.mjs` 从锁定版本复制到 `public/cesium`；
- `CESIUM_BASE_URL` 在 Cesium 值模块求值前设置，全仓库仅动态 `import('cesium')`；
- 最简 hash 路由：Gallery → Experiment Detail；
- 手工登记两个档案：
  - `cesium-smoke-test`（runnable，Smoke Test）；
  - `awaiting-visual-reference`（not-implemented，等待视觉参考）；
- 加载中、加载失败、WebGL 不可用、运行错误提示；
- 相机拖动旋转、滚轮缩放：Playwright 操作前后画布截图差异验证；
- cleanup：移除监听、调用 `viewer.destroy()`、清空容器；覆盖路由离开、重新加载、`pagehide`、bfcache `pageshow`；
- 根路径与非根路径两套构建配置；
- Vitest 单元测试 + Playwright 浏览器检查 + 截图/报告。

## 4. 实际执行的检查

| 命令                 | 结果                                        |
| -------------------- | ------------------------------------------- |
| `pnpm install`       | 通过，生成 `pnpm-lock.yaml`                 |
| `pnpm format:check`  | 通过                                        |
| `pnpm lint`          | 通过                                        |
| `pnpm typecheck`     | 通过（`vue-tsc` + `tsc`）                   |
| `pnpm test`          | 6 个测试文件、23 个测试通过                 |
| `pnpm build`         | 通过，产物 `apps/playground/dist`           |
| `pnpm test:e2e`      | 3 个 Playwright 测试通过                    |
| `pnpm test:e2e:base` | 1 个 Playwright 测试通过                    |
| `pnpm test:e2e:dev`  | 1 个 Playwright 测试通过（Vite dev server） |

环境：

- Windows 10；
- Node.js 24.14.1；pnpm 12.8.1；
- Microsoft Edge 157.0.4341.42（Chromium，headless）；
- NVIDIA GeForce GTX 1070 Ti，ANGLE/D3D11；
- WebGL 2.0。

详细数据（请求、渲染统计、控制台错误）见
[`evidence/stage-1/browser-report.json`](./evidence/stage-1/browser-report.json) 与
[`evidence/stage-1/base-path-report.json`](./evidence/stage-1/base-path-report.json)。

## 5. 未验证 / 未执行

- **视觉验收**：没有视觉参考，没有 Visual Approved；Smoke Test 不是视觉实验。
- **浏览器覆盖**：未测试 Firefox、Safari、移动端浏览器；本轮只用 Edge/Chromium headless。
- **真实桌面窗口/录屏**：未进行人工桌面观察或视频录制；截图来自 headless Edge 的真实 WebGL 输出。
- **公开部署**：未选择托管平台，未部署；只验证本地 `vite preview` 的根路径与 `/cesiumlab/` 子路径。
- **性能**：未建立 FPS/显存/首屏基准；Cesium 主 chunk 约 4.94 MB（gzip 1.36 MB），未做进一步拆包。
- **内存泄漏**：未做 heap/profile 级分析；只验证了重新加载、路由离开和退出后画布数量与再次进入。
- **自动发现/通用 Runtime**：按计划暂不实现。
- **npm 发布**：未创建包、未配置 scope、未定许可证、未发布。

## 6. 下一步条件

技术上，环境已可承载 Stage 2。启动 Stage 2 仍缺少业务输入：

1. 用户提供具体视觉参考（图片 / 视频 / GIF / 明确视觉描述）及可公开范围；
2. 用户指示开始复现，并明确首个实验的验收镜头/状态（如适用）。

在获得这些输入前，不应自行选择首个特效，也不得把工程 Smoke Test 表述为视觉成果。
