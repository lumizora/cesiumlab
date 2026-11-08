# 首个视觉实验（等待参考）

**类型：Visual Experiment 档案（未实现）**  
**状态：not-implemented；成熟度 Idea。**

## 当前情况

项目尚未收到首个正式视觉参考（图片 / 视频 / GIF / 明确视觉描述）。因此：

- 没有选定首个特效；
- 没有运行入口；
- 没有将 `Cesium Smoke Test` 冒充为视觉复现成果。

该档案用于验证公开 Gallery 能展示未完成实验，并明确区分「档案可见」与「可运行」。

## 收到参考后的工作流

1. 拆解可观察事实（形态、颜色、光影、动画、空间关系）与不可观察假设；
2. 选择有依据的 CesiumJS 技术路线（Entity / Primitive / Material / CustomShader / PostProcessStage / ParticleSystem 等），先说明理由与风险；
3. 建立 `experiments/<slug>/`、运行入口、默认相机与 Showcase 状态；
4. 在真实浏览器中检查渲染、控制台、资源、Shader 与动态时间点；
5. 提交截图/录制、实现说明、差异与限制，等待用户视觉验收。

**Agent 不得自行宣布 Visual Approved，也不得擅自选择首个特效。**
