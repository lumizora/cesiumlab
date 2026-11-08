# cesiumlab 实施状态（Stage 0 / Stage 1 / Stage 2 S2-001）

> 更新时间：2026-11-08  
> 对应计划：[`04-implementation-plan.md`](./04-implementation-plan.md)  
> 本文只记录**实际完成与验证事实**，不替代产品需求、架构或实施计划。

## 1. 范围

已完成 Stage 0、Stage 1，并完成 Stage 2 首个视觉参考实验 S2-001 的 Agent 自检：

```text
S0 仓库基础  →  S1 最小 Web / Cesium 环境  →  S2 earth-network-convergence
                                                        │
                                                        ▼
                                             Awaiting Visual Review（停止）
```

S3 需要用户视觉验收，尚未开始。当前没有 `Visual Approved` 实验，没有 `packages/effects` 正式包，没有 npm 发布或公开部署。

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
- 真实 CesiumJS Viewer；配置 Cesium ion 时加载 World Imagery + World Terrain，未配置或失败时回退本地网格/椭球；
- Entity API（椭球、立方体、点、标签、发光折线）+ 异步 Primitive（`PolygonGeometry`）验证 Workers；
- Cesium 静态资源由 `scripts/sync-cesium.mjs` 从锁定版本复制到 `public/cesium`；
- `CESIUM_BASE_URL` 在 Cesium 值模块求值前设置，全仓库仅动态 `import('cesium')`；
- 最简 hash 路由：Gallery → Experiment Detail；
- 手工登记两个档案：
  - `cesium-smoke-test`（runnable，Smoke Test）；
  - `awaiting-visual-reference`（not-implemented，等待视觉参考）；
- 加载中、加载失败、WebGL 不可用、运行错误提示；
- 相机拖动旋转、滚轮缩放：Playwright 操作前后画布截图差异验证；
- 可选 Cesium ion：根 `.env.local` 的 `VITE_CESIUM_ION_TOKEN` 控制；`data-ion-status` / `data-imagery-source` / `data-terrain-source` 暴露实际加载状态；
- cleanup：移除监听、调用 `viewer.destroy()`、清空容器；覆盖路由离开、重新加载、`pagehide`、bfcache `pageshow`；
- 根路径与非根路径两套构建配置；
- Vitest 单元测试 + Playwright 浏览器检查 + 截图/报告。

## 4. 实际执行的检查

| 命令                                           | 结果                                                   |
| ---------------------------------------------- | ------------------------------------------------------ |
| `pnpm install`                                 | 通过，生成 `pnpm-lock.yaml`                            |
| `pnpm format:check`                            | 通过                                                   |
| `pnpm lint`                                    | 通过                                                   |
| `pnpm typecheck`                               | 通过（`vue-tsc` + `tsc`）                              |
| `pnpm test`                                    | 6 个测试文件、23 个测试通过                            |
| `pnpm build`                                   | 通过，产物 `apps/playground/dist`                      |
| `pnpm test:e2e`                                | 3 个 Playwright 测试通过                               |
| `pnpm test:e2e:base`                           | 1 个 Playwright 测试通过                               |
| `pnpm test:e2e:dev`                            | 1 个 Playwright 测试通过（Vite dev server）            |
| `$env:CESIUMLAB_EXPECT_ION="1"; pnpm test:e2e` | 通过：`ionStatus=ready`，World Imagery + World Terrain |

环境：

- Windows 10；
- Node.js 24.14.1；pnpm 12.8.1；
- Microsoft Edge 157.0.4341.42（Chromium，headless）；
- NVIDIA GeForce GTX 1070 Ti，ANGLE/D3D11；
- WebGL 2.0；
- Cesium ion：World Imagery（AERIAL_WITH_LABELS）+ World Terrain；endpoint 与地形瓦片请求 200。

### Cesium ion 配置

- token 只写入本地 `.env.local`（gitignored），未提交；
- Vite `envDir` 指向仓库根目录，构建时通过 `import.meta.env.VITE_CESIUM_ION_TOKEN` 注入；
- `experiments/cesium.ts` 在动态加载 Cesium 后设置 `Ion.defaultAccessToken`；
- 根 `.env.example` 仅保留空模板；
- 前端 token 会进入 bundle，属于公开客户端凭据，必须在 Cesium ion 后台限制资产与来源；
- 未配置或请求失败时回退本地网格，Smoke Test 仍可运行。

