# 公开部署说明（Stage 4）

**结论：具备静态 Web 公开部署的技术条件；尚未选择托管平台，未执行部署，未获得公开部署批准。**

## 构建产物

```powershell
pnpm install
pnpm build
pnpm preview
```

- 产物：`apps/playground/dist/`
- 根路径预览：<http://127.0.0.1:4273/>
- 子路径构建：

```powershell
pnpm build:base
pnpm preview:base
```

子路径构建假设部署在 `/cesiumlab/`；若实际路径不同，需要同步修改 `apps/playground/vite.base.config.ts` 的 `base` 并重新执行完整检查。

## 部署前必须通过的检查

```powershell
pnpm check
pnpm test:e2e
pnpm test:e2e:base
pnpm test:e2e:dev
pnpm test:e2e:stage2
pnpm test:e2e:stage4
```

- `pnpm check`：format、lint、typecheck、unit、production build；
- `test:e2e`：Gallery、Smoke Test、刷新、归档详情、WebGL 回退、未知路由；
- `test:e2e:base`：`/cesiumlab/` 下 Cesium Workers/Assets/Widgets 的 URL；
- `test:e2e:dev`：Vite dev server 入口与资源；
- `test:e2e:stage2`：S2-001 实际 Cesium 渲染、时间序列与参数；
- `test:e2e:stage4`：公开 Playground 路由、直接访问、刷新、实验切换、归档和 Visual Approved Showcase。

失败时不得覆盖上一版本产物；应在 CI 中把构建/测试作为发布前置门。

## 静态资源

Cesium 的 Workers、ThirdParty、Assets、Widgets 由 `scripts/sync-cesium.mjs` 复制到 `public/cesium/`，构建时进入 `dist/cesium/`。这些资源：

- 不能由普通 JS 打包器替代；
- 必须保持目录结构和 MIME；
- 子路径部署必须通过 `CESIUM_BASE_URL` / `base` 保证 `/cesiumlab/cesium/...` 可访问；
- 需要正确的缓存头；带 hash 的 JS/CSS 可长缓存，`index.html` 应短缓存或不缓存。

## 安全与素材边界

- `.env.local` 不提交 Git；`VITE_CESIUM_ION_TOKEN` 是公开客户端 token，会进入浏览器 bundle；必须在 ion 侧限制资产和来源。
- `docs/stage2/.../target.png` 参考图不进入构建产物；公开 Gallery 只显示真实渲染截图与“参考不公开”说明。
- 构建产物不包含 `docs/` 或实验源码中的参考素材；仍建议部署前执行一次资源清单检查。
- 不应把任何私有 token、账号凭据、未授权图片/视频/模型放入 `public/` 或构建变量。
- 静态站点不需要执行访客提供的 JS；当前没有代码编辑器、Agent 或后端执行入口。

## 托管平台建议

静态站点适合 GitHub Pages、Cloudflare Pages 或 Vercel。选择平台前需要确认：

1. 是否支持 `/cesiumlab/` 子路径与 404 回退；
2. 是否允许 Workers/Assets 所需的 MIME、Range 请求和跨域策略；
3. 是否能配置 CSP、缓存和 HTTPS；
4. 是否有预览部署与失败不覆盖生产版本的机制。

当前**没有选定平台，也没有部署**；不能声称公开 URL 已可用。

## CSP / 缓存提示

CesiumJS 可能使用 WebGL shader、Workers、Blob URL、Cesium ion 请求。CSP 不能只照搬通用模板；必须在目标平台实际验证后再启用。建议从较宽松的 `default-src 'self'`、显式允许 ion 端点与必要 `blob:`/`worker-src` 开始，逐步收紧，并记录验证结果。当前仓库没有托管平台级 CSP 配置，因此此项是**未验证**。

## 部署判定

| 条件                                   | 状态                           |
| -------------------------------------- | ------------------------------ |
| 生产构建与预览                         | 通过                           |
| Gallery/路由/刷新/切换/归档            | 通过（Stage 4 Playwright）     |
| Cesium 资源根路径/子路径               | 通过（Stage 1 + base e2e）     |
| S2-001 Visual Approved Showcase        | 通过                           |
| 无参考原图/私密 token 进入 public 产物 | 仓库检查通过；部署前需再次扫描 |
| 托管平台、CSP、缓存、回滚机制          | 未选择/未验证                  |
| 公开部署授权                           | **未获得**                     |

因此当前状态是 **Ready for deployment review / not deployed**，不是“已上线”。
