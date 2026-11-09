# Stage 5A · Reusable Effects Assessment

**日期：2026-11-09**
**范围：S2-001 特效代码审查与 `@cesiumlab/effects` 首轮通用化设计**
**状态：评估完成；未修改 S2-001，未创建包，未发布 npm。**

> 本报告只做代码审查与设计，不代表已经实现包 API。S2-001 的已批准视觉基线仍是
> [`visual-baselines/S2-001/`](./visual-baselines/S2-001/) 与已部署公网站点。

## 1. 结论摘要

| 候选            | 独立复用价值                           | 通用化风险                                        | 建议                                   |
| --------------- | -------------------------------------- | ------------------------------------------------- | -------------------------------------- |
| **Flowing Arc** | 高：任意两点间的三维流动弧线/光点/拖尾 | 中：测地线、拖尾方向、抵达事件、Bloom 依赖        | **进入首轮候选**，最高业务复用优先级   |
| **Node Ripple** | 高：任意 POI 的连续多环扩散            | 低：纯 Entity/Polyline，无场景贴图                | **进入首轮候选**，最低风险，先做       |
| **Hub Pulse**   | 中高：中心/枢纽的常态波纹与事件强脉冲  | 低到中：需要与 Node Ripple 区分语义；事件节流     | **进入候选**，在 Node Ripple 之后      |
| **Energy Beam** | 中高：节点全息光柱                     | 高：约 90 个 billboard/节点、Bloom 依赖、体积近似 | **有条件进入候选**，最后做并设性能门槛 |

**推荐实施顺序：**

```text
共享内部基础 → Node Ripple → Flowing Arc → Hub Pulse → Energy Beam
```

不建议把整个 `NetworkScene`、中国边界、夜景图层、相机、Bloom 或参数面板封装为
effects。它们是 S2-001 的**场景编排与宿主职责**，不是可复用特效。

## 2. 当前 S2-001 代码依赖分析

### 2.1 文件职责

| 文件                                                 | 当前职责                                                                | 与包边界的关系                           |
| ---------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------- |
| `experiments/earth-network-convergence/network.ts`   | 7 节点、7 飞线、中心波纹/脉冲、光束、边界；所有 Entity 与动画时钟       | 主要候选来源；也混有 S2 场景编排         |
| `experiments/earth-network-convergence/main.ts`      | Viewer、夜景 imagery、可选 World Terrain、大气、Bloom、相机、控件、清理 | 宿主职责，不应进入包                     |
| `experiments/earth-network-convergence/textures.ts`  | Canvas 生成白色径向辉光 data URL                                        | 可复用但应作为内部资源工具，不作为主 API |
| `experiments/earth-network-convergence/geo.ts`       | 中国边界/省界 GeoJSON 解析                                              | 数据/实验专用，不建议封装                |
| `experiments/earth-network-convergence/controls.ts`  | DOM 参数面板                                                            | Playground/实验 UI，不进入包             |
| `experiments/earth-network-convergence/controls.css` | 控件样式                                                                | 不进入包                                 |
| `experiments/contract.ts`                            | Playground 的实验 mount/cleanup 契约                                    | 与 effects 包无关                        |

### 2.2 关键调用链

```text
main.ts
  ├─ new Cesium.Viewer(...)                   // 宿主创建，line 65
  ├─ 夜景 imagery / 可选 terrain / 大气
  ├─ createNetworkScene(Cesium, viewer, ...)  // network.ts line 144
  │    ├─ viewer.entities.add(...)            // 所有视觉对象
  │    ├─ viewer.scene.globe.getHeight(...)   // 地形高度
  │    └─ scene.preRender.addEventListener(...) // 动画时钟，line 798
  ├─ scene.postProcessStages.bloom            // 全局辉光，line 162
  ├─ camera.lookAt(...)                       // 固定 Showcase 相机
  └─ cleanup()                                // 移除监听、Entity、Viewer
```

### 2.3 CesiumJS API 与耦合点

| 能力              | 使用方式                                              | 是否公共 API       | 包内可否独立                             |
| ----------------- | ----------------------------------------------------- | ------------------ | ---------------------------------------- |
| Entity 容器       | `viewer.entities.add/remove`                          | 是                 | 可改为 `EffectHost.entities`             |
| 动态位置/颜色     | `CallbackProperty`、`CallbackPositionProperty`        | 是                 | 可                                       |
| 弧线材质          | `PolylineGlowMaterialProperty`，含 `taperPower`       | 是                 | 可，但视觉与 Cesium 版本相关             |
| 圆弧几何          | 手算经纬度偏移 + `Cartesian3.fromDegrees`             | 是                 | 可抽内部 helper                          |
| 测地线            | `EllipsoidGeodesic`                                   | 是                 | 可                                       |
| 光点/光柱         | `BillboardGraphics`、`PointGraphics`、`NearFarScalar` | 是                 | 可，但 billboard 是屏幕朝向近似          |
| 动画时钟          | `scene.preRender` + `performance.now()`               | 是                 | 可，但每个 effect 需要独立 pause/destroy |
| 地形高度          | `viewer.scene.globe.getHeight()`                      | 是                 | 不应放入核心；调用方提供绝对位置         |
| Bloom             | `scene.postProcessStages.bloom`                       | 是，但宿主渲染状态 | 不由 effects 拥有                        |
| 相机/背景/imagery | Viewer/Scene 配置                                     | 是                 | 宿主职责                                 |

