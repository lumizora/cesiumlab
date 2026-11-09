# Stage 4.5 · Public Deployment Readiness Report

**日期：2026-11-09**
**状态：首次 GitHub Pages 部署完成。**
**公开站点：<https://lumizora.github.io/cesiumlab/>**
**部署 Commit：`0de165e5d4013090307643a2b99895c61d19e334`**
**Workflow run：`42557732534`（success）**
**GitHub：`lumizora/cesiumlab`（public，默认分支 `main`，MIT）**

## 1. 推荐托管平台

**GitHub Pages + GitHub Actions（手动触发）** 是当前首选：

- 站点是纯静态 Vite 产物，无后端、无数据库、无运行时服务；
- Hash Router 的独立实验 URL 不需要服务器重写；
- pnpm Monorepo 与现有 `build:base` 已能生成 `/cesiumlab/` 子路径产物；
- GitHub Actions 可复用现有 `pnpm check`，并支持手动审批与环境保护；
- 不引入额外平台账号、构建服务或后台。

**GitHub Pages 的限制：**

- 不能自定义响应头，无法可靠配置严格 CSP、`X-Frame-Options`、`Permissions-Policy` 或自定义 `Cache-Control`；
- 私有仓库使用 Pages 受 GitHub 计划限制；
- CDN 缓存与回滚依赖 GitHub Pages 部署历史，不能按文件精细控制；
- 如果后续要求严格安全响应头或精细化缓存，应改用 **Cloudflare Pages**（自定义 headers）或 Vercel；当前不需要为此改造架构。

## 2. 公开 URL 与仓库状态

**实际仓库：**<https://github.com/lumizora/cesiumlab>
**Owner / repository：**`lumizora` / `cesiumlab`
**默认分支：**`main`
**可见性：**public
**远程 HEAD：**`0de165e`（已推送）
**MIT LICENSE：**已合并并推送（merge commit `33be77e`）
**Actions variable：**`CESIUM_ION_TOKEN` 已配置
**Pages：**`build_type=workflow`，HTTPS enforced
**Environment：**`github-pages`，required reviewer `lumizora`，branch policy `main`

公开 Playground URL：

```text
https://lumizora.github.io/cesiumlab/
```

目标 base path 为 `/cesiumlab/`；workflow 使用 `github.event.repository.name` 自动生成 `/<repository>/`。

首次部署详情见 [`docs/evidence/deployment/`](./evidence/deployment/)。

## 3. 实际部署配置

- `.github/workflows/deploy-pages.yml`
  - 仅 `workflow_dispatch`，**没有 push-to-production**；
  - 必须输入 `DEPLOY` 才继续；
  - 先执行 `pnpm check`，再 `build:base`，再执行产物安全检查；
  - 使用 `actions/configure-pages`、`upload-pages-artifact`、`deploy-pages`；
  - `github-pages` environment 可配置 Required reviewers；
  - concurrency `github-pages` 防止并发发布。
- `apps/playground/vite.base.config.ts`
  - 支持 `DEPLOY_BASE_PATH` 环境变量；默认 `/cesiumlab/`；
  - workflow 注入 `/<repository>/`。
- `apps/playground/public/.nojekyll`
  - 防止 GitHub Pages 的 Jekyll 处理影响 Cesium 静态资源。
- `apps/playground/scripts/check-dist.mjs`
  - 检查 `index.html` base、`.nojekyll`、Cesium `Workers/Assets/Widgets/ThirdParty`；
  - 检查禁止的 `target.png`、`docs/stage2`、`.env*`、source map、源码入口引用。
- `apps/playground/scripts/check-dist.mjs` 命令已接入 `pnpm check:dist`。

## 4. 构建、测试与安全检查

已实际执行：

| 检查                           | 结果                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `pnpm check`                   | 通过（format / lint / typecheck / 23 unit / build）                           |
| `pnpm test:e2e:stage4`         | 1 passed（Gallery / 直达 URL / 刷新 / 切换 / 归档 / 未知路由）                |
| `pnpm test:e2e:base`           | 1 passed（`/cesiumlab/` Workers/Assets）                                      |
| `pnpm build:base`              | 通过，产物 357 files / 12.57 MiB                                              |
| `pnpm check:dist`              | 通过：Cesium 资源、base path、无 `target.png`/`docs/stage2`/`.env`/source map |
| 自定义 base `/cesiumlab-test/` | 构建与产物检查通过                                                            |
| S2-001 回归控制帧              | RMSE 0.00928814（约 0.93%），差异集中在星空/AA 高频像素，结构/色彩一致        |

