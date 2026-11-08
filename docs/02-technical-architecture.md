# cesiumlab 技术架构设计 V1.0

> 文档编号：CL-ARCH-001  
> 日期：2026-11-08  
> 状态：面向首版实施的推荐架构；具体依赖版本在实现时通过锁文件固定并验证。  
> 上游需求：[`01-product-requirements.md`](./01-product-requirements.md)

## 1. 架构目标与非目标

目标：用尽可能少的基础设施支持视觉实验的真实 CesiumJS 渲染、公开展示和以后独立 npm 包的提炼；实验可以自由尝试，不要求从一开始符合正式公共包的全部约束。

严格非目标：在线执行访客上传代码、在线 IDE、AI 代理运行服务、后端数据库、复杂实验状态机、强制统一 Shader/Viewer、低代码场景搭建、自动 npm 发布。

### 1.1 两个里程碑的架构边界

- **A / Visual Lab**：重点是 `apps/playground` + `experiments`；可仅使用一个参考驱动实验。`packages/effects` 可先留空或仅设立候选结构，不能为构建形式而暴露虚构 API。
- **B / Reusable Library**：新增真正独立的 `packages/effects`，引入发布级的 API、类型、包测试、版本和独立消费验证。

## 2. 推荐技术栈

| 范围       | 建议                         | 理由 / 边界                                                                  |
| ---------- | ---------------------------- | ---------------------------------------------------------------------------- |
| Monorepo   | pnpm workspace               | 原生工作区，简单，支持未来多个 npm 包；不需要先引入 Nx/Turborepo             |
| Web 构建   | Vite + TypeScript            | 适合静态部署；支持按需 import、构建产物优化                                  |
| UI         | Vue 3（轻量组件）            | Gallery / Viewer / 参数面板已足够；不要先建通用组件系统                      |
| 三维       | CesiumJS                     | 唯一主渲染引擎；特殊实验允许必要自定义渲染技术                               |
| 基础测试   | Vitest                       | 校验纯逻辑、元数据、参数转换等                                               |
| 浏览器测试 | Playwright                   | 打开实际页面、检查控制台、截图及 WebGL 渲染；不是所有 GPU 性能都可被 CI 代表 |
| Git / CI   | Git + GitHub Actions（推荐） | 版本追溯、构建检查、部署及发布批准                                           |
| npm 分发   | scoped package（名称待核实） | `@cesiumlab/effects` 为候选名，不能假定 scope 已归属项目                     |

版本策略：实施当天查询当前兼容版本，固定 Node LTS、pnpm、CesiumJS、Vite、Vue 与测试工具的具体版本，并提交锁文件。对 CesiumJS 大版本/次版本升级采用显式兼容测试，尤其关注实验性 Shader API。

## 3. 逻辑分层

```text
用户 / 访客
  │
  ▼
apps/playground
  ├── Gallery（实验档案与状态）
  ├── Viewer（实验实际渲染入口）
  ├── Controls（仅对声明支持的能力提供控件）
  ├── Reference/Notes（参考与技术说明）
  └── Fallback（不可运行 / 运行失败）
  │                  │
  ▼                  ▼
Experiment Catalog   Experiment Runtime(s)
（纯元数据）          （按需加载，按实验所有权清理）
                       │
                       ├── 原型实现：experiments/*
                       └── 已晋升演示：packages/effects

packages/effects
  └── 纯可复用库：不依赖 Playground 或原型目录
```

依赖约束：`playground → experiment`；`experiment → effects` 允许；`effects → experiment/playground` 禁止。构建工具与共享测试可以按需访问 workspace，但公共运行时依赖必须有清晰边界。

## 4. 仓库布局

推荐的**目标布局**（不是要求第一天创建全部文件）：

```text
cesiumlab/
├── AGENTS.md
├── README.md
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── .github/workflows/              # 实际需要时加入 CI
├── apps/
│   └── playground/
│       ├── src/
│       │   ├── app/                 # 页面/导航
│       │   ├── features/gallery/    # 档案浏览
│       │   ├── features/viewer/     # 实验载入与隔离
│       │   ├── features/controls/   # 参数调节（按需）
│       │   └── catalog/             # 目录索引生成结果/加载器
│       └── public/                  # 仅可公开资源
├── experiments/
│   └── <slug>/
│       ├── metadata.json            # 构建不执行的元数据
│       ├── main.ts                  # 运行入口（可选：未实现时不存在）
│       ├── README.md                # 技术笔记
│       ├── assets/                  # 已授权公开的实验资源或内部资源
│       └── references/              # 需明确公开权限的参考资料
├── packages/
│   └── effects/                      # 有真实候选时创建入口/API
├── docs/
│   ├── 01-product-requirements.md
│   ├── 02-technical-architecture.md
│   ├── 03-agent-specification.md
│   └── 04-implementation-plan.md
└── tests/                             # 跨包/独立消费测试按需加入
```

