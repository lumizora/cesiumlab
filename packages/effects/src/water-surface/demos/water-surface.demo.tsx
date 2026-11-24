import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cartesian3, HeadingPitchRange, Math as CesiumMath, Matrix4, type Viewer } from 'cesium';
import {
  Button,
  Card,
  Code,
  CodeBlock,
  Divider,
  HStack,
  Heading,
  Icon,
  StackItem,
  Text,
  VStack,
} from '@astryxdesign/core';
import { Eye, EyeOff, Pause, Play, RotateCcw } from 'lucide-react';
import { CesiumStage } from '@docs/components/CesiumStage';
import type { ParamGroup } from '@docs/components/EffectParamPanel';
import { useDocsPageMarkdown } from '@docs/lib/docsPage';
import type { EffectDemoMeta } from '@docs/lib/effectDemos';
import { useI18n } from '@docs/lib/i18n';
import { formatEffectDocMarkdown } from '@docs/lib/markdown';
import { createWaterSurface, type WaterSurfaceHandle } from '../index.ts';

export const meta: EffectDemoMeta = {
  id: 'water-surface',
  title: 'Water Surface',
  section: 'Visual Effects',
  description:
    'GPU-driven procedural flowing water surface with world-space distance-adaptive FBM wave normals, atmospheric Fresnel sky reflections, and terrain-intersecting water levels for both lakes and non-water valley reservoirs.',
  isNew: true,
  order: 9,
};

const INSTALL_CMD = 'pnpm add @cesiumlab/effects cesium';

const USAGE_CODE = `import { createWaterSurface } from '@cesiumlab/effects';

// Enable terrain depth testing so water carves natural shorelines in non-water valleys
viewer.scene.globe.depthTestAgainstTerrain = true;

const water = createWaterSurface(viewer, {
  positions: [
    [103.52, 31.52],
    [103.68, 31.52],
    [103.68, 31.38],
    [103.52, 31.38],
  ],
  color: '#0a3a4a',
  specularColor: '#dbeafe',
  height: 1580,        // Omit to auto-sample terrain height on flat land
  waveScale: 1,
  amplitude: 0.55,
  speed: 1,
});

// O(1) GPU uniform updates & live water-level simulation
water.update({ height: 1750, speed: 1.4, amplitude: 0.75 });
water.destroy();`;

type WaterScenePreset = 'valley' | 'lake';

const SCENE_PRESETS: Record<
  WaterScenePreset,
  {
    polygon: ReadonlyArray<readonly [number, number]>;
    defaultHeight: number;
    minHeight: number;
    maxHeight: number;
    heightStep: number;
    cameraTarget: readonly [number, number, number];
    headingDeg: number;
    pitchDeg: number;
    range: number;
  }
> = {
  // Non-water mountain valley in Sichuan: water intersects steep terrain to form organic shorelines
  valley: {
    polygon: [
      [103.52, 31.52],
      [103.68, 31.52],
      [103.68, 31.38],
      [103.52, 31.38],
    ],
    defaultHeight: 1_580,
    minHeight: 1_260,
    maxHeight: 2_100,
    heightStep: 20,
    cameraTarget: [103.595, 31.45, 1_580],
    headingDeg: 28,
    pitchDeg: -22,
    range: 9_200,
  },
  // Mid-range grazing view over West Lake, Hangzhou for close-up ripple & Fresnel inspection
  lake: {
    polygon: [
      [120.128, 30.261],
      [120.158, 30.261],
      [120.161, 30.233],
      [120.131, 30.231],
    ],
    defaultHeight: 26,
    minHeight: 0,
    maxHeight: 180,
    heightStep: 2,
    cameraTarget: [120.145, 30.246, 26],
    headingDeg: 35,
    pitchDeg: -19,
    range: 4_600,
  },
};

function focusSceneCamera(viewer: Viewer, presetKey: WaterScenePreset) {
  const preset = SCENE_PRESETS[presetKey];
  const [lng, lat, alt] = preset.cameraTarget;
  viewer.camera.lookAt(
    Cartesian3.fromDegrees(lng, lat, alt),
    new HeadingPitchRange(
      CesiumMath.toRadians(preset.headingDeg),
      CesiumMath.toRadians(preset.pitchDeg),
      preset.range,
    ),
  );
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
}

