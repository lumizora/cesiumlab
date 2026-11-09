# Earth Network Convergence

**S2-001 · 夜间地球 · 中国区域光网汇聚**
**状态：Visual Approved（用户批准：2026-11-08；基线 revision `e5da645`）**
**不是最终 npm API；未进入通用化封装。**

## 视觉目标

以 `docs/stage2/.../target.png` 为唯一视觉参考（仅内部研发使用），在真实 CesiumJS 3D 地球上实现：

- 深蓝夜间地球与冷色大气边缘；
- 青蓝色中国边界/省界光网；
- 上海附近的金色中心与多层同心环；
- 7 条真实三维金色空间弧线从分散节点向中心汇聚，弧高随路径长度变化；
- 每条弧线有金白色流动光点与沿真实轨迹弯曲的渐隐拖尾；
- 至少 6 个青蓝节点，带扩散环；其中至少 4 个有竖向光束；
- 默认固定机位、可交互旋转缩放、可重置 Showcase；
- 可调飞线颜色/透明度/光点亮度/拖尾长度/速度/弧高，并可暂停动画。

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
- `network.ts`：边界/省界、7 个蓝色节点、7 条金色三维弧线、上海中心、CallbackProperty 动画；
- `geo.ts`：本地 GeoJSON 解析；
- `textures.ts`：运行时生成白色径向辉光贴图，用于 billboard 着色；
- `controls.css`：实验自有最小控制面板。

飞线技术路线：

- 用 `EllipsoidGeodesic` 插值 97 个真实经纬度/高度采样点，而不是屏幕二维连线；
- 弧顶高度取 `max(320km, distance × 0.28)`，不同线路高度不同；`arcHeightScale` 实时缩放；
- 基础弧线为细的半透明金色 `PolylineGlow`，持续可见；
- 光点为金白色 point + 径向辉光 billboard，沿采样点的插值位置运动；
- 拖尾是**单条连续 `PolylineGlow`**，从尾部到头部 24 个采样点，使用 `taperPower` 使尾部渐隐、头部保持亮度；并非整条线路同步高亮；
- 光点进入/离开时用短 envelope 淡入淡出，避免复位跳变；
- 7 条线路以 `index × 0.13` 的相位错开，飞行时间按 `3 + distance / 3,000,000` 计算，约 3–5s。

节点能量光束技术路线：

- 用 3 层堆叠 billboard 构成光束：亮白核心 36 个、内层青蓝光晕 30 个、外层柔和光晕 24 个；
- 三层沿真实三维高度分布，越靠上尺寸越小、透明度按指数下降，顶部透明度归零，不会突然截断；
- 使用径向辉光纹理 + `scaleByDistance`：近景适度放大、远景缩小，模拟透视；
- 每个节点有独立高度/亮度系数与呼吸相位；呼吸周期约 7s，默认幅度很小；
- 底部叠加柔光 billboard，与节点核心自然衔接；
- 不同观察角度下，光束锚定在节点三维位置；但 billboard 始终面向相机，属于“相机朝向的体积近似”，不是真正的体积光/Shader 光线步进。

动画设计假设（非参考图可证明事实）：

- 金色光点沿弧线**由节点向中心**移动，各路线相位不同；
- 蓝色节点环持续循环：每节点 3 圈错位光环，约 0.8s 生成一圈、单圈 2.4s，任意时刻约 2–3 圈同时可见；不同节点初始相位不同；
- 金色中心持续存在 3 圈交错的环境波纹：约 1.07s 生成一圈、单圈 3.2s；中心脉冲由光点抵达事件触发，额外释放 2 圈约 1.3s 的强脉冲，环境波纹不中断、不重置；
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

确定性视觉回归预设（暂停 t=0、强制椭球地形；不改变默认 Showcase）：

```text
http://127.0.0.1:5273/?capture=1&paused=1&terrain-off#/experiments/earth-network-convergence
```

生产预览：

```powershell
pnpm build
pnpm preview
```

## 参数

- `routeColor`：金色飞线/中心颜色；
- `routeSpeed`：光点飞行速度，同时改变抵达/出发节奏；
- `baseArcOpacity`：基础弧线透明度；
- `pointBrightness`：光点与拖尾亮度；
- `trailLength`：拖尾长度（占整条弧线的比例）；
- `arcHeightScale`：弧线高度倍率；
- `beamHeight`：光柱高度；
- `beamCoreWidth`：明亮核心宽度；
- `beamGlowWidth`：外围光晕宽度；
- `beamIntensity`：底部/整体亮度；
- `beamBreathingSpeed`：呼吸速度；
- `nodeColor`：节点、边界、光束颜色；
- `glowIntensity`：Bloom 强度；
- `pulseSpeed`：蓝色节点 3 圈事件波纹的速度；金色中心环境波纹固定约 3.2s/圈，强脉冲固定约 1.3s；
- `showBorders`：显示/隐藏边界与省界；
- `pause`：暂停/继续所有飞线、节点环与中心脉冲；
- `resetShowcase`：恢复默认相机、参数、暂停状态与动画时间。

## 验证记录

2026-11-08 已在 Windows 10 + Microsoft Edge 157（Chromium，headless）+ NVIDIA GTX 1070 Ti / ANGLE D3D11 实际运行：

- `pnpm test:e2e:stage2` 通过；
- 1672×941 纯净主截图与 `t=0/2/5/10s` 时间序列；
- 拖尾、光点、节点多环扩散、中心环境波纹与抵达强脉冲的实际画面已检查；
- 节点光柱在默认视角、旋转侧视角与近景下的层次/宽度/顶部消散已检查；
- 参数面板覆盖颜色/透明度/亮度/拖尾长度/速度/弧高/光束高度/核心宽度/光晕宽度/光束亮度/呼吸速度/暂停；
- 控制台 0 error、0 page error、0 失败请求；
- 重进实验后 canvas 数为 1；
- 证据：`docs/evidence/stage-2/`。

这仍是 Agent 自检记录；用户已于 2026-11-08 完成视觉验收并批准该基线。后续通用化仍需用户明确指示。

## 已知限制

- 参考为 AI 生成的静态概念图；动画方向/周期是设计假设，不能声称是参考视频事实。
- 拖尾使用 `PolylineGlow` 的 taper 近似，不是自定义逐顶点流体/体积拖尾；近看仍能看出线条与光点边界。
- 节点光柱由相机朝向的 billboard 堆叠而成，不是真正的体积光/Shader 光线步进；近景会看到层叠粒子感，极端侧视角下宽度是屏幕空间近似。
- 光点是屏幕空间 point/billboard，靠 bloom 融合；未做光学景深、运动模糊或真实体积光。
- Natural Earth 边界不是权威争议边界数据；台湾作为 Natural Earth 独立单元绘制，并保留来源说明。
- 夜景纹理是单幅 4096×2048 影像，近看会糊；省界与边界不是测绘级精度。
- 节点光束底部按当前地形/椭球高度近似放置，极端视角可能看出穿地或悬浮。
- 无 ion 或 ion 端点超时（6s）时回退椭球地形；此时地形起伏/遮挡与参考仍有差异。
- Bloom、边缘辉光、色调为实时近似，未做像素级匹配。
- 未验证 Firefox/Safari/移动端；当前证据使用 Edge/Chromium + NVIDIA D3D11。
- **未获得用户视觉批准**；不得进入 Stage 3 通用化或 npm 发布。
