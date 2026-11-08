# S2-001 Stage 2 证据与自检

**实验：**`earth-network-convergence`
**状态：**Prototype / **Awaiting Visual Review**（未获得 Visual Approved）
**实现提交：**`87e7da5`
**参考：**`docs/stage2/cesiumlab-stage2-task-package/references/S2-001-earth-network/target.png`（内部研发使用，不公开部署原图）

## 环境与运行

| 项目        | 值                                                                        |
| ----------- | ------------------------------------------------------------------------- |
| OS          | Windows 10                                                                |
| 浏览器      | Microsoft Edge 157.0.4341.42（Chromium，headless）                        |
| GPU / WebGL | NVIDIA GeForce GTX 1070 Ti；ANGLE/D3D11；WebGL 2.0                        |
| 画幅        | 1672 × 941（与参考同比例；实际输出即 1672 × 941）                         |
| 生产预览    | `http://127.0.0.1:4273/?capture=1#/experiments/earth-network-convergence` |
| 地形        | Cesium World Terrain（ion；无 token 时回退椭球）                          |
| 夜景纹理    | 4096 × 2048 本地单幅纹理                                                  |
| 证据生成    | `pnpm test:e2e:stage2`                                                    |

纯净截图模式通过 `?capture=1` 隐藏站点 UI、Viewer 工具栏和实验控件，保留真实 Cesium Viewer。

## 实际截图

| 文件                              | 内容                                             |
| --------------------------------- | ------------------------------------------------ |
| `earth-network-main-1672x941.png` | 1672×941 主截图；`t≈0`；无站点 UI                |
| `earth-network-t2.png`            | 约 2s 后                                         |
| `earth-network-t5.png`            | 约 5s 后                                         |
| `earth-network-t10.png`           | 约 10s 后                                        |
| `earth-network-angle.png`         | 拖动旋转后的斜视角                               |
| `earth-network-zoom.png`          | 近距离缩放检查                                   |
| `earth-network-controls.png`      | 参数面板：绿色飞线、隐藏边界（用于证明参数生效） |

`stage2-report.json` 记录浏览器、画幅、场景状态、渲染统计、ion 请求、console/page error 与失败请求。命令输出见 `logs/stage2.txt`，revision 见 `logs/revision.txt`。

实测无 console error、page error、失败请求；重进实验后画布数量为 1。渲染统计：约 10295 个颜色簇、59.6% 非暗像素。

## VA-01～VA-12 自检

| ID    | 结论   | 证据 / 说明                                                                                                  |
| ----- | ------ | ------------------------------------------------------------------------------------------------------------ |
| VA-01 | 通过   | 1672×941；地球弧面位于上部；中国为视觉主体；金色中心约在横向 70%、纵向 49%                                   |
| VA-02 | 通过   | `earth-network-angle.png`、`earth-network-zoom.png` 与主截图视角不同；锚点随球面视差移动                     |
| VA-03 | 有差异 | 深蓝地球、冷色大气边缘、城市灯光可见；但夜景纹理为单幅 4096×2048 影像，地形/城市灯光细节弱于参考，整体更蓝   |
| VA-04 | 有差异 | Natural Earth CHN/TWN/HKG/MAC 边界与 CHN 省界可见、青蓝发光；线条受 Bloom 影响偏白，省界比参考更细           |
| VA-05 | 通过   | 上海附近金色核心 + 6 层同心环，核心亮度高于普通节点；核心局部接近白色                                        |
| VA-06 | 通过   | 7 条金色空间弧线汇聚到上海，抬高弧线有可辨高度；参考约 8 条，本实现 7 条                                     |
| VA-07 | 通过   | 7 个青蓝节点（乌鲁木齐、拉萨、成都、西安、哈尔滨、昆明、广州），均有扩散环与竖向光柱；光柱底部为近似地面高度 |
| VA-08 | 通过   | 主截图/`t2`/`t5`/`t10` 文件不同；金色光点由节点向中心移动，节点环扩散，中心环脉冲；无跳帧式整体闪现          |
| VA-09 | 有差异 | 青蓝/暖金层级可辨；但蓝色地表更亮，边界更白，参考的整体暖灰地形与金色体积感更强                              |
| VA-10 | 通过   | 控制面板可改飞线颜色、速度、节点颜色、Bloom、脉冲、边界显隐；重置返回默认相机/参数；截图见 controls          |
| VA-11 | 通过   | 生产 preview 正常运行；无 WebGL/Shader 错误；离开/重进后 canvas 数为 1，无明显对象累积                       |
| VA-12 | 通过   | 主截图、时间序列、角度/缩放、参数截图、报告、数据来源、revision 与未验证项均已提供；参考原图未贴入场景       |