详细数据（请求、渲染统计、控制台错误）见
[`evidence/stage-1/browser-report.json`](./evidence/stage-1/browser-report.json)、
[`evidence/stage-1/base-path-report.json`](./evidence/stage-1/base-path-report.json) 与
[`evidence/stage-1/dev-report.json`](./evidence/stage-1/dev-report.json)。

## 5. Stage 2：S2-001 earth-network-convergence

| 项目     | 结果                                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 状态     | **Prototype / Awaiting Visual Review**；未获 Visual Approved                                                                                            |
| 参考     | `docs/stage2/cesiumlab-stage2-task-package/references/S2-001-earth-network/target.png`（内部研发；未公开部署）                                          |
| 实现     | `experiments/earth-network-convergence/`（main/network/geo/textures/controls）                                                                          |
| 场景     | 夜空地球、Natural Earth 中国边界/省界、7 个蓝色节点与光柱、7 条金色弧线、上海金色中心与 6 层环                                                          |
| 数据     | 夜景纹理（three-globe 示例资源，MIT 仓库；底层 NASA Black Marble 待公开前复核）；Natural Earth 1:50m（Public Domain）；Cesium World Terrain（可选 ion） |
| 纯净截图 | `docs/evidence/stage-2/earth-network-main-1672x941.png`（1672×941）                                                                                     |
| 时间序列 | `earth-network-t2.png` / `t5.png` / `t10.png`；主截图即 t0                                                                                              |
| 交互     | `earth-network-angle.png`、`earth-network-zoom.png`、`earth-network-controls.png`                                                                       |
| 检查     | `pnpm test:e2e:stage2` 通过；无 console/page error、无失败请求；重进实验画布数 1                                                                        |
| VA 矩阵  | 详见 [`evidence/stage-2/README.md`](./evidence/stage-2/README.md)                                                                                       |

Stage 2 动画假设与实际周期：

- 金色光点沿三维弧线由节点流向上海；`routeSpeed=1` 时飞行时间约 3–5s（按路径长度调节）；
- 光点后方有连续 taper 拖尾，默认约占整条弧线的 18%；
- 蓝色节点在对应飞线出发时触发一次约 1.2s 的事件扩散，不再是持续循环；
- 金色中心脉冲由金色光点抵达事件触发，单次约 1.3s，ease-out 单环冲击波，不做持续呼吸；
- 以上均为本次设计假设，不是参考静态图可证明的事实。

## 6. 未验证 / 未执行

- **视觉验收**：S2-001 没有 Visual Approved；需用户执行 Stage 3 视觉验收。
- **浏览器覆盖**：未测试 Firefox、Safari、移动端浏览器；本轮只用 Edge/Chromium headless。
- **真实桌面窗口/录屏**：未进行人工桌面观察或视频录制；截图来自 headless Edge 的真实 WebGL 输出；Stage 2 使用 1672×941 时间序列代替录屏。
- **公开部署**：未选择托管平台，未部署；只验证本地 `vite preview` 的根路径与 `/cesiumlab/` 子路径。
- **性能**：未建立 FPS/显存/首屏基准；Cesium 主 chunk 约 4.94 MB（gzip 1.36 MB），未做进一步拆包。
- **内存泄漏**：未做 heap/profile 级分析；只验证了重新加载、路由离开和退出后画布数量与再次进入。
- **自动发现/通用 Runtime**：按计划暂不实现。
- **npm 发布**：未创建包、未配置 scope、未定许可证、未发布。
- **Cesium ion 服务**：已验证当前 token 的 World Imagery/Terrain 加载；未验证其他 ion 资产、配额耗尽、离线或代理环境。前端 token 会暴露在 bundle 中，必须按公开客户端凭据管理。

## 7. 下一步条件

Stage 2 已停在 `Awaiting Visual Review`。下一步需要用户进行 **Stage 3 视觉验收**：

1. 查看 1672×941 主截图、`t=0/2/5/10s` 时间序列、角度/缩放截图与参数面板截图；
2. 对照参考，决定接受、继续修改或重做；
3. 只有用户明确确认后才能标记 `Visual Approved`；未获批准前不得进入 `packages/effects` 通用化或 npm 发布。
