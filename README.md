# Cesiumlab

一个由 Vite+ 管理的 pnpm 工作区。公开 npm 库在 `packages/`，API 文档和实时演示在 `packages-private/docs/`。依赖版本统一维护在 `pnpm-workspace.yaml` 的 catalog 中，文档站通过 `workspace:*` 依赖库。

## 运行

使用 Node.js 24.14+（24.x）与 pnpm 12.8.1。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

开发地址为 <http://127.0.0.1:5175/>。文档开发直接读取工作区内的库源码。本地底图随 CesiumJS 分发，无需在线影像或 ion token。

```sh
pnpm check
pnpm test
pnpm build
pnpm --filter @cesiumlab/docs preview
```

`pnpm check` 在整个工作区运行 Oxfmt、Oxlint 和 oxlint-tsgolint。`pnpm test` 由 Vitest 在工作区根目录发现并运行测试。运行 `pnpm exec vp fmt` 应用格式修复。已安装 Vite+ CLI 时，可以用 `vp install` 和 `vp add` 管理工作区依赖。

生产预览地址为 <http://127.0.0.1:4175/>。静态产物位于 `packages-private/docs/dist/`，使用相对资源路径。

## 添加功能

1. 在 `packages/effects/src/` 下为每个特效新建独立目录，只有供使用者调用的 API 才从 `src/index.ts` 导出。
2. 在 `packages-private/docs/` 写对应的 API 文档与示例，示例从 `@cesiumlab/effects` 导入。
3. 用 `pnpm dev` 实时预览源码改动。生产构建时由 Vite 生成 ESM，TypeScript 生成类型声明。

[飞线 API](packages/effects/README.md)包含参数、资源所有权和适用范围。渲染底图为 Cesium 随附的 [Natural Earth 公共领域数据](https://www.naturalearthdata.com/about/terms-of-use/)。

文档使用 React 19 和 [Astryx](https://astryx.atmeta.com/)，并通过 Tailwind CSS 布置页面。
