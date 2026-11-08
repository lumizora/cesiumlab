# cesiumlab

视觉优先的 CesiumJS 实验与可复用 npm 库项目。

用户通过图片、视频、GIF 或明确视觉目标定义效果，Coding Agent 负责实现、调试、测试和视觉证据；用户负责最终视觉验收。项目先追求高质量视觉复现，再评估是否封装为独立 npm 包。

- 产品需求：[docs/01-product-requirements.md](docs/01-product-requirements.md)
- 技术架构：[docs/02-technical-architecture.md](docs/02-technical-architecture.md)
- Agent 规范：[docs/03-agent-specification.md](docs/03-agent-specification.md)
- 实施计划：[docs/04-implementation-plan.md](docs/04-implementation-plan.md)
- 实施状态：[docs/05-implementation-status.md](docs/05-implementation-status.md)
- Agent 工作入口：[AGENTS.md](AGENTS.md)

## 当前状态

**Stage 0（仓库与工程基础）、Stage 1（最小 Web + CesiumJS 环境）已完成；Stage 2 首个视觉参考实验已实现并自检，当前停在 `Awaiting Visual Review`。**

已具备：

- pnpm Monorepo，可继续添加 `packages/*`，无需重做根工程布局；
- `apps/playground`：Vue 3 + TypeScript + Vite + CesiumJS；
- 真实 CesiumJS Viewer；配置 Cesium ion 时加载 World Imagery + World Terrain，未配置或服务失败时回退本地网格；
- Cesium Workers / ThirdParty / Assets / Widgets 静态资源复制与 `CESIUM_BASE_URL` 配置；
- Gallery / Detail，手工登记三个实验档案；
- `earth-network-convergence`：S2-001 夜间地球光网汇聚视觉原型（Prototype / Awaiting Visual Review）；
- 根路径与非根路径（`/cesiumlab/`）的生产构建与浏览器验证；
- 加载中、加载失败、WebGL 不可用、运行错误提示；
- Viewer 清理：路由离开、重新加载、`pagehide` 时销毁；
- Vitest 单元测试、Playwright 真实浏览器检查与 Stage 2 纯净 Viewer 截图模式。

**尚未完成 / 未开始：**

- `Visual Approved`：S2-001 只完成 Agent 自检，必须由用户进行 Stage 3 视觉验收；
- `packages/effects` API 与 npm 发布：没有真实候选，也没有发布批准；
- 公开部署：未选择托管平台，未执行部署。

## 环境要求

| 工具                 | 固定版本                       | 约束                                      |
| -------------------- | ------------------------------ | ----------------------------------------- |
| Node.js              | 24.14.1                        | `>=24.14.0 <25`                           |
| pnpm                 | 12.8.1                         | `>=12.8.1 <13`（`packageManager` 已固定） |
| 浏览器（Playwright） | Microsoft Edge 157（Chromium） | 默认使用本机 `msedge` channel             |

依赖版本固定策略：共享依赖写入 `pnpm-workspace.yaml` 的 `catalog`，所有版本使用精确值，并由 `pnpm-lock.yaml` 锁定。`.npmrc` 设置 `save-exact=true` 与 `engine-strict=true`。

## 快速开始

```bash
pnpm install
pnpm dev
```

开发服务器：<http://127.0.0.1:5273/>

Stage 2 视觉实验入口：

```text
http://127.0.0.1:5273/#/experiments/earth-network-convergence
```

纯净 Viewer 截图模式（隐藏站点 UI 和实验控件）：

```text
http://127.0.0.1:5273/?capture=1#/experiments/earth-network-convergence
```

生产构建与预览：

```bash
pnpm build
pnpm preview
```

预览地址：<http://127.0.0.1:4273/>

非根路径构建（验证 Workers / Assets 在子路径部署下可访问）：

```bash
pnpm build:base
pnpm preview:base
```

预览地址：<http://127.0.0.1:4274/cesiumlab/>

> 启动与预览端口刻意使用 5273 / 4273 / 4274，避免与本机其他项目的 5173 / 4173 / 4174 服务冲突。

## Cesium ion 配置

World Imagery 与 World Terrain 需要 Cesium ion 的公开客户端 token。在**仓库根目录**创建 `.env.local`（已被 `.gitignore` 忽略）：

```dotenv
VITE_CESIUM_ION_TOKEN=<public client token>
```