`metadata.json` 是推荐的最小纯数据格式；如果某一实现愿意使用 TS 元数据，也必须提供不执行实验代码的提取与校验过程。此处推荐 JSON 主要为了隔离构建/内容发现与任意实验执行，而非为了配置复杂化。

## 5. 最小实验契约（Contract v0.1）

**必须**：稳定 `id`、`title`、`summary`、`maturity`、`runtimeStatus`、可公开展示的素材指针（可选）、说明路径或摘要；当且仅当实验可运行时提供 `entry`。

示例元数据（说明性的初稿，而非已实现协议）：

```json
{
  "schemaVersion": 1,
  "id": "radar-scan",
  "title": "Radar Scan",
  "summary": "旋转扫描视觉实验",
  "maturity": "prototype",
  "runtimeStatus": "runnable",
  "entry": "./main.ts",
  "cover": "./media/actual-render.webp",
  "referenceVisibility": "private",
  "tags": ["scan", "animation"]
}
```

注意：状态字面量可以在实施时统一，不能仅依据开发者手写的 `runnable` 就在公开网站承诺运行正常。**元信息中的声明状态**和**构建/运行检查得出的事实**需要区分；展示中采用最新经验证的状态、验证时间和构建 revision。没有检查证据时应显示“未验证”。

### 5.1 实验运行入口约定（先松后紧）

在 A 阶段优先支持一种最小入口：由 Playground 创建/提供容器，实验收到入口上下文并返回可选清理函数或控制器。示意：

```ts
// 仅为协议草图；实际签名在首个真实实验后冻结。
type ExperimentModule = {
  mount(context: { container: HTMLElement }): Promise<void | (() => void)>;
};
```

不要求所有实验强制共享 `Cesium.Viewer`。如果特殊实验自己创建 Viewer，则必须自己销毁；如果使用宿主 Viewer，则按约定清理自己添加的对象、后处理、监听、定时器及场景设置。不强制所有实验支持暂停、时间定位、相机重置和可视化参数。

只有多个实验暴露重复需求后，再引入统一 `ViewerContext`、`ExperimentController`、参数 Schema 等接口。对于原型阶段，保留独立 HTML/路由入口的逃生通道。

## 6. 实验发现、公开状态与故障隔离

此部分解决 D-09 与 NFR-04 的冲突。

### 6.1 A 阶段：最简登记

首个实验允许手工维护一个很小的**静态实验目录**，不用为一个实验开发自动发现插件。目录记录与代码入口分开维护；无入口的实验仍能展示详情。

### 6.2 后续自动发现

当重复登记成为痛点时，引入构建前脚本扫描 `experiments/*/metadata.json`，校验 ID、字段、素材路径，输出**纯数据 Catalog** 和经过验证的可运行入口列表。Vite 的 `import.meta.glob` 可用于被选中的源码入口按需打包，但它**不是**“错误代码自动安全隔离”的保证。被 import 的错误模块仍可造成生产构建失败；必须在打包前独立校验/筛选，或使用按实验独立构建再合并成功产物的策略。

**建议的失败级别**：

- 元数据无效：CI 明确报错；在修复前沿用上一次可部署 Catalog 或人工降级，不把不可信内容上线。
- 元数据有效、实现缺失：公开实验详情，标 `Not Implemented`。
- 实现检查失败：独立报告/跳过其可执行入口，保留档案，标 `Unavailable`；全站构建不应被它拖垮。
- 浏览器运行时失败：展示错误边界和回退页面，撤销当前实验持有的可清理资源。
- 图形上下文严重故障：允许卸载/重新加载独立预览页；同一浏览器 GPU 进程故障无法仅靠 JavaScript 完全隔离。

部署策略应为“构建、预览验证成功后再发布”；构建失败不得取代目前可用的公开站点。

## 7. CesiumJS 集成要点