### 2.4 实体规模

按当前默认场景静态统计，约 **827 个 Entity**：

| 来源                                                              |    数量 |
| ----------------------------------------------------------------- | ------: |
| 节点：7 × 3 圈 Node Ripple                                        |      21 |
| 节点：7 × (billboard + point)                                     |      14 |
| 节点：7 × (3 层共 90 个 billboard + 1 个底部光晕)                 |     637 |
| 中心：3 个标记 + 3 个 ambient ring + 2 个 pulse ring + 1 个 flash |       9 |
| 飞线：7 × (2 条基础弧 + billboard + point + trail)                |      35 |
| 中国边界：19 条 × (halo + core)                                   |      38 |
| 省界：73 条                                                       |      73 |
| **合计**                                                          | **827** |

其中约 **650 个 billboard**，Energy Beam 约占 637 个。这个规模在桌面 Edge /
GTX 1070 Ti 的截图中可运行，但没有 FPS、帧时间或移动端数据；不能据此承诺
“任意场景可承受”。

### 2.5 当前实现的主要问题（针对通用化）

1. `network.ts` 同时包含四类特效、S2 节点/城市/中心数据、边界和路由调度，边界不清。
2. 所有动画共享一个 `animationSeconds` 与一个 `preRender`，独立 effect 不能单独暂停/销毁。
3. `Host` 直接是 `Viewer`；Node/Hub 读取 `globe.getHeight`，不能脱离地形设置复用。
4. 颜色、速度、尺寸通过共享 `NetworkState` 可变对象驱动，没有公共参数校验。
5. 所有对象由一个大 `destroy()` 清理；没有单模块幂等销毁。
6. 依赖 Bloom 与 S2 的夜景/大气/相机；独立项目直接搬运会明显改变观感。
7. 每帧大量 `CallbackProperty` 分配数组（圆环、弧线、拖尾），是可优化点，但不应在
   未测帧时间前贸然重写视觉路径。

## 3. 候选模块逐项评估

### 3.1 Node Ripple

**实现原理**

- 每个节点 3 个独立的 Entity polyline。
- 圆环由 `circlePositionsAt` 手算半径/经纬度偏移，`ArcType.NONE` 保持真实三维位置。
- 单圈 lifetime 2.4s，环间相位 1/3，节点相位 `nodeIndex * 0.17`；半径从 8% 到 100%
  的 90km，宽度从 1.3 增长到 3，颜色按 `(1 - progress)^1.25` 衰减，`PolylineGlow` 发光。
- 所有环共用节点颜色与 `pulseSpeed`。

**场景依赖**

- 依赖节点经纬度、地形高度（`globe.getHeight`）和 8km 抬升。
- 不依赖夜景纹理、中国边界、中心、飞线、Bloom；颜色/背景只影响观感。
- 依赖 `Viewer.entities` 和 Cesium `CallbackProperty`。

**独立生命周期**

高。一个实例可以独立创建、暂停、恢复、销毁；不需要其他三个效果。若把地形采样移到
调用方，核心只接收绝对 `Cartesian3` 位置，可完全独立。

**适合公开的参数**

| 参数        | 默认（保持 S2） | 说明                                         |
| ----------- | --------------- | -------------------------------------------- |
| `position`  | —               | 圆环中心的世界坐标（含高度）                 |
| `color`     | `#00a8ff`       | `Color` 或 CSS 字符串                        |
| `ringCount` | 3               | 同时存在的环数量                             |
| `maxRadius` | 90_000 m        | 最大半径                                     |
| `lifetime`  | 2.4 s           | 单圈寿命                                     |
| `phase`     | 0               | 初始相位，0..1                               |
| `speed`     | 1               | 时间倍率                                     |
| `lineWidth` | 1.3             | 起始线宽；增长曲线按 S2 固定，不暴露内部常量 |
| `glowPower` | 0.48            | 发光强度                                     |
| `segments`  | 64              | 圆环采样数                                   |
| `opacity`   | 0.58            | 起始透明度                                   |

> `position` 是圆环中心的绝对世界坐标；S2 适配层需要自行加地面高度 + 8km。

不建议公开每圈 phase、宽度增长常量、`(1-progress)^1.25` 等 shader 级细节；这些应由
视觉默认值固定，确有消费者需求再加高级选项。

**API draft**

```ts
const ripple = createNodeRipple(host, {
  position: Cartesian3.fromDegrees(121.47, 31.23, 8_000),
  color: '#00a8ff',
  ringCount: 3,
  maxRadius: 90_000,
  lifetime: 2.4,
  speed: 1,
});

ripple.setPaused(true);
ripple.setColor('#5eead4');
ripple.destroy();
```

**渲染状态冲突**

- 只添加透明 polyline，不改变 Scene/Globe/后处理全局状态。
- 与 Hub Pulse 共用 `PolylineGlow` 和半透明排序；多个重叠环会加色，但没有机制冲突。
- 如果宿主关闭 Bloom，环会更“细线”，但仍可见。
- `arcType: NONE` 必须保留，否则 Cesium 会尝试贴地，改变几何。