- Vite `envDir` 指向仓库根目录，因此 `apps/playground` 能读取该变量；
- `.env.example` 提供空模板，不包含真实 token；
- 配置后 Smoke Test 会请求 Cesium World Imagery（AERIAL_WITH_LABELS）与 Cesium World Terrain；
- 未配置或请求失败时，场景回退到本地 `GridImageryProvider` + 椭球地形，仍可运行；
- 前端 token 会进入构建产物，**必须视为公开客户端 token**；请在 Cesium ion 后台限制可访问资产、允许来源与配额；
- 浏览器测试可用 `CESIUMLAB_EXPECT_ION=1` 要求场景实际进入 ion 模式，否则只验证回退路径。

## 常用命令

| 命令                   | 作用                                                |
| ---------------------- | --------------------------------------------------- |
| `pnpm dev`             | 启动 Playground 开发服务器                          |
| `pnpm build`           | 类型检查 + 生产构建到 `apps/playground/dist`        |
| `pnpm preview`         | 预览默认构建                                        |
| `pnpm build:base`      | 构建非根路径版本到 `apps/playground/dist-base`      |
| `pnpm preview:base`    | 在 `/cesiumlab/` 下预览非根路径版本                 |
| `pnpm typecheck`       | `vue-tsc` + `tsc` 类型检查                          |
| `pnpm lint`            | ESLint 检查                                         |
| `pnpm format`          | Prettier 写入格式化                                 |
| `pnpm format:check`    | Prettier 检查                                       |
| `pnpm test`            | Vitest 单元测试                                     |
| `pnpm test:e2e`        | 构建后运行 Playwright 浏览器检查（含截图）          |
| `pnpm test:e2e:base`   | 构建后运行非根路径浏览器检查                        |
| `pnpm test:e2e:dev`    | 启动 Vite dev server 并运行开发模式浏览器检查       |
| `pnpm test:e2e:stage2` | Stage 2 构建、纯净 Viewer 截图、时间序列与参数检查  |
| `pnpm check`           | format check + lint + typecheck + unit test + build |

带 Cesium ion 断言运行（需要 `.env.local`）：

```powershell
$env:CESIUMLAB_EXPECT_ION="1"
pnpm test:e2e
pnpm test:e2e:base
pnpm test:e2e:dev
```

Playwright 默认使用系统安装的 Microsoft Edge。若环境没有 Edge，可安装 Playwright Chromium 并切换：

```bash
pnpm exec playwright install chromium
# PowerShell
$env:CESIUMLAB_BROWSER_CHANNEL="chromium"
pnpm test:e2e
```

需要观察真实浏览器窗口时：

```powershell
$env:CESIUMLAB_HEADFUL="1"
pnpm test:e2e
```

## 目录结构

```text
cesiumlab/
├── AGENTS.md
├── README.md
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── .env.example                       # ion token 模板（无真实值）
├── tsconfig.base.json
├── tsconfig.json
├── eslint.config.mjs
├── apps/
│   └── playground/
│       ├── index.html
│       ├── package.json
│       ├── vite.config.ts            # 根路径构建
│       ├── vite.base.config.ts       # /cesiumlab/ 非根路径构建
│       ├── vite.shared.ts
│       ├── vitest.config.ts
│       ├── playwright.config.ts
│       ├── playwright.base.config.ts
│       ├── playwright.dev.config.ts
│       ├── playwright.stage2.config.ts
│       ├── scripts/sync-cesium.mjs   # 复制 Cesium 静态资源
│       ├── public/
│       │   ├── favicon.svg
│       │   └── cesium/               # 生成物，gitignored
│       ├── src/
│       │   ├── app/                  # 页头、页脚
│       │   ├── catalog/              # 元数据校验、手工登记
│       │   ├── cesium/               # CESIUM_BASE_URL、WebGL 检测
│       │   ├── experiments/          # 运行入口加载器
│       │   ├── features/             # Gallery / Detail / Viewer
│       │   ├── styles/main.css
│       │   ├── App.vue
│       │   ├── main.ts
│       │   └── router.ts             # 最小 hash 路由
│       └── e2e/                      # Playwright 规格
├── experiments/
│   ├── contract.ts                   # Contract v0.1（mount + cleanup）
│   ├── cesium.ts                     # 动态 Cesium 加载 + ion token
│   ├── README.md
│   ├── earth-network-convergence/    # S2-001 视觉原型（runnable）
│   ├── cesium-smoke-test/            # 工程 Smoke Test
│   └── awaiting-visual-reference/    # 参考接收历史档案
├── packages/
│   └── README.md                     # 暂无正式包
├── docs/
│   ├── 01-product-requirements.md
│   ├── 02-technical-architecture.md
│   ├── 03-agent-specification.md
│   ├── 04-implementation-plan.md
│   ├── 05-implementation-status.md
│   └── evidence/
│       ├── stage-1/
│       └── stage-2/             # 截图、报告、命令结果
└── tests/                            # 跨包测试按需加入（当前未创建）
```