## 动画假设与实际周期

参考是静态 AI 概念图，以下为设计假设：

- 金色光点沿弧线由各节点流向上海；`routeSpeed=1` 时路径周期约 **6.8–8.0s**；
- 节点扩散环约 **4.55s** 一轮（`0.22 × pulseSpeed`）；
- 中心环脉冲约 **4.5–5.5s**；
- 节点光柱轻微呼吸，默认镜头固定；用户可拖动/缩放并重置。

## 视觉参考与实际结果的前三处差异

1. **地表细节**：参考有更暖、更清晰的地形/城市灯光；本实现使用 4096×2048 夜景纹理，细节更少、色调更蓝。
2. **边界表现**：参考是饱和青色霓虹边界与更丰富的内部线网；本实现用 Natural Earth 数据，边界受 Bloom 影响偏白，省界较细，且自然地理数据与概念图轮廓不同。
3. **金色弧线与中心体积感**：参考约 8 条更粗的金色弧线和更强的中心光晕；本实现 7 条较细弧线、6 层环，Bloom 更强但体积层次略弱；地球弧面位置也略低（主截图顶部仍保留约 10% 星空）。

## 数据来源与许可

| 素材                       | 来源                                                                                            | 许可 / 说明                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 夜景纹理 `night-earth.jpg` | `three-globe` example（`https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg`） | 仓库 MIT；底层夜景通常来自 NASA Black Marble。公开部署前需复核原始影像归属与 NASA 使用条款。 |
| 中国边界 / 省界            | Natural Earth 1:50m admin_0 / admin_1（本地提取）                                               | Public Domain；边界描绘遵循 Natural Earth，不是对争议边界或主权的裁定。                      |
| 地形                       | Cesium World Terrain（可选 ion）                                                                | 通过本地 `.env.local` 的公开客户端 token；无 token 回退椭球。                                |
| 城市坐标                   | 公开常见 WGS84 城市中心坐标                                                                     | 仅用于视觉演示，不是权威地理数据。                                                           |
| 参考图                     | S2-001 任务包                                                                                   | 仅内部研发；未作为场景贴图，未公开部署。                                                     |

## 实现摘要

- `main.ts`：Viewer、夜景纹理、大气、可选地形、Bloom、相机、控制面板、清理；
- `network.ts`：Natural Earth 边界/省界、7 节点、7 弧线、上海中心、CallbackProperty 动画；
- `geo.ts`：本地 GeoJSON 解析；
- `textures.ts`：运行时生成辉光 sprite；
- `controls.ts` / `controls.css`：最小参数面板。

## 未验证 / 限制

- Firefox / Safari / 移动端未验证；仅 Edge/Chromium headless。
- 没有真实录屏；用 `t=0/2/5/10s` 时间序列代替，符合任务允许的证据方式。
- 夜景纹理近看会糊；省界/边界不是测绘级精度；节点光柱底部为近似高度，极端视角可能看出悬浮/穿地。
- 未做像素级差异、SSIM 或跨设备性能/FPS 结论。
- **未获得用户视觉批准**；不得进入 Stage 3 通用化或 npm 发布。
