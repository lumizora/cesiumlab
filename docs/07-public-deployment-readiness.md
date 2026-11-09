# Stage 4.5 · Public Deployment Readiness Report

**日期：2026-11-09**
**状态：准备完成，等待用户公开部署批准。**
**未部署、未触发 GitHub Actions、未发布 npm。**

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

## 2. 预计公开 URL

GitHub Pages 项目站点格式：

```text
https://<owner>.github.io/<repository>/
```

当前工作目录没有配置 Git remote，因此 **owner/repository 尚未确定**。如果仓库名为 `cesiumlab`，对应：

```text
https://<owner>.github.io/cesiumlab/
```

目标 base path 为 `/cesiumlab/`；实际部署使用 workflow 中的 `github.event.repository.name` 自动生成 `/<repository>/`，不把 owner/repo 硬编码进源码。若仓库改名，不需要改代码。

## 3. 实际部署配置

新增/修改：

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

- `.env.local` 不提交 Git；
- token 是 **公开客户端 token**，构建时会进入浏览器 bundle，不能当成秘密；
- GitHub Actions 默认不注入 token；部署时若配置 repository variable `CESIUM_ION_TOKEN`，则构建注入；没有时运行本地 grid/ellipsoid 回退；
- 建议为公开部署创建单独的低权限公开 token，并按来源/资产限制；
- 公开部署前必须复核该 token 的资产权限与计费影响。

## 5. 部署尚需完成的操作

1. 配置 Git remote，创建/确认 GitHub 仓库名与 owner；
2. 在仓库 Settings → Pages 选择 **GitHub Actions** 作为 source；
3. 在 `github-pages` environment 配置 Required reviewers（建议至少本人）；
4. 如需 ion 地形/影像，在 Actions Variables 设置 `CESIUM_ION_TOKEN`（公开客户端 token，不是 secret 优先级）；
5. 手动运行 `Deploy Playground to GitHub Pages`，输入目标 ref 和 `DEPLOY`；
6. 在公网 URL 进行人工冒烟：Gallery、直达 URL、刷新、S2-001 加载、Cesium 资源 200；
7. 记录首次部署 revision 与 URL；
8. 若平台无法满足安全头/CSP 要求，切换到 Cloudflare Pages/Vercel 再验证。

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

**建议在完成 GitHub 仓库/Pages/environment reviewer 配置后批准公开部署。**

GitHub Pages 对当前静态、Hash Router、无后端的 Playground 足够；主要未验证项是真实 Pages 环境下的 MIME/缓存/CSP、ion 端点与公网人工冒烟。若必须使用严格安全响应头，优先 Cloudflare Pages。

当前仍停留在 **Awaiting Public Deployment Approval**。