**性能与兼容性**

- 21 个环 × 64 段，约 1,365 个点/帧；CPU 可接受，但每帧重建数组会产生 GC。
- 不依赖纹理/DOM，可在无 DOM 的纯计算测试中覆盖数学部分。
- Cesium 1.147 的 Entity/PolylineGlow 公共 API；跨大版本需回归。
- 无移动端/Firefox/Safari 数据。

**视觉变化风险**

低到中：只要默认 radius/lifetime/width/颜色衰减与 S2 一致，环的几何与节奏可以保持。
若把 `position` 的“地面 + 8km”语义改成“绝对世界坐标”，必须在 S2 适配层显式加
8km，否则所有环会下移；这是最主要的迁移风险。

**结论：值得进入 `@cesiumlab/effects`，优先实现。**

### 3.2 Hub Pulse

**实现原理**

- 两层语义，不能合并：
  1. **Ambient**：3 圈连续环境波纹，lifetime 3.2s，半径 25km → 725km，始终存在。
  2. **Event pulse**：2 圈强脉冲，duration 1.3s，半径 25km → 785km，由抵达/手动触发；
     另有 0.5s 中心 flash。
- 触发时如果已 active 则合并，不叠加；ambient 不因事件重置。
- 使用与 Node Ripple 相同的圆环几何，但半径、时序、透明度、easing、线宽和 brightness
  完全不同。

**场景依赖**

- 依赖一个中心坐标和地面高度；当前硬编码上海。
- 不依赖飞线；抵达只是外部触发源。可独立作为“枢纽波纹”使用。
- flash 需要径向辉光纹理；可以把纹理作为可选输入。

**独立生命周期**

高。`trigger()`、`isActive()`、`triggerCount` 和 `destroy()` 足以独立使用。与
Node Ripple 共享内部圆环 helper，但公共 API 必须分开。

**适合公开的参数**

| 参数               | 默认（保持 S2） | 说明               |
| ------------------ | --------------- | ------------------ |
| `position`         | —               | 枢纽锚点           |
| `color`            | `#ffa31a`       | 环境波纹与脉冲颜色 |
| `ambientRingCount` | 3               | 环境环数量         |
| `ambientLifetime`  | 3.2 s           | 环境环周期         |
| `ambientMaxRadius` | 725_000 m       | 环境环最大半径     |
| `pulseRingCount`   | 2               | 事件环数量         |
| `pulseDuration`    | 1.3 s           | 事件时长           |
| `pulseMaxRadius`   | 785_000 m       | 事件最大半径       |
| `flash`            | true            | 是否带中心闪光     |
| `glowTexture`      | 内部默认        | 自定义白色辉光贴图 |
| `speed`            | 1               | 可选时间倍率       |
| `segments`         | 96              | 圆环采样数         |

Hub 的 ambient/pulse 高度是内部视觉常量（默认 11km/13km 抬升）；`position` 是地面
锚点，S2 适配层不要重复加中心标记的高度。

**API draft**

```ts
const hub = createHubPulse(host, {
  position: Cartesian3.fromDegrees(121.4737, 31.2304, groundHeight),
  color: '#ffa31a',
});

// 外部抵达事件调用；active 时返回 false 并合并
if (arcArrived) hub.trigger();

hub.isActive(); // boolean
hub.triggerCount; // readonly number
hub.destroy();
```

**渲染状态冲突**

- 与 Node Ripple 相同的透明 polyline 排序/加色问题；没有全局状态修改。
- Flash 是 billboard，`disableDepthTestDistance` 需要与 S2 一致；否则地形遮挡变化。
- 若宿主 Bloom 很强，脉冲会饱和；包不自动补偿。

**性能与兼容性**

- 仅 3 + 2 + 1 个对象；成本低。
- 事件节流逻辑简单，适合单元测试。
- 与 Node Ripple 共享 `circlePositionsAt`；应放内部 helper，不暴露 `createRing` 公共 API。

**视觉变化风险**

低到中：默认 radius/timing/easing 必须原样保留。把 ambient 与 pulse 强行合并成一个
`Ripple` mode 会让默认节奏和事件节流语义漂移，明确不建议。

**结论：值得进入候选；在 Node Ripple 之后实现，保持两个独立公共 API。**

### 3.3 Flowing Arc

**实现原理**

- `EllipsoidGeodesic` 在起终点间插值 97 个经纬度点；高度为
  `sin(π * fraction) * max(320km, distance * 0.28)`，因此是真实三维弧线。
- 每个方向两条基础 `PolylineGlow`（halo + core），一个 billboard + point 光点，
  一条 24 点 `PolylineGlow` 拖尾；拖尾用 `taperPower` 从尾到头渐隐。
- 进度 `((elapsed * speed) / duration + phase) % 1`；duration = 3 + distance / 3,000,000。
- 光点在进入/离开弧线时使用 0.035 的短 envelope 淡入淡出。
- 当前**没有** `onArrive` 回调；抵达由 `routeSchedules` 的 progress wrap 触发 Hub Pulse。

**场景依赖**

- 只依赖两个端点与一个 host；当前端点是 S2 城市 → 上海。
- 不依赖中国边界、夜景、中心或 Bloom 逻辑；Bloom 只影响亮度观感。
- 应把“抵达触发 Hub Pulse”留在消费端，而不是把 Hub 依赖写进 Arc。

