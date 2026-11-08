# experiments

`experiments/` 存放可自由探索、允许专用场景的 CesiumJS 实验。每个实验一个目录，推荐结构：

```text
experiments/<slug>/
├── metadata.json   # 纯数据，构建阶段不执行实验代码
├── main.ts         # 可选运行入口；仅 runtimeStatus = "runnable" 时存在
├── README.md       # 技术笔记、验证记录、已知限制
├── assets/         # 已获授权、可公开的实验资源（可选）
└── references/     # 参考资料；公开前必须确认授权（可选）
```

当前登记方式为**手工登记**：

1. 在实验目录创建 `metadata.json`；
2. 在 `apps/playground/src/catalog/registry.ts` 的 `rawMetadata` 中加入元数据；
3. 若实验可运行，在 `runtimeLoaders` 中加入**显式**动态导入；未登记的入口不会进入构建。

`metadata.json` 使用 `apps/playground/src/catalog/schema.ts` 的校验规则。运行状态与成熟度分开：

- `maturity`: `idea` / `prototype` / `visual-approved` / `reusable` / `verified` / `published`
- `runtimeStatus`: `runnable` / `unavailable` / `not-implemented` / `error`

`runnable` 实验必须有 `entry`；其他状态必须省略 `entry`。运行状态是声明，实际验证记录写入 `verification`，不要用手写状态代替浏览器检查。

## 共享启动工具

`experiments/cesium.ts` 提供 `loadCesium()`：只执行一次动态 `import('cesium')`，并在返回前把根目录 `.env.local` 中的公开客户端 token 写入 `Cesium.Ion.defaultAccessToken`。实验应使用它加载 Cesium，以保证 `CESIUM_BASE_URL` 与 ion 配置在 Viewer 创建前生效。

```dotenv
# 仓库根目录 .env.local（gitignored）
VITE_CESIUM_ION_TOKEN=<public client token>
```

前端 token 会进入浏览器 bundle，不是秘密；应限制资产与来源。

## 当前实验

| ID                          | 类型              | 状态            | 说明                                  |
| --------------------------- | ----------------- | --------------- | ------------------------------------- |
| `earth-network-convergence` | visual-experiment | runnable        | S2-001 夜间地球光网汇聚，等待视觉验收 |
| `cesium-smoke-test`         | smoke-test        | runnable        | 中性工程烟雾测试，不是视觉实验        |
| `awaiting-visual-reference` | visual-experiment | not-implemented | 参考接收历史记录，实际实验见 S2-001   |

`earth-network-convergence` 当前为 **Prototype / Awaiting Visual Review**，没有 Visual Approved。Smoke Test 仍只用于工程验证。
