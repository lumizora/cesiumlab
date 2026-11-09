# cesiumlab 实施状态（Stage 0–5A）

> 更新时间：2026-11-09
>
> 对应计划：[`04-implementation-plan.md`](./04-implementation-plan.md)
>
> 本文只记录**实际完成与验证事实**，不替代产品需求、架构或实施计划。

## 1. 范围

已完成 Stage 0、Stage 1、Stage 2 S2-001（用户 Visual Approved）、Stage 3 视觉基准固化、Stage 4 公开 Playground、Stage 4.5 首次 GitHub Pages 部署，以及 Stage 5A 特效通用化评估。公开站点：<https://lumizora.github.io/cesiumlab/>。

```text
S0 仓库基础 → S1 最小 Web/Cesium → S2 S2-001 → S3 视觉基准固化 → S4 公开 Playground
                                                                        │
                                                                        ▼
                                                    S4.5 部署准备 → 首次 GitHub Pages 上线
```

Stage 5 / `packages/effects` 通用化尚未开始；需要用户明确指示后才能进入封装评估。当前没有正式包，没有 npm 发布。

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
- 项目代码已采用 MIT LICENSE；npm 发布仍未批准。

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
| 状态     | **Visual Approved**（用户批准：2026-11-08；批准基线 revision `e5da645`）                                                                                |
| 参考     | `docs/stage2/cesiumlab-stage2-task-package/references/S2-001-earth-network/target.png`（内部研发；未公开部署）                                          |
| 实现     | `experiments/earth-network-convergence/`（main/network/geo/textures/controls）                                                                          |
| 场景     | 夜空地球、Natural Earth 中国边界/省界、7 个蓝色节点与分层全息能量光束、7 条金色弧线、上海金色中心与 3 圈环境波纹                                        |
| 数据     | 夜景纹理（three-globe 示例资源，MIT 仓库；底层 NASA Black Marble 待公开前复核）；Natural Earth 1:50m（Public Domain）；Cesium World Terrain（可选 ion） |
| 纯净截图 | `docs/evidence/stage-2/earth-network-main-1672x941.png`（1672×941）                                                                                     |
| 时间序列 | `earth-network-t2.png` / `t5.png` / `t10.png`；主截图即 t0                                                                                              |
| 交互     | `earth-network-angle.png`、`earth-network-zoom.png`、`earth-network-controls.png`                                                                       |
| 检查     | `pnpm test:e2e:stage2` 通过；无 console/page error、无失败请求；重进实验画布数 1                                                                        |
| VA 矩阵  | 详见 [`evidence/stage-2/README.md`](./evidence/stage-2/README.md)                                                                                       |

Stage 2 动画假设与实际周期：

- 金色光点沿三维弧线由节点流向上海；`routeSpeed=1` 时飞行时间约 3–5s（按路径长度调节）；
- 光点后方有连续 taper 拖尾，默认约占整条弧线的 18%；
- 蓝色节点持续 3 圈错位波纹：约 0.8s 生成一圈、单圈 2.4s，任意时刻约 2–3 圈同时存在；
- 金色中心持续 3 圈环境波纹：约 1.07s 生成一圈、单圈 3.2s；飞线抵达时额外触发约 1.3s 的双圈强脉冲，环境波纹不中断；
- 以上均为本次设计假设，不是参考静态图可证明的事实。

## 6. Stage 3：视觉基准固化

S2-001 已建立可追溯的后续回归基准：

| 项目     | 结果                                                            |
| -------- | --------------------------------------------------------------- |
| 批准基线 | 实现 revision `e5da645`；批准记录 `9f49d39`；证据归档 `8e86bf5` |
| 基准目录 | `docs/visual-baselines/S2-001/`                                 |
| 已保存   | 主截图、侧视角、节点近景、确定性暂停控制帧、`baseline.json`     |
| 记录内容 | 默认相机、7 节点/7 弧线、默认参数、场景配置、截图 SHA256、限制  |
| 回归方式 | `pnpm test:e2e:stage4` + ImageMagick RMSE 对比                  |
| 控制帧   | `?capture=1&paused=1&terrain-off`，t=0、椭球地形                |
| 视觉改动 | 未改变已批准的默认 Showcase 视觉；新增 query 仅用于回归         |

## 7. Stage 4：公开 Web Playground

已完成 Stage 4 的本地实现与生产预览验证，并已上线 GitHub Pages。