**独立生命周期**

高。每个弧线可独立创建、暂停、重启、改颜色/速度/高度、销毁。多条弧线由调用方循环
创建；不需要先造一个 `FlowNetwork` 容器。

**适合公开的参数**

| 参数              | 默认（保持 S2）                  | 说明               |
| ----------------- | -------------------------------- | ------------------ |
| `from`, `to`      | —                                | `Cartesian3` 端点  |
| `color`           | `#ffa31a`                        | 飞线/光点/拖尾颜色 |
| `arcHeight`       | 自动 `max(320km, distance*0.28)` | 可覆盖             |
| `heightScale`     | 1                                | 弧线高度倍率       |
| `duration`        | 自动 `3 + distance/3e6` s        | 可覆盖             |
| `phase`           | 0                                | 初始进度偏移       |
| `speed`           | 1                                | 时间倍率           |
| `baseOpacity`     | 0.55                             | 基础弧透明度       |
| `pointBrightness` | 1                                | 光点/拖尾亮度      |
| `trailLength`     | 0.18                             | 拖尾占弧线比例     |
| `trailSegments`   | 24                               | 拖尾采样数         |
| `showBase`        | true                             | 是否显示基础弧     |
| `onArrive`        | —                                | 每圈到达回调       |
| `glowTexture`     | 内部默认                         | 光点 sprite        |

**API draft**

```ts
const arc = createFlowingArc(host, {
  from: Cartesian3.fromDegrees(87.6168, 43.8256),
  to: Cartesian3.fromDegrees(121.4737, 31.2304),
  color: '#ffa31a',
  trailLength: 0.18,
  onArrive: () => hub.trigger(),
});

arc.setPaused(true);
arc.setSpeed(0.8);
arc.setHeightScale(1.1);
arc.restart();
arc.destroy();
```

**渲染状态冲突**

- 多条弧线共享透明排序；光点使用 `disableDepthTestDistance: Infinity`，会在物体前
  显示，必须保留为明确视觉选择。
- `arcType: NONE` 是必须的；贴地路线不是该效果。
- Bloom 由宿主拥有；不设置全局后处理。

**性能与兼容性**

- 7 条弧线约 7 × (2 × 97 + 24 + 光点) 个动态点；可接受但比 Node Ripple 重。
- `PolylineGlow` 的 taper 方向依赖“尾 → 头”的顶点顺序；这是视觉实现约束，应写进文档。
- 端点高度/地形：当前按椭球面起点；通用 API 需要明确 `from/to` 的高度语义。
- Cesium 1.147 公共 API；测地线/材质行为需固定版本测试。

**视觉变化风险**

中：基础弧双线、拖尾 taper、envelope、duration 公式任一改变都会明显改变观感。
必须复制默认常量，并在独立 fixture 中与 S2 对照；不能只做“大致相似”的弧线。

**结论：最值得封装；复用价值最高，但列在 Node Ripple 之后以先验证包生命周期。**
（若以业务价值排序，Flowing Arc 是第一。）

### 3.4 Energy Beam

**实现原理**

- 每个节点 3 层 billboard 堆叠：
  - 核心 36 个（亮白偏节点色）；
  - 内层光晕 30 个；
  - 外层柔光 24 个。
- 每个 billboard 沿 8km → 520km 的高度分布；越靠上尺寸越小、透明度按
  `(1 - t)^1.35` 衰减；`NearFarScalar(700km, 2.8, 9,000km, 0.65)` + `scaleByDistance`。
- 独立 7s/8s 呼吸相位；底部再加一个柔光 billboard，与节点衔接。
- 每个节点使用不同高度/亮度系数；当前是 S2 的视觉编排。

**场景依赖**

- 只依赖节点位置/地面高度；不依赖城市/边界/中心/飞线。
- 光柱依赖白色径向辉光纹理与 Bloom 观感。
- 使用相机朝向 billboard，不是真体积光；近看有层叠粒子感。

**独立生命周期**

中高。一个节点一个 beam 实例，可独立 update/destroy；不需要其他效果。纹理若每个实例
各自生成会浪费，应支持共享 `glowTexture` 或内部缓存。

**适合公开的参数**

| 参数              | 默认（保持 S2）    | 说明             |
| ----------------- | ------------------ | ---------------- |
| `position`        | —                  | 光柱底部世界坐标 |
| `height`          | 520_000 m          | 光柱高度         |
| `color`           | `#00a8ff`          | 核心/光晕颜色    |
| `coreWidth`       | 1                  | 核心宽度倍率     |
| `glowWidth`       | 1                  | 光晕宽度倍率     |
| `intensity`       | 1                  | 整体亮度         |
| `breathingSpeed`  | 1                  | 呼吸速度         |
| `phase`           | 0                  | 呼吸相位         |
| `glowTexture`     | 内部默认           | 白色径向辉光贴图 |
| `scaleByDistance` | 默认 NearFarScalar | 可覆盖           |
| `showBaseGlow`    | true               | 底部柔光         |

`position` 是光柱底部（当前 S2 为地面 + 8km；节点标记另在 +36km 处）；`height` 从该位置
向上计算。S2 适配层负责把节点地面高度与展示高度加到 position 中。

