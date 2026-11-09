# S2-001 视觉基准

**状态：Visual Approved（用户批准：2026-11-08）**
**视觉实现 revision：`e5da645`**
**批准记录：`9f49d39` · 证据归档：`8e86bf5`**

本目录固化 S2-001 `earth-network-convergence` 的已批准视觉状态，供后续 Stage 4/5 回归检查使用。

## 文件

| 文件                          | 用途                                          |
| ----------------------------- | --------------------------------------------- |
| `approved-main-1672x941.png`  | 用户验收时的主画面证据副本                    |
| `approved-angle.png`          | 旋转侧视角证据副本                            |
| `approved-node-closeup.png`   | 节点波纹 + 全息光束近景证据副本               |
| `control-paused-1672x941.png` | 确定性回归控制帧：`paused=1&terrain-off`，t=0 |
| `baseline.json`               | Commit、相机、默认参数、场景计数、截图 SHA256 |

## 默认 Showcase

- 相机：target `[108, 26]`，heading `338°`，pitch `-55°`，range `5,900,000 m`
- 场景：西安/中国区域、7 条金色空间弧线、7 个蓝色节点、中心上海
- 纹理：本地 4096×2048 夜景纹理
- 地形：Cesium World Terrain（ion 可用时）；6s 超时/无 token 回退椭球
- 默认参数：见 `baseline.json.defaultState`

## 回归方式

```powershell
pnpm test:e2e:stage4
magick compare -metric RMSE `
  docs/visual-baselines/S2-001/control-paused-1672x941.png `
  docs/evidence/stage-4/s2-001-regression.png null:
```

- `s2-001-regression.png` 由 Stage 4 Playwright 在 1672×941、暂停 t=0、椭球地形下采集；
- 控制帧用于检查构图、弧线/节点/光束位置、色彩层级、光晕宽度等是否异常；
- 2026-11-09 Stage 4 复测 RMSE 为 **0.00936466（约 0.94%）**，差异集中在星空/抗锯齿的高频像素，场景结构与色彩层级一致；
- 动态飞线/波纹/呼吸不在暂停帧中运动，需结合 `docs/evidence/stage-2/` 的时间序列与人工视觉复核；
- 若修改了任何视觉代码，必须在报告中解释差异，不能直接覆盖本目录基准。

## 批准边界

- 本目录只固化 S2-001 当前视觉状态；
- 不包含 `packages/effects` API、npm 包或公开部署批准；
- 原始参考 PNG 不进入 public 产物；本目录只保存真实 CesiumJS 渲染截图。