| 项目     | 结果                                                                            |
| -------- | ------------------------------------------------------------------------------- |
| Gallery  | 全部 3 个登记档案公开；成熟度/运行状态分离；Visual Approved 统计为 1            |
| 独立 URL | `#/experiments/<id>`；直接访问、刷新保持                                        |
| Showcase | S2-001 默认加载已批准场景、参数面板、暂停/重置                                  |
| 说明     | 详情页展示简介、技术路线、局限、revision、验证记录                              |
| 隔离     | 归档/未运行实验保留详情；未知实验仅局部 404；运行异常由 ViewerHost 隔离         |
| 资源     | Cesium Workers/Assets/Widgets 进入生产构建；根路径与 `/cesiumlab/` 子路径验证   |
| 清理     | 实验切换/刷新后 canvas 数 1；路由离开/重新加载释放 Viewer                       |
| 证据     | `docs/evidence/stage-4/`、`docs/visual-baselines/S2-001/`、`stage4-report.json` |
| 部署说明 | `docs/06-public-deployment.md`                                                  |
| 部署状态 | **已上线**：<https://lumizora.github.io/cesiumlab/>；未发布 npm                 |

## 8. Stage 4.5：首次 GitHub Pages 部署

GitHub Pages 首次部署已完成。

| 项目        | 结果                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------- |
| 平台        | GitHub Pages（`build_type=workflow`，HTTPS enforced）                                       |
| URL         | <https://lumizora.github.io/cesiumlab/>                                                     |
| 部署 Commit | `0de165e5d4013090307643a2b99895c61d19e334`                                                  |
| Workflow    | run `42557732534`，build/deploy success                                                     |
| Base path   | `/cesiumlab/`；artifact 357 files / 12.57 MiB                                               |
| Environment | `github-pages`，required reviewer `lumizora`，branch policy `main`                          |
| 公网冒烟    | Gallery 3 / Visual Approved 1；World Terrain；0 console/page/failed requests                |
| 视觉回归    | 公网控制帧 RMSE `0.0103965`（约 1.04%），差异集中在星空/AA 高频像素                         |
| 回滚        | tag `deploy-2026-11-09-0de165e`；GitHub Pages deployment history；artifact 30 天            |
| 未验证      | Firefox/Safari/mobile；GitHub Pages 不支持自定义 CSP/安全响应头；ion 来源限制仍需控制台复核 |
| 状态        | **已上线**                                                                                  |

部署记录：[`docs/evidence/deployment/`](./evidence/deployment/)。

## 9. 未验证 / 未执行

- **视觉验收**：S2-001 已获用户 Visual Approved（2026-11-08）；未重新验证后续修改是否保持基线。
- **浏览器覆盖**：未测试 Firefox、Safari、移动端浏览器；本轮只用 Edge/Chromium headless。
- **真实桌面窗口/录屏**：未进行人工桌面观察或视频录制；截图来自 headless Edge 的真实 WebGL 输出；Stage 2 使用 1672×941 时间序列代替录屏。
- **公开部署**：GitHub Pages 已上线；公网冒烟覆盖 Edge headless、HTML/JS/CSS、Cesium Workers/Assets/Widgets/ThirdParty、World Terrain 与 S2-001。GitHub Pages 不提供自定义 CSP/安全响应头；Firefox/Safari/mobile 未验证。
- **性能**：未建立 FPS/显存/首屏基准；Cesium 主 chunk 约 4.94 MB（gzip 1.36 MB），未做进一步拆包。
- **内存泄漏**：未做 heap/profile 级分析；只验证了重新加载、路由离开和退出后画布数量与再次进入。
- **自动发现/通用 Runtime**：按计划暂不实现。
- **npm 发布**：未创建包、未配置 scope；MIT LICENSE 已有，未发布。
- **Cesium ion 服务**：已验证当前 token 的 World Imagery/Terrain 加载；未验证其他 ion 资产、配额耗尽、离线或代理环境。前端 token 会暴露在 bundle 中，必须按公开客户端凭据管理。

## 10. 下一步条件

S2-001 视觉已批准（基线 `e5da645`），Stage 4 公开 Playground 与 Stage 4.5 首次 GitHub Pages 部署已完成。当前不发布 npm、不进入 `packages/effects` 通用化。

后续工作：

1. 在 Cesium ion 控制台复核 token 来源/资产限制；
2. 如需严格 CSP/安全响应头，评估 Cloudflare Pages/Vercel；
3. 后续视觉修改继续对照 `docs/visual-baselines/S2-001/` 检查退化；
4. 进入封装评估或 npm 发布前，等待用户明确批准。

## 11. Stage 5A：特效通用化评估

已完成代码审查与 `@cesiumlab/effects` 首轮 API 设计，**未修改 S2-001、未创建包、未发布 npm**。

| 候选        | 结论                                                    |
| ----------- | ------------------------------------------------------- |
| Flowing Arc | 高复用；进入首轮候选                                    |
| Node Ripple | 低风险；优先实现                                        |
| Hub Pulse   | 与 Node Ripple 保持独立 API；随后实现                   |
| Energy Beam | 有条件候选；约 637 billboard/7 束，最后实现并设性能门槛 |

推荐顺序：共享内部基础 → Node Ripple → Flowing Arc → Hub Pulse → Energy Beam。
完整报告：[`08-stage5a-effects-assessment.md`](./08-stage5a-effects-assessment.md)。

当前状态：**等待 Stage 5B 实施批准**。