不建议公开 36/30/24 的 layer count、单层 scale/alpha 等内部常数；它们决定视觉签名，
先固定。若确有性能需求，再提供 `quality: 'default' | 'low'`，但需单独视觉验收。

**API draft**

```ts
const beam = createEnergyBeam(host, {
  position: Cartesian3.fromDegrees(121.47, 31.23, groundHeight + 8_000),
  color: '#00a8ff',
  height: 520_000,
  breathingSpeed: 1,
});

beam.setIntensity(1.2);
beam.setPaused(true);
beam.destroy();
```

**渲染状态冲突**

- 大量透明 billboard 与 Bloom；会占用填充率，且会与节点 sprite 加色。
- 当前 beam 的 billboard 未统一关闭深度测试；若通用化后统一
  `disableDepthTestDistance`，会改变地形遮挡，必须逐项固定。
- 不修改 Scene/Globe/Bloom 全局状态。

**性能与兼容性**

- 7 个 beam 约 637 个 billboard；这是四个候选里最大的 CPU/GPU 开销。
- 多实例组合（例如 20 个 beam）约 1,800 个 sprite，必须做性能门槛。
- 依赖 DOM Canvas 生成默认纹理；无 DOM 环境需要调用方传入纹理。
- 移动端未验证；`scaleByDistance`/billboard 在极端视角下宽度是屏幕空间近似。

**视觉变化风险**

高：层数、scale、alpha 曲线、颜色 lerp、呼吸、NearFar、底部光晕任一变化都会显著改变
“体积感”。通用化必须使用视觉 fixture，不允许只凭代码“看起来差不多”。

**结论：有条件进入候选；放在最后，先实现共享纹理和生命周期，再验证 7 束组合性能。**

## 4. 共享能力：值得内部抽象，不值得公共 API

| 共享能力                         | 建议                   | 理由                                                        |
| -------------------------------- | ---------------------- | ----------------------------------------------------------- |
| `EffectHost`（scene + entities） | 公共类型               | 让 `Viewer` 结构兼容，又不依赖 Playground                   |
| 圆环几何 `circlePositionsAt`     | 内部 helper            | Node Ripple 与 Hub Pulse 共用，但语义不同，不能合并公共 API |
| 径向辉光纹理                     | 内部 helper            | 多个 effect 需要；不作为主 API 暴露                         |
| 颜色解析/缓存                    | 内部 helper            | 统一 Color 与 CSS 字符串、避免修改输入 Color                |
| 每帧时钟                         | 内部 per-effect ticker | 避免全局单例；注入 `now` 仅用于测试                         |
| `destroy`/幂等清理               | 公共生命周期           | 所有 effect 都必须安全重复销毁                              |
| Bloom/Scene 设置                 | 宿主职责               | 不是 effect 的资源，不应由包修改                            |
| 中国边界/夜景 imagery/相机       | 实验职责               | 场景内容，不是特效能力                                      |

**不要**建立统一 `Effect` 基类、全局时间轴、参数 Schema、自动组合框架或共享
`NetworkScene`。四个模块的实际能力不同，强制统一会制造复杂度而不增加复用价值。

## 5. `@cesiumlab/effects` 公共 API 草案

### 5.1 包结构

```text
packages/effects/
├── package.json          # private: true until publish approval
├── tsconfig.json
├── src/
│   ├── index.ts          # named exports only
│   ├── host.ts           # EffectHost / EffectHandle
│   ├── color.ts          # internal/public helper types
│   ├── internal/
│   │   ├── ring.ts
│   │   ├── glow-texture.ts
│   │   └── frame.ts
│   ├── node-ripple.ts
│   ├── hub-pulse.ts
│   ├── flowing-arc.ts
│   └── energy-beam.ts
└── test/
    ├── unit/
    └── browser/
```

首轮只提供根入口命名导出，不提供多个 subpath；先验证 tree-shaking，再决定是否拆
entry point。

### 5.2 公共类型

```ts
import type { Cartesian3, Color, EntityCollection, NearFarScalar, Scene } from 'cesium';

/** Minimal structural host: a Viewer satisfies this. */
export interface EffectHost {
  readonly scene: Scene;
  readonly entities: EntityCollection;
}

export type ColorLike = Color | string;

export interface EffectHandle {
  readonly destroyed: boolean;
  /** Idempotent; removes owned entities and listeners. */
  destroy(): void;
}

export interface VisibleHandle {
  setVisible(visible: boolean): void;
}
```

不把 `Viewer` 写死为参数类型；`Viewer` 的 `scene`/`entities` 结构已经满足
`EffectHost`。这样独立项目可以用自定义 host，不需要 Playground。

### 5.3 四个工厂签名

```ts
export function createNodeRipple(host: EffectHost, options: NodeRippleOptions): NodeRippleHandle;

export function createHubPulse(host: EffectHost, options: HubPulseOptions): HubPulseHandle;

export function createFlowingArc(host: EffectHost, options: FlowingArcOptions): FlowingArcHandle;

export function createEnergyBeam(host: EffectHost, options: EnergyBeamOptions): EnergyBeamHandle;
```

### 5.4 具体 Options / Handle（草案）

