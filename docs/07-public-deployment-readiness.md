# Stage 4.5 · Public Deployment Readiness Report

**日期：2026-11-09**
**状态：准备完成，等待用户公开部署批准。**
**未部署、未触发 GitHub Actions、未发布 npm。**
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
**远程 HEAD：**`27e9ef9`（Initial commit，仅 `LICENSE`）
**本地状态：**完整实现 + 证据 + MIT LICENSE 合并；尚未 push
**MIT LICENSE：**已合并（远程 `27e9ef9`，本地 merge commit `33be77e`）
**Actions variable：**`CESIUM_ION_TOKEN` 已配置（公开客户端 token；仅 workflow 使用）

预计 Playground URL：

```text
https://lumizora.github.io/cesiumlab/
```

目标 base path 为 `/cesiumlab/`；workflow 使用 `github.event.repository.name` 自动生成 `/<repository>/`，不把 owner/repo 硬编码进源码。

**重要阻塞：**本地源码尚未 push 到 `origin/main`。在推送前，公开仓库只有 LICENSE；workflow、应用源码与证据都不在默认分支，无法触发 Pages 部署。

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

## 5. 部署尚需完成的操作

**当前阻塞：**

1. 本地完整源码尚未 push 到公开 `origin/main`；workflow 不在默认分支，GitHub 无法手动触发；
2. GitHub Pages 尚未启用（API `has_pages=false`）；
3. 仓库没有 `github-pages` environment，因此没有 Required reviewers；
4. 远程仓库目前只有 `LICENSE`，push 后整个源码、证据截图、视觉基准与 `night-earth.jpg` 等已授权资产会公开，需要用户确认公开范围。

**已准备：**

- `CESIUM_ION_TOKEN` Actions variable 已配置，token 的 assets 1/2/3 endpoint 已验证；
- workflow、base path、artifact 检查、rollback ref 已准备；
- 本地 `pnpm check`、Stage 4 e2e、base e2e、`check-dist` 与视觉回归通过。

**需要用户确认/执行：**

1. 确认公开范围：推送后整个源码、证据截图、视觉基准与 `night-earth.jpg` 等已授权资产会公开；
2. 执行 `git push origin main`（需要用户明确批准）；
3. 在 Settings → Pages 选择 **GitHub Actions**；
4. 在 Environments 创建 `github-pages` 并配置 Required reviewers；
5. 手动运行 `Deploy Playground to GitHub Pages`，`ref` 使用最终准备 Commit SHA，输入 `DEPLOY`；
6. 在公网 URL 人工冒烟：Gallery、直达 URL、刷新、S2-001、Cesium Workers/Assets/Widgets、ion 地形；
7. 记录首次部署 revision/URL；
8. 若要求严格 CSP/安全头，改用 Cloudflare Pages/Vercel 并重新验证。

## 6. 回滚方法

- workflow 的 `ref` 输入支持历史 commit/tag；rollback 时手动 dispatch 该稳定 ref，并再次输入 `DEPLOY`；
- GitHub Pages environment 保留部署历史，可在 GitHub UI 重新部署上一稳定版本；
- artifact retention 30 天；超过期限必须用同一 ref/lockfile 重新构建；
- 风险：GitHub Pages CDN 可能有短时缓存延迟；不能像自定义服务器一样即时按文件回滚；
- 发布前应保留上一稳定 commit/tag，并避免在同一 commit 上做不兼容资源变更。

## 7. `docs/stage2` 处理

`docs/stage2/` 是用户提供的任务包/参考输入，当前未跟踪、未提交、未进入 public 构建。已在 `.gitignore` 中显式忽略，避免误提交。

若未来需要把它作为历史资料提交，必须先检查：

- 参考图/素材的授权与公开范围；
- 是否包含个人信息、token 或第三方限制；
- 是否需要只保留说明而不提交原图。

当前结论：**保持本地未跟踪；不进入 public 产物；不自动提交。**

## 8. 结论

**建议在完成公开范围确认、push、Pages/environment 配置后批准首次部署。**

GitHub Pages 对当前静态、Hash Router、无后端的 Playground 足够；主要未验证项是真实 Pages 环境下的 MIME/缓存/CSP、ion 端点与公网人工冒烟。若必须使用严格安全响应头，优先 Cloudflare Pages。

当前仍停留在 **Awaiting Public Deployment Approval**，未 push、未启用 Pages、未触发 workflow。