## CesiumJS 资源与 `CESIUM_BASE_URL`

Cesium 的 Workers、ThirdParty、Assets、Widgets 不经过普通 JS 打包，需要作为静态资源部署：

1. `apps/playground/scripts/sync-cesium.mjs` 从锁定版本 `node_modules/cesium/Build/Cesium` 复制
   `Workers`、`ThirdParty`、`Assets`、`Widgets` 到 `apps/playground/public/cesium`；
2. Vite 将 `public/cesium` 原样复制到构建产物；
3. `src/cesium/base-url.ts` 在**任何 Cesium 值模块求值之前**设置
   `window.CESIUM_BASE_URL = import.meta.env.BASE_URL + 'cesium/'`；
4. 全仓库不使用静态 `import { Viewer } from 'cesium'`，只在实验 mount 内动态
   `import('cesium')`，避免静态 import 提升造成资源 404；
5. `Widgets/widgets.css` 由 Playground 显式导入，Cesium 包不会隐式注入宿主 CSS。

非根路径构建已验证：Cesium 请求均位于 `/cesiumlab/cesium/...`，没有回落到 `/cesium/...`。

## 实验登记与运行契约

当前使用**手工登记**，不实现自动发现：

- 元数据：`experiments/<slug>/metadata.json`，由
  `apps/playground/src/catalog/schema.ts` 校验；
- 目录：`apps/playground/src/catalog/registry.ts` 的 `rawMetadata`；
- 运行入口：同一文件的 `runtimeLoaders`，只有显式登记的实验才可动态导入；
- 无运行入口的档案仍可在 Gallery 展示，状态如实标注为 `not-implemented` / `unavailable` / `error`。

运行契约见 `experiments/contract.ts`：

```ts
interface ExperimentModule {
  mount(context: {
    container: HTMLElement;
    onError?: (error: unknown) => void;
  }): Promise<void | (() => void)>;
}
```

实验可以自建 Viewer，也必须自行销毁；Playground 只负责容器、错误展示与调用 cleanup。Stage 1 **没有**建立通用 Runtime、参数 Schema 或自动发现。

## 依赖与版本

| 依赖               | 版本    | 说明                                                                        |
| ------------------ | ------- | --------------------------------------------------------------------------- |
| Vue                | 3.5.45  | UI                                                                          |
| Vite               | 8.3.6   | 开发 / 构建                                                                 |
| @vitejs/plugin-vue | 6.0.10  | Vue SFC                                                                     |
| TypeScript         | 5.9.3   | 固定在 5.9.x：typescript-eslint 8.72 声明支持 `<6.1.0`，未采用 TypeScript 7 |
| vue-tsc            | 3.3.14  | `.vue` 类型检查                                                             |
| CesiumJS           | 1.147.0 | 唯一三维渲染引擎                                                            |
| Vitest             | 5.1.0   | 单元测试                                                                    |
| @playwright/test   | 1.65.0  | 真实浏览器检查                                                              |
| ESLint             | 10.14.0 | 代码规范                                                                    |
| Prettier           | 3.9.10  | 格式化                                                                      |

完整依赖树以 `pnpm-lock.yaml` 为准。

## 验证结果

本轮实际执行并通过：

| 检查       | 命令                                           | 结果                                                   |
| ---------- | ---------------------------------------------- | ------------------------------------------------------ |
| 格式       | `pnpm format:check`                            | 通过                                                   |
| Lint       | `pnpm lint`                                    | 通过                                                   |
| 类型       | `pnpm typecheck`                               | 通过                                                   |
| 单元测试   | `pnpm test`                                    | 6 个文件、23 个测试通过                                |
| 生产构建   | `pnpm build`                                   | 通过                                                   |
| 浏览器检查 | `pnpm test:e2e`                                | 3 个 Playwright 测试通过                               |
| 非根路径   | `pnpm test:e2e:base`                           | 1 个 Playwright 测试通过                               |
| 开发模式   | `pnpm test:e2e:dev`                            | 1 个 Playwright 测试通过                               |
| Stage 2    | `pnpm test:e2e:stage2`                         | 1 个 Playwright 测试通过（截图/时间序列/参数）         |
| Cesium ion | `$env:CESIUMLAB_EXPECT_ION="1"; pnpm test:e2e` | 通过：`ionStatus=ready`、World Imagery + World Terrain |