```ts
export interface NodeRippleOptions {
  position: Cartesian3;
  color?: ColorLike;
  ringCount?: number; // 3
  maxRadius?: number; // 90_000
  lifetime?: number; // 2.4
  phase?: number; // 0..1
  speed?: number; // 1
  lineWidth?: number; // 1.3
  glowPower?: number; // 0.48
  opacity?: number; // 0.58
  segments?: number; // 64
}

export interface NodeRippleHandle extends EffectHandle, VisibleHandle {
  setPaused(paused: boolean): void;
  setColor(color: ColorLike): void;
  setSpeed(speed: number): void;
}

export interface HubPulseOptions {
  position: Cartesian3;
  color?: ColorLike;
  ambientRingCount?: number; // 3
  ambientLifetime?: number; // 3.2
  ambientMaxRadius?: number; // 725_000
  pulseRingCount?: number; // 2
  pulseDuration?: number; // 1.3
  pulseMaxRadius?: number; // 785_000
  flash?: boolean; // true
  glowTexture?: string;
  segments?: number; // 96
  speed?: number; // 1
}

export interface HubPulseHandle extends EffectHandle, VisibleHandle {
  /** Returns false when merged into an active pulse. */
  trigger(): boolean;
  isActive(): boolean;
  readonly triggerCount: number;
  setPaused(paused: boolean): void;
}

export interface FlowingArcOptions {
  from: Cartesian3;
  to: Cartesian3;
  color?: ColorLike;
  arcHeight?: number; // auto: max(320_000, distance * 0.28)
  heightScale?: number; // 1
  duration?: number; // auto: 3 + distance / 3_000_000
  phase?: number; // 0..1
  speed?: number; // 1
  baseOpacity?: number; // 0.55
  pointBrightness?: number; // 1
  trailLength?: number; // 0.18
  trailSegments?: number; // 24
  showBase?: boolean; // true
  glowTexture?: string;
  onArrive?: () => void;
}

export interface FlowingArcHandle extends EffectHandle, VisibleHandle {
  readonly progress: number;
  restart(): void;
  setPaused(paused: boolean): void;
  setColor(color: ColorLike): void;
  setSpeed(speed: number): void;
  setHeightScale(scale: number): void;
}

export interface EnergyBeamOptions {
  position: Cartesian3; // beam base, world coordinates
  color?: ColorLike;
  height?: number; // 520_000
  coreWidth?: number; // 1
  glowWidth?: number; // 1
  intensity?: number; // 1
  breathingSpeed?: number; // 1
  phase?: number; // 0
  glowTexture?: string;
  scaleByDistance?: NearFarScalar;
  showBaseGlow?: boolean; // true
}

export interface EnergyBeamHandle extends EffectHandle, VisibleHandle {
  setColor(color: ColorLike): void;
  setHeight(height: number): void;
  setIntensity(intensity: number): void;
  setPaused(paused: boolean): void;
}
```

说明：

- 默认值必须与 S2 视觉基线一致；表中数字是**迁移约束**，不是随意默认。
- `NodeRipple` / `EnergyBeam` 的 `position` 是绝对世界坐标；`HubPulse` 的 `position` 是地面
  锚点，ambient/pulse 的 11km/13km 抬升由模块内部保持 S2 默认值。包不调用
  `globe.getHeight`，调用方负责地形采样。
- `FlowingArc` 的 `from/to` 高度语义必须在实现文档中写清；当前 S2 以椭球面为端点。
- 结构变更（ringCount、from/to、layer 等）建议重建实例，不提供复杂 `update`。
- `destroy()` 必须幂等，并在 `scene.isDestroyed()` 时也不抛出。

### 5.5 package.json 草案

```json
{
  "name": "@cesiumlab/effects",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "license": "MIT",
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "README.md", "LICENSE"],
  "peerDependencies": {
    "cesium": "1.147.x"
  }
}
```

- `private: true` 是防止误发布的第一道门；正式发布前才移除并单独批准。
- 首轮只做 ESM + 类型声明；不默认增加 CJS。
- `cesium` 必须是 peer dependency；不要在包内再装一份。
- `sideEffects: false` 只有在确认导入不产生全局副作用后使用；默认纹理在函数调用时生成，
  不在模块顶层执行。
- `@cesiumlab` scope 归属仍需发布前核实；候选包可以先使用该 workspace 名称，但不能
  据此声称 npm scope 已可用。

## 6. 模块依赖与组合关系

```text
                 ┌────────────────────────────┐
                 │ internal ring / glow / time │
                 └────────────┬───────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
       NodeRipple                       HubPulse
              │                               ▲
              │                               │ trigger()
              │                        FlowingArc.onArrive
              │                               │
              └──────────────┬────────────────┘
                             ▼
                      EnergyBeam (independent)

Host (Viewer/Scene/entities) owns:
  - camera / imagery / terrain / background
  - bloom / tone mapping
  - UI and app state
```

- **无强制运行时依赖**：每个 effect 可单独创建；Node/Hub 共享内部几何，Arc 不依赖 Hub；
  Hub 的触发由消费端连接。
- **唯一推荐组合**：`FlowingArc.onArrive` → `HubPulse.trigger()`，但这是消费端代码，
  不是包内硬连接。
