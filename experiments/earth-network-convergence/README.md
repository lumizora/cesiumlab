# Earth Network Convergence

**S2-001 · 夜间地球 · 中国区域光网汇聚**
**状态：Prototype / Awaiting Visual Review**
**不是最终 npm API，也不是已通过视觉验收的成果。**

## 视觉目标

以 `docs/stage2/.../target.png` 为唯一视觉参考（仅内部研发使用），在真实 CesiumJS 3D 地球上实现：

- 深蓝夜间地球与冷色大气边缘；
- 青蓝色中国边界/省界光网；
- 上海附近的金色中心与多层同心环；
- 至少 6 条金色空间弧线从分散节点向中心汇聚，沿线有流动光点；
- 至少 6 个青蓝节点，带扩散环；其中至少 4 个有竖向光束；
- 默认固定机位、可交互旋转缩放、可重置 Showcase。

参考 PNG 没有作为场景背景或材质贴图使用。

## 数据与素材来源

| 素材         | 来源                                                             | 许可 / 说明                                                                                              |
| ------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 夜景地球纹理 | `three-globe` 示例资源 `earth-night.jpg`（4096×2048）            | 仓库 MIT；底层夜景灯光数据通常来自 NASA Black Marble。公开部署前需再次核验原始影像归属与 NASA 使用条款。 |
| 中国边界     | Natural Earth 1:50m `admin_0_countries`（CHN / TWN / HKG / MAC） | Public domain。边界描绘遵循 Natural Earth，不是对争议边界或主权的裁定。                                  |
| 省界         | Natural Earth 1:50m `admin_1_states_provinces_lines`（CHN）      | Public domain。                                                                                          |
| 地形         | Cesium World Terrain（可选 ion）                                 | 通过本地 `.env.local` 的公开客户端 token；无 token 时回退椭球。                                          |
| 城市坐标     | 公开常见 WGS84 城市中心坐标                                      | 仅用于视觉演示；未作为权威地理数据。                                                                     |

Natural Earth 下载：

- <https://www.naturalearthdata.com/downloads/50m-cultural-vectors/>

## 实现

- `main.ts`：Viewer、夜景图层、可选地形、大气、Bloom、相机、参数面板、生命周期清理；
- `network.ts`：边界/省界、7 个蓝色节点、7 条金色弧线、上海中心、CallbackProperty 动画；
- `geo.ts`：本地 GeoJSON 解析；
- `textures.ts`：运行时生成白色径向辉光贴图，用于 billboard 着色；
- `controls.css`：实验自有最小控制面板。

动画设计假设（非参考图可证明事实）：

- 金色光点沿弧线**由节点向中心**移动，各路线相位不同；
- 蓝色节点环向外扩散并衰减；
- 蓝色节点环：每个节点约 2.5s 一轮，持续向外扩散、淡出，各节点相位错开；
- 金色中心脉冲：由光点抵达事件触发，单次约 1.3s，ease-out 单环冲击波；激活期间的新抵达合并/节流，不做持续“呼吸”；
- 中心静态同心环作为基线，不参与持续脉冲；
- 默认镜头固定，不自动绕地球旋转。

## 运行

```powershell
pnpm dev
# 打开 http://127.0.0.1:5273/#/experiments/earth-network-convergence
```

纯净 Viewer 截图模式（隐藏站点 UI 与控件，保留真实 Viewer）：

```text
http://127.0.0.1:5273/?capture=1#/experiments/earth-network-convergence
```

节点环近景 QA 预设（仅用于检查几何）：

```text
http://127.0.0.1:5273/?capture=1&focus=node#/experiments/earth-network-convergence
```

生产预览：

```powershell
pnpm build
pnpm preview
```

## 参数

- `routeColor`：金色飞线/中心颜色；
- `routeSpeed`：光点流动速度；
- `nodeColor`：节点、边界、光束颜色；
- `glowIntensity`：Bloom 强度；
- `pulseSpeed`：蓝色节点环扩散速度；金色中心脉冲固定为单次 1.3s；
- `showBorders`：显示/隐藏边界与省界；
- `resetShowcase`：恢复默认相机、参数与动画时间。

## 验证记录

2026-11-08 已在 Windows 10 + Microsoft Edge 157（Chromium，headless）+ NVIDIA GTX 1070 Ti / ANGLE D3D11 实际运行：

- `pnpm test:e2e:stage2` 通过；
- 1672×941 纯净主截图与 `t=0/2/5/10s` 时间序列；
- 控制台 0 error、0 page error、0 失败请求；
- 重进实验后 canvas 数为 1；
- 证据：`docs/evidence/stage-2/`。

这仍是 Agent 自检，不是用户视觉验收。

## 已知限制

- 参考为 AI 生成的静态概念图；动画方向/周期是设计假设，不能声称是参考视频事实。
- Natural Earth 边界不是权威争议边界数据；台湾作为 Natural Earth 独立单元绘制，并保留来源说明。
- 夜景纹理是单幅 4096×2048 影像，近看会糊；省界与边界不是测绘级精度。
- 节点光束底部按当前地形/椭球高度近似放置，极端视角可能看出穿地或悬浮。
- Bloom、边缘辉光、色调为实时近似，未做像素级匹配。
- 未验证 Firefox/Safari/移动端；当前证据使用 Edge/Chromium + NVIDIA D3D11。
- **未获得用户视觉批准**；不得进入 Stage 3 通用化或 npm 发布。
