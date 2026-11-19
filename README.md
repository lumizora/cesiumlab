# Cesiumlab

一个 pnpm 工作区。公开 npm 库在 `packages/`，其运行示例在 `apps/playground/`。Playground 通过 `workspace:*` 依赖库，并从包名导入公开构建产物。

## 运行

使用 Node.js 24.14+（24.x）与 pnpm 12.8.1。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

开发地址为 <http://127.0.0.1:5175/>。本地底图随 CesiumJS 分发，无需在线影像或 ion token。

```sh
pnpm test
pnpm build
pnpm --filter @cesiumlab/playground preview
```

生产预览地址为 <http://127.0.0.1:4175/>。静态产物位于 `apps/playground/dist/`，使用相对资源路径。

## 添加功能

1. 在 `packages/effects/src/` 实现功能，只有供使用者调用的 API 才从 `index.ts` 导出。
2. 在 `apps/playground/src/demos/` 写示例，从 `@cesiumlab/effects` 导入，并在 Playground 中展示。
3. 包源码改动后运行 `pnpm --filter @cesiumlab/effects build`。需要持续修改时，可以在另一个终端运行 `pnpm --filter @cesiumlab/effects exec tsc --watch`。

[飞线 API](packages/effects/README.md)包含参数、资源所有权和适用范围。渲染底图为 Cesium 随附的 [Natural Earth 公共领域数据](https://www.naturalearthdata.com/about/terms-of-use/)。