### 7.1 静态资源

CesiumJS 的 Workers、ThirdParty、Assets、Widgets 需要在目标站点可访问，`CESIUM_BASE_URL` 指向其部署路径且必须在依赖 Cesium 的模块加载前设置。选择能够在 Vite 构建时复制这些目录的方式，并验证本地、生产以及非根路径部署。注意静态 `import` 的执行顺序：不能在普通模块的静态 import 之后才给 `CESIUM_BASE_URL` 赋值，然后假设已生效；应使用有序引导模块/明确的打包集成方案。

基础 CSS（Cesium Widgets）仅由 Playground 自己导入，npm `effects` 不应通过隐式全局 CSS/DOM 依赖改变宿主应用。

### 7.2 默认离线友好的实验环境

首个实验以不依赖私有令牌、需付费地图服务或大型远程 3D Tiles 的可运行基础几何/简化场景为优先。需要 Cesium ion、影像、地形服务时，必须明确服务授权、公开客户端令牌限制与失败回退。公开环境里的前端环境变量属于可观察数据，不可当作保密机制。

### 7.3 Shader/后处理边界

- `CustomShader` 主要用于 `Model` 和 `Cesium3DTileset` 中适用的模型内容，其相关能力仍含实验性部分；与部分 3D Tiles Styling 组合可能出现未定义行为。
- `PostProcessStage` 用于屏幕空间渲染结果及深度相关处理；不是任意对象的材质替代品。
- 用户希望的视觉效果可能需不同技术路线；不要把所有实验强制套进一个 Material 或 Shader 框架。
- 资源所有权应清晰：`CustomShader.destroy()`、`Viewer.destroy()` 等须按 Cesium 文档及资源所属关系处理，避免提前或重复销毁仍在使用的对象。

## 8. UI 与交互架构

首版只需 `Gallery（可列出未完成档案）→ Experiment Detail（说明/参考）→ Viewer（如果可运行）→ 轻量 Controls`。优先桌面浏览器体验，但页面需支持较窄窗口的滚动与控制面板折叠。

- **Showcase** 是实验的默认状态数据，不强制为单独页面/模式。
- 可观察参数采用实验自有控制器或少量通用控件；没有参数就只展示画面。
- 图片/视频对比可先采用详情区域并排，前提是素材有权公开。
- 运行截图和封面必须标示为实际 CesiumJS 输出；示意图不得代替。
- 不将“场景切换”“时间轴调试”“完整动态组件框架”作为底层强制依赖。

## 9. npm 包设计原则（Milestone B）

建议公共名称为 `@cesiumlab/effects`，发布前检查 scope、版权声明和仓库归属。包应采用 ESM + TypeScript 声明及明确 `exports`；是否双格式 CJS 需消费场景证明，不默认增加维护成本。

- 将 `cesium` 作为 peer dependency 候选，避免宿主与库装入多份 CesiumJS；兼容版本范围依据测试结果确定，不能随意写 `*`。
- 可按效果提供独立导出；构建验证 tree-shaking，而非仅声称支持。
- API 优先表达可配置视觉行为：创建、更新、显示/隐藏（适用时）、销毁；对不适用的方法不强制全库统一。
- 不承诺任意模型或任意地形通用；明确效果依赖的对象类型、坐标空间、WebGL 能力和已验证 CesiumJS 版本。
- npm 包不得内置未经许可的大体积参考/演示素材、私有令牌或对 Playground 的依赖。

**示意 API（未承诺一定为最终形状）**：

```ts
import { createRadarScan } from '@cesiumlab/effects';

const effect = createRadarScan(viewer, { color: '#00ffff', radius: 500 });
effect.update({ radius: 800 });
effect.destroy();
```

实际函数、参数和销毁责任须由首个候选效果的实现决定；设计时优先考虑幂等清理、宿主对象所有权与参数校验。

## 10. 测试与质量证据架构

| 层次   | 目标                                        | 证据                                        |
| ------ | ------------------------------------------- | ------------------------------------------- |
| 静态   | TypeScript、ESLint、元数据校验              | 运行日志、版本、失败详情                    |
| 单元   | 参数计算、纯函数、状态更新                  | Vitest 结果                                 |
| 浏览器 | 真正加载 Viewer、资源可用、控制台错误       | Playwright/人工记录及实际截图               |
| 视觉   | 对照参考、指定相机与动画时刻、回归          | 已标明来源的实际渲染截图/视频，人工批准     |
| 稳定性 | 多次进入退出、错误恢复、资源清理            | 生命周期测试记录；不以无异常替代无泄漏证明  |
| 消费端 | 构建出来的 npm tarball 在独立项目安装并运行 | `npm pack` / tarball 安装、构建、浏览器检查 |