- **不引入 `NetworkScene` 公共类**；S2 是这些模块的组合示例，不是包的必选容器。
- **共享纹理**：可由宿主创建一次并传给多个 beam/arc；如果省略，模块内部生成并缓存。

## 7. 推荐通用化顺序

### P1：共享内部基础（无公共 API）

先建立 `EffectHost`、颜色解析、圆环 helper、辉光纹理缓存、帧时钟和幂等
`destroy` 约定；只写单元测试，不发布。

### P1：Node Ripple

- 最低复杂度，验证包结构、Entity 生命周期、暂停/恢复、独立 fixture。
- 失败可快速回退，不影响 S2。
- 成功后再复用其 ring helper 到 Hub Pulse。

### P1：Flowing Arc

- 最高独立复用价值。
- 需要测地线、拖尾 taper、envelope、到达回调、speed/height 更新。
- 先做单弧 fixture；不要马上做多弧容器。

### P2：Hub Pulse

- 复用 ring helper，验证 ambient 与 event 的语义分离、事件合并、flash 纹理。
- 完成后用 `onArrive` 演示组合，但不修改 S2 的默认实现。

### P2：Energy Beam

- 最后做，因为 637 billboard 的组合成本和视觉风险最高。
- 先做单束 fixture，再做 7 束组合性能与视觉对照。
- 若移动端目标出现，先提供降级质量选项或推迟。

### S2 迁移（最后，单独批准）

Stage 5B 可以完成包候选而不改动 S2；只有包模块通过独立测试后，才提交一个单独的
S2 adapter 变更，将 `network.ts` 的组合逐步替换为包调用，并对照
`docs/visual-baselines/S2-001/control-paused-1672x941.png` 做回归。不得在同一个
变更里同时改视觉和抽取包。

## 8. 独立集成测试与视觉回归策略

### 8.1 包级单元测试

- 测地线：端点、零距离、跨日期线、高度/弧高、duration 公式。
- Ripple：progress/phase 环绕、半径/宽度/alpha 曲线、带 speed 的时间。
- Hub：ambient 与 pulse 独立；active 时 trigger 合并；triggerCount；flash 生命周期。
- Arc：progress wrap 只触发一次 `onArrive`；speed 改变不误触发；restart 重置。
- Beam：参数校验、颜色解析、默认 layer 配置、`setHeight`/`setIntensity`。
- 生命周期：构造失败、半初始化、重复 destroy、host scene 已销毁。
- 不对 Cesium 渲染结果做“纯单元”断言；几何数学用纯函数/固定输入测试。

### 8.2 独立浏览器 fixture

`packages/effects/test/browser` 使用独立 Cesium Viewer，不 import Playground：

- 固定 1440×900 / 1672×941、固定相机、固定背景与 Bloom 配置；
- 每类 effect 单独创建，在 t=0 / 0.5 / 1.0 固定帧截图；
- `NodeRipple` 近景、`HubPulse` active/ambient、`FlowingArc` 三个进度、`EnergyBeam` 正面/侧面；
- 控制台 error、page error、失败请求必须为 0；
- 创建/销毁 20–50 次，检查 Entity 数量、canvas 数、listener 是否清理；
- 组合测试：4 类同时存在；两个 Viewer 不共享全局状态。

### 8.3 S2 视觉回归

在 S2 迁移前，包 fixture 只证明模块自身；迁移后用同一控制帧：

```bash
pnpm test:e2e:stage2
```

- 对照 `docs/visual-baselines/S2-001/control-paused-1672x941.png`；
- 当前公网控制帧约 1.04% RMSE，作为环境噪声参考；
- 建议首轮 gate：归一化 RMSE **< 0.02** 且人工并排检查无结构差异；
- 不能把“低 RMSE”单独当作视觉批准；用户仍负责最终确认；
- 任何默认值改写、bloom 参数变化或 billboard 排序变化都必须单独解释。

### 8.4 独立消费测试

- `npm pack` 生成 tarball；
- 在 workspace 外的临时 Vite 项目安装 tarball；
- 使用 `cesium` 1.147 peer，完成创建/销毁、类型检查、构建；
- 检查 `exports`、`types`、`sideEffects`、无 Playground/内部路径依赖；
- 在真实浏览器加载，截图并检查 console；
- tree-shaking 验证：只 import `createNodeRipple` 时，产物不应带入 Arc/Beam 的实现
  （Cesium 本身仍会大，单独记录）。
- 未通过 tarball 消费测试前，不进入 npm 发布候选。

### 8.5 性能记录

- 记录同机同浏览器的 Entity/billboard 数量、平均帧时间和 1% low；
- 7 束 Beam 组合是重点；不设未经校准的统一 FPS 承诺；
- 记录 `requestRenderMode`、DPR、WebGL/ANGLE 环境；
- 移动端/Firefox/Safari 未测试前标记未验证。

## 9. 不建议封装的部分