const DEFAULTS = {
  scene: 'valley' as WaterScenePreset,
  color: '#0a3a4a',
  specularColor: '#dbeafe',
  height: SCENE_PRESETS.valley.defaultHeight,
  waveScale: 1,
  amplitude: 0.55,
  speed: 1,
  flowSpeed: 0,
  flowDeg: 35,
  specularIntensity: 0.9,
  opacity: 0.72,
} as const;

export default function WaterSurfaceDemoPage() {
  const { isZh } = useI18n();
  const viewerRef = useRef<Viewer | null>(null);
  const waterRef = useRef<WaterSurfaceHandle | null>(null);

  const [paused, setPaused] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [visible, setVisible] = useState(true);
  const [scene, setScene] = useState<WaterScenePreset>(DEFAULTS.scene);
  const [color, setColor] = useState<string>(DEFAULTS.color);
  const [specularColor, setSpecularColor] = useState<string>(DEFAULTS.specularColor);
  const [height, setHeight] = useState<number>(DEFAULTS.height);
  const [waveScale, setWaveScale] = useState<number>(DEFAULTS.waveScale);
  const [amplitude, setAmplitude] = useState<number>(DEFAULTS.amplitude);
  const [speed, setSpeed] = useState<number>(DEFAULTS.speed);
  const [flowSpeed, setFlowSpeed] = useState<number>(DEFAULTS.flowSpeed);
  const [flowDeg, setFlowDeg] = useState<number>(DEFAULTS.flowDeg);
  const [specularIntensity, setSpecularIntensity] = useState<number>(DEFAULTS.specularIntensity);
  const [opacity, setOpacity] = useState<number>(DEFAULTS.opacity);

  const handleSceneChange = useCallback((nextScene: WaterScenePreset) => {
    setScene(nextScene);
    setHeight(SCENE_PRESETS[nextScene].defaultHeight);
  }, []);

  const handleMount = useCallback(
    (viewer: Viewer) => {
      viewerRef.current = viewer;
      const prevDepthTest = viewer.scene.globe.depthTestAgainstTerrain;
      viewer.scene.globe.depthTestAgainstTerrain = true;

      const preset = SCENE_PRESETS[scene];
      waterRef.current = createWaterSurface(viewer, {
        positions: preset.polygon,
        color,
        specularColor,
        height,
        waveScale,
        amplitude,
        speed,
        flowSpeed,
        flowAngle: CesiumMath.toRadians(flowDeg),
        specularIntensity,
        opacity,
        paused,
        show: visible,
      });
      focusSceneCamera(viewer, scene);

      return () => {
        waterRef.current?.destroy();
        waterRef.current = null;
        if (!viewer.isDestroyed()) {
          viewer.scene.globe.depthTestAgainstTerrain = prevDepthTest;
        }
        viewerRef.current = null;
      };
    },
    // Mount once per stage lifecycle; updates are synced by effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const preset = SCENE_PRESETS[scene];
    waterRef.current?.destroy();
    waterRef.current = createWaterSurface(viewer, {
      positions: preset.polygon,
      color,
      specularColor,
      height: preset.defaultHeight,
      waveScale,
      amplitude,
      speed,
      flowSpeed,
      flowAngle: CesiumMath.toRadians(flowDeg),
      specularIntensity,
      opacity,
      paused,
      show: visible,
    });
    focusSceneCamera(viewer, scene);
    // Rebuild polygon only when switching scene preset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  useEffect(() => {
    waterRef.current?.update({
      color,
      specularColor,
      height,
      waveScale,
      amplitude,
      speed,
      flowSpeed,
      flowAngle: CesiumMath.toRadians(flowDeg),
      specularIntensity,
      opacity,
    });
  }, [
    color,
    specularColor,
    height,
    waveScale,
    amplitude,
    speed,
    flowSpeed,
    flowDeg,
    specularIntensity,
    opacity,
  ]);

  useEffect(() => {
    waterRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    waterRef.current?.setVisible(visible);
  }, [visible]);

  const handleResetCamera = () => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      focusSceneCamera(viewer, scene);
    }
  };

  const activePreset = SCENE_PRESETS[scene];

  const hasModifiedParams =
    scene !== DEFAULTS.scene ||
    color !== DEFAULTS.color ||
    specularColor !== DEFAULTS.specularColor ||
    height !== activePreset.defaultHeight ||
    waveScale !== DEFAULTS.waveScale ||
    amplitude !== DEFAULTS.amplitude ||
    speed !== DEFAULTS.speed ||
    flowSpeed !== DEFAULTS.flowSpeed ||
    flowDeg !== DEFAULTS.flowDeg ||
    specularIntensity !== DEFAULTS.specularIntensity ||
    opacity !== DEFAULTS.opacity;

  const handleResetParams = useCallback(() => {
    setScene(DEFAULTS.scene);
    setColor(DEFAULTS.color);
    setSpecularColor(DEFAULTS.specularColor);
    setHeight(DEFAULTS.height);
    setWaveScale(DEFAULTS.waveScale);
    setAmplitude(DEFAULTS.amplitude);
    setSpeed(DEFAULTS.speed);
    setFlowSpeed(DEFAULTS.flowSpeed);
    setFlowDeg(DEFAULTS.flowDeg);
    setSpecularIntensity(DEFAULTS.specularIntensity);
    setOpacity(DEFAULTS.opacity);
  }, []);

  const paramGroups = useMemo<ParamGroup[]>(
    () => [
      {
        id: 'appearance',
        label: isZh ? '外观' : 'Appearance',
        controls: [
          {
            type: 'segment',
            id: 'scene',
            label: isZh ? '演示场景' : 'Scene preset',
            value: scene,
            options: [
              { value: 'valley', label: isZh ? '非水域山谷蓄水' : 'Valley Flood' },
              { value: 'lake', label: isZh ? '湖泊近景' : 'Lake Close-up' },
            ],
            onChange: (val) => {
              if (val === 'valley' || val === 'lake') handleSceneChange(val);
            },
          },
          {
            type: 'color',
            id: 'color',
            label: isZh ? '深水颜色' : 'Water color',
            value: color,
            onChange: setColor,
          },
          {
            type: 'color',
            id: 'specularColor',
            label: isZh ? '天光反射色' : 'Sky tint',
            value: specularColor,
            onChange: setSpecularColor,
          },
          {
            type: 'slider',
            id: 'opacity',
            label: isZh
              ? `基础透明度 · ${Math.round(opacity * 100)}%`
              : `Opacity · ${Math.round(opacity * 100)}%`,
            value: opacity,
            min: 0.25,
            max: 1,
            step: 0.05,
            onChange: setOpacity,
          },
          {
            type: 'slider',
            id: 'specularIntensity',
            label: isZh
              ? `波光强度 · ${specularIntensity.toFixed(2)}x`
              : `Glint · ${specularIntensity.toFixed(2)}x`,
            value: specularIntensity,
            min: 0,
            max: 2,
            step: 0.05,
            onChange: setSpecularIntensity,
          },
        ],
      },
      {
        id: 'geometry',
        label: isZh ? '水面' : 'Surface',
        controls: [
          {
            type: 'slider',
            id: 'height',
            label: isZh ? `水位海拔 · ${height}m` : `Water level · ${height}m`,
            value: height,
            min: activePreset.minHeight,
            max: activePreset.maxHeight,
            step: activePreset.heightStep,
            onChange: setHeight,
          },
          {
            type: 'slider',
            id: 'waveScale',
            label: isZh
              ? `波纹细腻度 · ${waveScale.toFixed(1)}x`
              : `Wave density · ${waveScale.toFixed(1)}x`,
            value: waveScale,
            min: 0.4,
            max: 2.5,
            step: 0.1,
            onChange: setWaveScale,
          },
          {
            type: 'slider',
            id: 'amplitude',
            label: isZh
              ? `波浪起伏 · ${amplitude.toFixed(2)}`
              : `Amplitude · ${amplitude.toFixed(2)}`,
            value: amplitude,
            min: 0.1,
            max: 1.4,
            step: 0.05,
            onChange: setAmplitude,
          },
        ],
      },
      {
        id: 'motion',
        label: isZh ? '流动' : 'Motion',
        controls: [
          {
            type: 'slider',
            id: 'speed',
            label: isZh ? `波光起伏 · ${speed.toFixed(1)}x` : `Shimmer · ${speed.toFixed(1)}x`,
            value: speed,
            min: 0,
            max: 3,
            step: 0.1,
            onChange: setSpeed,
          },
          {
            type: 'slider',
            id: 'flowSpeed',
            label: isZh
              ? `定向流速 · ${flowSpeed === 0 ? '静水' : `${flowSpeed.toFixed(1)}x`}`
              : `Flow · ${flowSpeed === 0 ? 'Still' : `${flowSpeed.toFixed(1)}x`}`,
            value: flowSpeed,
            min: 0,
            max: 3,
            step: 0.1,
            onChange: setFlowSpeed,
          },
          {
            type: 'slider',
            id: 'flowAngle',
            label: isZh ? `流向 · ${flowDeg}°` : `Flow angle · ${flowDeg}°`,
            value: flowDeg,
            min: 0,
            max: 360,
            step: 5,
            onChange: setFlowDeg,
          },
        ],
      },
    ],
    [
      isZh,
      scene,
      handleSceneChange,
      color,
      specularColor,
      opacity,
      specularIntensity,
      height,
      activePreset.minHeight,
      activePreset.maxHeight,
      activePreset.heightStep,
      waveScale,
      amplitude,
      speed,
      flowSpeed,
      flowDeg,
    ],
  );

  const pageTitle = isZh ? '程序化流动水面 (Water Surface)' : meta.title;
  const pageDescription = isZh
    ? '零外部贴图的纯 GPU 物理感流动水面：基于世界米制坐标与相机距离自适应多尺度 FBM 噪声法线（消除正弦网格感）、程序化大气天空菲涅尔反射与双层太阳碎光；开启地形深度测试后可直接放置在非水域山谷或陆地，自动与地形咬合生成真实蜿蜒岸线并实时演示水位涨落。'
    : meta.description;

  const apiProperties = isZh
    ? [
        {
          property: 'positions',
          type: '[lng, lat][]',
          defaultValue: 'required',
          description: '水域多边形边界经纬度顶点（至少 3 个点），支持水域与任意非水域陆地/山谷。',
        },
        {
          property: 'color / specularColor',
          type: 'Color | string',
          defaultValue: "'#0a3a4a' / '#dbeafe'",
          description: '深水体基色以及天空反射与太阳波光色调。',
        },
        {
          property: 'height',
          type: 'number',
          defaultValue: 'auto',
          description:
            '水面海拔高度（米）；不传时自动采样区域地形高程防止下沉，显式传入可模拟山谷蓄水与洪涝淹没。',
        },
        {
          property: 'waveScale / amplitude',
          type: 'number',
          defaultValue: '1 / 0.55',
          description: '波纹物理尺度倍率（配合相机距离自适应 LOD）与法线起伏强度。',
        },
        {
          property: 'speed / flowSpeed / flowAngle',
          type: 'number',
          defaultValue: '1 / 0 / 0.6',
          description: '原地波光闪烁速度、定向水流速度（0 为静水只泛光不流动）与流向角度（弧度）。',
        },
        {
          property: 'specularIntensity / opacity',
          type: 'number',
          defaultValue: '0.9 / 0.72',
          description: '太阳双层碎光闪烁强度与俯视基础不透明度。',
        },
        {
          property: 'show / paused',
          type: 'boolean',
          defaultValue: 'true / false',
          description: '初始是否可见、初始是否暂停动画。',
        },
        {
          property: 'show / hide / setVisible / update / setPaused / restart / destroy',
          type: 'EffectHandle',
          defaultValue: '—',
          description: '统一特效句柄方法：显隐切换、实时更新参数与水位、暂停/重置与幂等销毁。',
        },
      ]
    : [
        {
          property: 'positions',
          type: '[lng, lat][]',
          defaultValue: 'required',
          description:
            'Ordered polygon [longitude, latitude] vertices (minimum 3 points) for lakes or non-water land/valleys.',
        },
        {
          property: 'color / specularColor',
          type: 'Color | string',
          defaultValue: "'#0a3a4a' / '#dbeafe'",
          description: 'Deep water body tint and atmospheric sky reflection / solar glint tint.',
        },
        {
          property: 'height',
          type: 'number',
          defaultValue: 'auto',
          description:
            'Water altitude in metres; auto-samples terrain when omitted, or set explicitly for valley reservoir/flood simulation.',
        },
        {
          property: 'waveScale / amplitude',
          type: 'number',
          defaultValue: '1 / 0.55',
          description:
            'Distance-adaptive FBM wave density multiplier and normal perturbation amplitude.',
        },
        {
          property: 'speed / flowSpeed / flowAngle',
          type: 'number',
          defaultValue: '1 / 0 / 0.6',
          description:
            'In-place ripple shimmer speed, directional current speed (0 = still water shimmer), and flow angle in radians.',
        },
        {
          property: 'specularIntensity / opacity',
          type: 'number',
          defaultValue: '0.9 / 0.72',
          description: 'Dual-lobe solar glint strength and steep-angle base water opacity.',
        },
        {
          property: 'show / paused',
          type: 'boolean',
          defaultValue: 'true / false',
          description: 'Initial visibility and paused state.',
        },
        {
          property: 'show / hide / setVisible / update / setPaused / restart / destroy',
          type: 'EffectHandle',
          defaultValue: '—',
          description:
            'Unified handle methods for visibility, live updates, pause/restart, and idempotent cleanup.',
        },
      ];

  useDocsPageMarkdown(
    formatEffectDocMarkdown({
      title: pageTitle,
      description: pageDescription,
      installCmd: INSTALL_CMD,
      usageCode: USAGE_CODE,
      apiProperties,
      isZh,
    }),
  );

  return (
    <VStack gap={8}>
      <VStack gap={3}>
        <Heading level={1} textWrap="balance">
          {pageTitle}
        </Heading>
        <Text type="body" color="secondary">
          {pageDescription}
        </Text>
      </VStack>

      <CesiumStage
        label={
          isZh ? 'Water Surface 程序化流动水面演示场景' : 'Water Surface 3D CesiumJS demo scene'
        }
        shouldAnimate={false}
        onMount={handleMount}
        paramGroups={paramGroups}
        onResetParams={handleResetParams}
        hasModifiedParams={hasModifiedParams}
        actions={
          <>
            <Button
              label={paused ? (isZh ? '播放' : 'Play') : isZh ? '暂停' : 'Pause'}
              variant="ghost"
              size="sm"
              icon={<Icon icon={paused ? Play : Pause} />}
              onClick={() => setPaused((prev) => !prev)}
            />
            <Button
              label={visible ? (isZh ? '隐藏' : 'Hide') : isZh ? '显示' : 'Show'}
              variant="ghost"
              size="sm"
              icon={<Icon icon={visible ? EyeOff : Eye} />}
              onClick={() => setVisible((prev) => !prev)}
            />
            <Button
              label={isZh ? '重置视角' : 'Reset camera'}
              variant="ghost"
              size="sm"
              icon={<Icon icon={RotateCcw} />}
              onClick={handleResetCamera}
            />
          </>
        }
      />

      <VStack gap={4}>
        <Heading level={2}>{isZh ? '安装' : 'Install'}</Heading>
        <CodeBlock code={INSTALL_CMD} language="bash" width="100%" />
      </VStack>

      <VStack gap={4}>
        <Heading level={2}>{isZh ? '用法' : 'Usage'}</Heading>
        <CodeBlock code={USAGE_CODE} language="ts" width="100%" />
      </VStack>

      <VStack gap={2} paddingBlockEnd={8}>
        <Heading level={2}>{isZh ? 'API 参考' : 'API reference'}</Heading>
        <HStack gap={4} paddingInline={4} paddingBlock={2}>
          <StackItem size="fill">
            <Text type="label" color="secondary">
              {isZh ? '属性' : 'Property'}
            </Text>
          </StackItem>
          <HStack width={130} vAlign="center">
            <Text type="label" color="secondary">
              {isZh ? '类型' : 'Type'}
            </Text>
          </HStack>
          <HStack width={110} vAlign="center">
            <Text type="label" color="secondary">
              {isZh ? '默认值' : 'Default'}
            </Text>
          </HStack>
        </HStack>

        <Card padding={0} width="100%">
          <VStack gap={0}>
            {apiProperties.map((prop, idx) => (
              <Fragment key={prop.property}>
                {idx > 0 && <Divider />}
                <VStack gap={2} padding={4}>
                  <HStack gap={4} vAlign="center">
                    <StackItem size="fill">
                      <Text type="code" weight="medium">
                        {prop.property}
                      </Text>
                    </StackItem>
                    <HStack width={130} vAlign="center">
                      <Code color="secondary">{prop.type}</Code>
                    </HStack>
                    <HStack width={110} vAlign="center">
                      <Code color="secondary">{prop.defaultValue}</Code>
                    </HStack>
                  </HStack>
                  <Text type="body" color="secondary">
                    {prop.description}
                  </Text>
                </VStack>
              </Fragment>
            ))}
          </VStack>
        </Card>
      </VStack>
    </VStack>
  );
}