生产产物检查不包含：

- 未授权参考图 `target.png`；
- 未跟踪的 `docs/stage2/` 任务包；
- `.env.local` 或环境文件；
- source map；
- 任何 `docs/` 目录内容。

### Cesium ion Token

- 已在本地 `.env.local` 使用本次提供的 token 验证；`.env.local` 不提交 Git；
- token 是**公开客户端 token**，构建时会进入浏览器 bundle，不能当成秘密；
- 已验证 ion assets `1`、`2`、`3` 的 endpoint 均返回 HTTP 200；Stage 2 实际加载 `terrain=world-terrain`，未退化为椭球；
- 已设置仓库 Actions variable `CESIUM_ION_TOKEN`，workflow 构建时注入；`.env.local` 仅本地使用，不提交；
- 需在 ion 账户侧限制允许来源和资产；本仓库无法从 JWT 本身证明完整 scope，**公开部署前必须人工复核该 token 不是管理 token**；
- 公开部署前必须复核资产权限与计费影响。

## 5. 首次部署执行记录

| 步骤              | 结果                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Push              | `27e9ef9..0de165e`，非强制，成功                                                         |
| Pages source      | GitHub Actions (`build_type=workflow`)                                                   |
| Environment       | `github-pages`，required reviewer `lumizora`，`prevent_self_review=false`，branch `main` |
| Workflow          | run `42557732534`，build 与 deploy 均 success                                            |
| Checkout          | 首次使用短 SHA 失败（被视为 branch）；改用完整 40 位 SHA 成功                            |
| 实际构建 revision | `0de165e`（artifact JS 与页面 header 均可验证）                                          |
| Artifact          | 357 files / 12.57 MiB，base `/cesiumlab/`                                                |
| 部署时间          | 2026-11-09T03:47:30Z                                                                     |
| 公网冒烟          | HTTP 200；Gallery 3 / Visual Approved 1；World Terrain；0 console/page/failed requests   |
| 视觉回归          | 公网控制帧 RMSE `0.0103965`（约 1.04%），差异集中在星空/AA 高频像素                      |
| 回滚 tag          | `deploy-2026-11-09-0de165e`                                                              |

**当前没有阻塞部署的工程项。**ion token 的来源/资产限制仍需在 Cesium ion 控制台复核；GitHub Pages 不支持自定义安全响应头。

## 6. 回滚方法

- 稳定 tag：`deploy-2026-11-09-0de165e`；
- workflow 的 `ref` 输入支持历史 commit/tag；rollback 时手动 dispatch 该稳定 ref，并再次输入 `DEPLOY`；
- GitHub Pages environment 保留部署历史，可在 GitHub UI 重新部署上一稳定版本；
- artifact retention 30 天；超过期限必须用同一 ref/lockfile 重新构建；
- 风险：GitHub Pages CDN 可能有短时缓存延迟；不能像自定义服务器一样即时按文件回滚。

## 7. `docs/stage2` 处理

`docs/stage2/` 是用户提供的任务包/参考输入，当前未跟踪、未提交、未进入 public 构建。已在 `.gitignore` 中显式忽略，避免误提交。

若未来需要把它作为历史资料提交，必须先检查：

- 参考图/素材的授权与公开范围；
- 是否包含个人信息、token 或第三方限制；
- 是否需要只保留说明而不提交原图。

当前结论：**保持本地未跟踪；不进入 public 产物；不自动提交。**

## 8. 结论

**首次 GitHub Pages 部署已完成并通过公网冒烟。**

- 公开 URL：<https://lumizora.github.io/cesiumlab/>；
- 部署 Commit：`0de165e`；
- Workflow run：`42557732534`；
- 回滚 tag：`deploy-2026-11-09-0de165e`；
- S2-001 公网 Showcase 加载 World Terrain，控制帧 RMSE 约 1.04%，无 console/page/failed request；
- GitHub Pages 不提供自定义 CSP/安全响应头；严格 CSP 需求应改用 Cloudflare Pages/Vercel。

公开部署已完成；未发布 npm，未进入 `packages/effects` 通用化。