| 内容                                            | 原因                                              |
| ----------------------------------------------- | ------------------------------------------------- |
| 中国边界/省界 `geo.ts` 与 GeoJSON               | 数据、许可与地缘政治语境强绑定；不是通用特效      |
| 夜景地球 imagery / 大气 / World Terrain         | 宿主场景与授权资源；包不应内置素材/服务依赖       |
| Bloom、背景色、相机、`Viewer` 初始化            | 全局渲染与宿主职责；包不应拥有                    |
| S2 的 7 城市/中心坐标/路线调度                  | 作品数据；应由调用方传入                          |
| `NetworkScene` 组合类                           | 只有一个消费者；过早抽象会让 API 绑定 S2          |
| 参数面板 DOM/CSS                                | Playground 专用；不影响 Cesium 复用               |
| 统一 `Effect` 基类/全局时间轴/参数 Schema       | 四个效果能力不同；会增加无收益复杂度              |
| 把 Node Ripple 与 Hub Pulse 合并成 `RippleMode` | 视觉语义、节奏和触发模型不同；共享内部几何即可    |
| `createRadialGlowTexture` 作为主公共 API        | 它是内部资源细节；需要时通过 options 传纹理       |
| “真体积光”承诺                                  | 当前是 billboard 堆叠近似；不能把近似说成体积渲染 |
| `target.png` 参考图/内部任务包                  | 未授权公开，不进入包或发布物                      |

## 10. Stage 5B 实施任务清单

> 以下只是任务设计；本阶段不执行，等待用户批准。

### 5B-01 包骨架与边界

- [ ] 创建 `packages/effects`，`private: true`，ESM + `.d.ts` + Vitest；
- [ ] `EffectHost`/`EffectHandle`/`ColorLike` 类型与参数校验；
- [ ] 不依赖 `apps/playground`、`experiments`、内部 alias；
- [ ] 记录 Cesium peer 范围（首轮 `1.147.x`）；
- [ ] `pnpm check`、包构建、类型导出检查。

### 5B-02 内部基础

- [ ] 圆环几何 helper（NodeRipple/HubPulse 共用，不导出）；
- [ ] 径向辉光纹理缓存（默认 256，支持自定义纹理）；
- [ ] 颜色解析（不修改输入 `Color`）；
- [ ] 帧时钟与幂等销毁 helper；
- [ ] 单元测试覆盖数学与生命周期。

### 5B-03 Node Ripple

- [ ] 默认参数与 S2 常量一致；
- [ ] 独立 fixture：近景、暂停、颜色/速度更新；
- [ ] 创建/销毁 50 次；Entity 数回到 0；
- [ ] 无 console/page error。

### 5B-04 Flowing Arc

- [ ] `EllipsoidGeodesic` 采样与 duration 公式；
- [ ] 双基础弧、光点、24 点 taper 拖尾；
- [ ] `onArrive` 每圈一次；speed/heightScale/restart；
- [ ] 独立 fixture 三个进度截图；
- [ ] 视觉常量与 S2 对照。

### 5B-05 Hub Pulse

- [ ] ambient 3 圈 + event 2 圈 + flash；
- [ ] active 时 trigger 合并；ambient 不重置；
- [ ] 独立 fixture，含未触发/触发中/结束；
- [ ] 与 Arc 的 `onArrive` 组合示例（消费端）。

### 5B-06 Energy Beam

- [ ] 3 层 36/30/24 默认；底部光晕；
- [ ] 共享纹理；height/coreWidth/glowWidth/intensity/breathing；
- [ ] 单束与 7 束组合性能记录；
- [ ] 正面/侧面/近景视觉 fixture；
- [ ] 若组合成本不可接受，保留实验实现，不强行发布。

### 5B-07 S2 迁移（单独变更）

- [ ] 包模块全部通过后，才修改 `network.ts` 组合；
- [ ] 保持默认相机/参数/颜色/时序；
- [ ] 对照控制帧与时间序列；
- [ ] `pnpm test:e2e:stage2` 通过，RMSE 与人工检查通过；
- [ ] 任何视觉差异先修复，不直接改基线。

### 5B-08 独立消费与发布候选

- [ ] `npm pack`；
- [ ] workspace 外安装 tarball；
- [ ] Vite + Cesium 1.147 构建/浏览器运行；
- [ ] 类型、exports、sideEffects、tree-shaking 检查；
- [ ] README/API/兼容性/限制；
- [ ] 提交候选包与验证报告，**不发布 npm**。

## 11. 本阶段未执行事项

- 未修改 `experiments/earth-network-convergence/*`；
- 未创建 `packages/effects` 实现或 `package.json`；
- 未运行新的浏览器/视觉测试（本次为代码审查与设计）；
- 未修改 S2-001 视觉基准、已部署 Commit 或公网站点；
- 未发布 npm；
- 未验证 Firefox/Safari/移动端/低端 GPU；
- 未建立 FPS/帧时间基准；报告中的 827 Entity 是静态代码统计，不是性能测量。

## 12. 待用户决策

1. 是否批准按 **Node Ripple → Flowing Arc → Hub Pulse → Energy Beam** 顺序进入
   Stage 5B；
2. 是否接受 Hub Pulse 与 Node Ripple 保持两个独立公共 API（推荐），而不是合并成
   一个 `Ripple` 模式；
3. 是否接受 Energy Beam 作为有条件候选：若 7 束组合性能或视觉不达标，保留为实验
   实现而不进入包；
4. 是否接受 Stage 5B 先做独立 fixture、不立即改动 S2，待包稳定后再单独批准迁移。

**当前状态：Stage 5A 评估完成，等待通用化实施批准。**