视觉测试使用固定设备/浏览器/渲染配置。Playwright 截图比较对硬件/操作系统/浏览器敏感，不用跨机器严格像素相等作为统一验收标准。性能仅记录同环境对照，不设未经校准的固定 FPS 承诺。

## 11. 安全、许可与发布

- 不提供匿名用户 JS 上传/执行；所有实验代码经仓库变更、审查和构建后才上线。即使由 Agent 编写，也属于可执行代码，需要依赖与安全检查。
- 参考素材与实验源代码分开管理公开许可；Git 仓库公开时也应避免提交无权再分发的文件，必要时使用外部受控存储或不入库，仅保留内部引用。
- 公开 URL 不得泄露私密令牌；使用 Cesium ion 等服务时配置公开客户端可用的受限令牌与配额监控。
- 实施前明确项目代码许可证（推荐评估 MIT/Apache-2.0，但**尚未定案**），npm 发布前必须确认仓库资产、第三方模型与许可证兼容。
- 发布候选进行包内容审查、类型测试、消费端验证；npm 的 scoped public package 需正确配置可见性。后续可采用 npm trusted publishing/OIDC 与 provenance；需先完成仓库及账号授权配置。

## 12. 架构决策记录（ADR 初稿）

| ID      | 决策                      | 说明                                            |
| ------- | ------------------------- | ----------------------------------------------- |
| ADR-001 | 纯 Web 优先               | 减少 Electron 负担，符合已确认需求              |
| ADR-002 | pnpm Monorepo             | `apps` 与 `packages` 长期可扩展，但不创建虚构包 |
| ADR-003 | 实验与正式 npm 包分离     | 兼顾自由视觉探索和稳定公共接口                  |
| ADR-004 | 元信息与运行入口分离      | 支持公开未完成实验并降低单实验故障风险          |
| ADR-005 | 先手工登记，后自动发现    | 避免为一个实验过早构建复杂插件体系              |
| ADR-006 | 优先按需加载实验          | 降低首屏开销与无谓 WebGL 初始化                 |
| ADR-007 | 不强制统一 Viewer/Runtime | 特殊实验保有技术自由度，统一能力从实践提炼      |
| ADR-008 | npm 包独立消费验证        | 防止 workspace 引用掩盖发布包缺陷               |
| ADR-009 | 视觉证据与用户批准分离    | AI 自检不能替代用户审美验收                     |

## 13. 暂缓决策与实施前确认项

- 项目 Git 远程、部署平台和域名（默认先以本地构建及预览验收，不阻塞 Milestone A）。
- CesiumJS、Node、pnpm、测试工具的固定兼容版本（实施时验证和锁定）。
- 项目代码许可证与 npm scope 所有权（**发布前阻断项**）。
- 首个实际视觉参考、允许公开的素材、动态行为和验收镜头（开始视觉复现前需有具体输入；目前无引用资产，不可伪造）。
- 自动发现和更严格的 Runtime 契约是否值得投入（出现第二、第三个实际实验后回顾）。

## 14. 已核验官方技术资料（2026-11-08）

- CesiumJS Quickstart 与 `CESIUM_BASE_URL`：https://cesium.com/learn/cesiumjs-learn/cesiumjs-quickstart/
- Cesium `CustomShader`：https://cesium.com/learn/cesiumjs/ref-doc/CustomShader.html
- Cesium `Cesium3DTileset`：https://cesium.com/learn/cesiumjs/ref-doc/Cesium3DTileset.html
- Cesium `PostProcessStage`：https://cesium.com/learn/cesiumjs/ref-doc/PostProcessStage.html
- Cesium `Viewer`：https://cesium.com/learn/cesiumjs/ref-doc/Viewer.html
- Vite Glob Import：https://vite.dev/guide/features
- pnpm Workspace：https://pnpm.io/workspaces
- Playwright Visual Comparisons：https://playwright.dev/docs/test-snapshots
- npm Scoped Public Packages：https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/
- npm Trusted Publishing：https://docs.npmjs.com/trusted-publishers/