浏览器证据：

- Microsoft Edge 157.0.4341.42（Chromium，headless）；
- Windows 10，NVIDIA GeForce GTX 1070 Ti，ANGLE/D3D11；
- WebGL 2.0；
- Vite dev（5273）、生产 preview（4273）与非根路径 preview（4274）均完成真实渲染检查；
- 画布 1002 × 574（Smoke Test），约 3000–4300 个颜色簇、47.7% 非暗像素（以报告为准）；
- `data-imagery-source="cesium-world-imagery"`、`data-terrain-source="cesium-world-terrain"`；
- Cesium Workers / Assets 与 Cesium ion endpoint / terrain 瓦片请求均为 HTTP 200；
- 相机拖动旋转与滚轮缩放通过前后画布截图差异验证；
- 无 console error、page error 或失败请求。

Stage 2（`earth-network-convergence`）证据：

- 1672 × 941 纯净 Viewer 截图（`?capture=1`），实际 CesiumJS/WebGL 输出；
- 1672 × 941 画布，约 10046 个颜色簇、60.4% 非暗像素；
- `t=0 / 2 / 5 / 10s` 时间序列截图存在可见变化；
- 7 条三维金色弧线、7 个蓝色节点（分层全息能量光束）、中心环境波纹；飞线 3–5s，带金白色光点与连续 taper 拖尾；节点 3 圈连续波纹，中心 3 圈环境波纹 + 抵达双圈强脉冲；
- 拖动旋转、滚轮缩放、颜色/透明度/亮度/拖尾/速度/弧高/光束高度/核心宽度/光晕宽度/光束亮度/呼吸速度参数、暂停/继续、手动触发中心脉冲与重置 Showcase 已实际检查；
- Stage 2 证据：[docs/evidence/stage-2/](docs/evidence/stage-2/)。

Stage 1 工程证据：[docs/evidence/stage-1/](docs/evidence/stage-1/)。

**注意：以上是工程与真实渲染检查，不是视觉验收。项目没有 Visual Approved 实验。**

## 已知限制与未验证项

- **Stage 2 尚未获得 Visual Approved**；S2-001 只是 Agent 自检的原型，等待用户 Stage 3 验收；
- Stage 2 的夜景纹理是 4096×2048 单幅影像，近看会糊；参考图中的暖色地形/城市灯光细节未完全复现；
- Natural Earth 边界不是权威争议边界裁定；台湾按 Natural Earth 独立单元绘制，参考图轮廓与实际地理数据存在差异；
- 金色弧线/光柱/拖尾的动画方向与周期是设计假设，不是参考 GIF/视频事实；
- 未验证 Firefox、Safari、移动端浏览器、真实 GPU 桌面窗口截图；本轮只使用 Edge/Chromium headless；
- 未做真实托管平台部署；`base` 路径验证只覆盖本地 `vite preview`；
- 未做内存泄漏分析；生命周期通过重新加载场景、画布数量、再次进入退出检查，不等于证明无泄漏；
- 未对 Cesium 4.94 MB（gzip 1.36 MB）主 chunk 做进一步拆包或首屏优化；
- 未建立自动实验发现、参数 Schema、通用 Runtime、Gallery 搜索/筛选；
- 没有 npm 包、没有 npm scope / 许可证定案，禁止发布；
- 项目代码许可证尚未正式决定，仓库当前不提供 `LICENSE` 文件；
- Cesium ion 影像/地形依赖外部服务与网络；服务失败时场景回退本地网格，但不再显示真实影像/地形；
- Cesium ion token 会进入前端 bundle，必须按公开客户端 token 管理并限制权限；`.env.local` 不提交 Git；
- Smoke Test 页面会显示 Cesium / Cesium ion / Bing Maps 的 attribution；配置 ion 后使用真实影像与地形服务。

## 下一步

Stage 2 已完成 Agent 自检，状态为 **Prototype / Awaiting Visual Review**。下一步需要用户进行 Stage 3 视觉验收：查看 1672×941 主截图、`t=0/2/5/10s` 时间序列与交互检查，决定接受、继续修改或重做。只有用户能批准 `Visual Approved`；未获批准前不得进入 `packages/effects` 通用化或 npm 发布。
