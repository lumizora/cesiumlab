import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Cartesian3,
  HeadingPitchRange,
  Math as CesiumMath,
  Matrix4,
  type Viewer,
} from '@cesiumlab/cesium';
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
import { createViewshed, type ViewshedHandle } from '../index.ts';

export const meta: EffectDemoMeta = {
  id: 'viewshed',
  title: '3D Viewshed',
  section: 'Visual Effects',
  description:
    'Real-time GPU 3D viewshed & line-of-sight analysis using an off-screen ShadowMap depth pass to project visible (green) and occluded (red) areas onto terrain and 3D buildings.',
  isNew: true,
  order: 18,
};

const INSTALL_CMD = 'pnpm add @cesiumlab/effects @cesiumlab/cesium';

const USAGE_CODE = `import { createViewshed } from '@cesiumlab/effects';

const viewshed = createViewshed(viewer, {
  observer: [102.91, 31.11],
  observerHeight: 4_350,
  heading: 225,
  pitch: -18,
  horizontalFov: 80,
  verticalFov: 50,
  distance: 9_000,
  visibleColor: '#00e5a0',
  hiddenColor: '#ff3b5c',
  autoSweep: true,
});

// Live orientation & FOV adjustment
viewshed.update({ heading: 180, pitch: -24, distance: 12_000 });
viewshed.destroy();`;

// Alpine ridge vantage point in Siguniang / Qionglai range showcasing dramatic terrain occlusion
const OBSERVER_COORD: readonly [number, number] = [102.91, 31.11];

function resetCamera(viewer: Viewer) {
  viewer.camera.lookAt(
    Cartesian3.fromDegrees(OBSERVER_COORD[0] - 0.02, OBSERVER_COORD[1] - 0.02, 3_600),
    new HeadingPitchRange(CesiumMath.toRadians(35), CesiumMath.toRadians(-34), 16_500),
  );
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
}

const DEFAULTS = {
  observerHeight: 4_350,
  heading: 225,
  pitch: -18,
  horizontalFov: 80,
  verticalFov: 50,
  distanceKm: 9,
  visibleColor: '#00e5a0',
  hiddenColor: '#ff3b5c',
  opacity: 0.58,
  showFrustum: true,
  autoSweep: true,
  sweepSpeed: 0.5,
  sweepRange: 30,
} as const;

export default function ViewshedDemoPage() {
  const { isZh } = useI18n();
  const viewerRef = useRef<Viewer | null>(null);
  const viewshedRef = useRef<ViewshedHandle | null>(null);

  const [observerHeight, setObserverHeight] = useState<number>(DEFAULTS.observerHeight);
  const [heading, setHeading] = useState<number>(DEFAULTS.heading);
  const [pitch, setPitch] = useState<number>(DEFAULTS.pitch);
  const [horizontalFov, setHorizontalFov] = useState<number>(DEFAULTS.horizontalFov);
  const [verticalFov, setVerticalFov] = useState<number>(DEFAULTS.verticalFov);
  const [distanceKm, setDistanceKm] = useState<number>(DEFAULTS.distanceKm);
  const [visibleColor, setVisibleColor] = useState<string>(DEFAULTS.visibleColor);
  const [hiddenColor, setHiddenColor] = useState<string>(DEFAULTS.hiddenColor);
  const [opacity, setOpacity] = useState<number>(DEFAULTS.opacity);
  const [showFrustum, setShowFrustum] = useState<boolean>(DEFAULTS.showFrustum);
  const [autoSweep, setAutoSweep] = useState<boolean>(DEFAULTS.autoSweep);
  const [sweepSpeed, setSweepSpeed] = useState<number>(DEFAULTS.sweepSpeed);
  const [sweepRange, setSweepRange] = useState<number>(DEFAULTS.sweepRange);
  const [paused, setPaused] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [visible, setVisible] = useState(true);

  const handleMount = useCallback(
    (viewer: Viewer) => {
      viewerRef.current = viewer;
      const handle = createViewshed(viewer, {
        observer: OBSERVER_COORD,
        observerHeight,
        heading,
        pitch,
        horizontalFov,
        verticalFov,
        distance: distanceKm * 1_000,
        visibleColor,
        hiddenColor,
        opacity,
        showFrustum,
        autoSweep,
        sweepSpeed,
        sweepRange,
        show: visible,
        paused,
      });
      viewshedRef.current = handle;
      resetCamera(viewer);
      return () => {
        handle.destroy();
        viewshedRef.current = null;
        viewerRef.current = null;
      };
    },
    // Mount once; live updates flow through handle.update() below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    viewshedRef.current?.update({
      observerHeight,
      heading,
      pitch,
      horizontalFov,
      verticalFov,
      distance: distanceKm * 1_000,
      visibleColor,
      hiddenColor,
      opacity,
      showFrustum,
      autoSweep,
      sweepSpeed,
      sweepRange,
    });
  }, [
    observerHeight,
    heading,
    pitch,
    horizontalFov,
    verticalFov,
    distanceKm,
    visibleColor,
    hiddenColor,
    opacity,
    showFrustum,
    autoSweep,
    sweepSpeed,
    sweepRange,
  ]);

  useEffect(() => {
    viewshedRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    viewshedRef.current?.setVisible(visible);
  }, [visible]);

  const handleResetParams = useCallback(() => {
    setObserverHeight(DEFAULTS.observerHeight);
    setHeading(DEFAULTS.heading);
    setPitch(DEFAULTS.pitch);
    setHorizontalFov(DEFAULTS.horizontalFov);
    setVerticalFov(DEFAULTS.verticalFov);
    setDistanceKm(DEFAULTS.distanceKm);
    setVisibleColor(DEFAULTS.visibleColor);
    setHiddenColor(DEFAULTS.hiddenColor);
    setOpacity(DEFAULTS.opacity);
    setShowFrustum(DEFAULTS.showFrustum);
    setAutoSweep(DEFAULTS.autoSweep);
    setSweepSpeed(DEFAULTS.sweepSpeed);
    setSweepRange(DEFAULTS.sweepRange);
  }, []);

  const hasModifiedParams =
    observerHeight !== DEFAULTS.observerHeight ||
    heading !== DEFAULTS.heading ||
    pitch !== DEFAULTS.pitch ||
    horizontalFov !== DEFAULTS.horizontalFov ||
    verticalFov !== DEFAULTS.verticalFov ||
    distanceKm !== DEFAULTS.distanceKm ||
    visibleColor !== DEFAULTS.visibleColor ||
    hiddenColor !== DEFAULTS.hiddenColor ||
    opacity !== DEFAULTS.opacity ||
    showFrustum !== DEFAULTS.showFrustum ||
    autoSweep !== DEFAULTS.autoSweep ||
    sweepSpeed !== DEFAULTS.sweepSpeed ||
    sweepRange !== DEFAULTS.sweepRange;

  const paramGroups = useMemo<ParamGroup[]>(
    () => [
      {
        id: 'sensor',
        label: isZh ? '观察点与姿态' : 'Observer & Attitude',
        controls: [
          {
            type: 'slider',
            id: 'observerHeight',
            label: isZh ? `观察点高程 · ${observerHeight}m` : `Observer alt · ${observerHeight}m`,
            value: observerHeight,
            min: 3_200,
            max: 5_800,
            step: 50,
            onChange: setObserverHeight,
          },
          {
            type: 'slider',
            id: 'heading',
            label: isZh ? `方位角 · ${heading}°` : `Heading · ${heading}°`,
            value: heading,
            min: 0,
            max: 360,
            step: 2,
            onChange: setHeading,
          },
          {
            type: 'slider',
            id: 'pitch',
            label: isZh ? `俯仰角 · ${pitch}°` : `Pitch · ${pitch}°`,
            value: pitch,
            min: -60,
            max: 15,
            step: 1,
            onChange: setPitch,
          },
          {
            type: 'slider',
            id: 'distanceKm',
            label: isZh ? `探测距离 · ${distanceKm}km` : `Range · ${distanceKm}km`,
            value: distanceKm,
            min: 2,
            max: 20,
            step: 1,
            onChange: setDistanceKm,
          },
        ],
      },
      {
        id: 'frustum',
        label: isZh ? '视锥与巡航' : 'Frustum & Patrol',
        controls: [
          {
            type: 'slider',
            id: 'horizontalFov',
            label: isZh ? `水平视场角 · ${horizontalFov}°` : `Horizontal FOV · ${horizontalFov}°`,
            value: horizontalFov,
            min: 20,
            max: 130,
            step: 2,
            onChange: setHorizontalFov,
          },
          {
            type: 'slider',
            id: 'verticalFov',
            label: isZh ? `垂直视场角 · ${verticalFov}°` : `Vertical FOV · ${verticalFov}°`,
            value: verticalFov,
            min: 15,
            max: 90,
            step: 2,
            onChange: setVerticalFov,
          },
          {
            type: 'switch',
            id: 'showFrustum',
            label: isZh ? '显示 3D 视锥线框' : 'Show 3D frustum',
            value: showFrustum,
            onChange: setShowFrustum,
          },
          {
            type: 'switch',
            id: 'autoSweep',
            label: isZh ? '自动巡航扫描' : 'Auto patrol sweep',
            value: autoSweep,
            onChange: setAutoSweep,
          },
          ...(autoSweep
            ? [
                {
                  type: 'slider' as const,
                  id: 'sweepRange',
                  label: isZh ? `巡航摆幅 · ±${sweepRange}°` : `Sweep range · ±${sweepRange}°`,
                  value: sweepRange,
                  min: 5,
                  max: 75,
                  step: 5,
                  onChange: setSweepRange,
                },
                {
                  type: 'slider' as const,
                  id: 'sweepSpeed',
                  label: isZh
                    ? `巡航速度 · ${sweepSpeed.toFixed(1)}x`
                    : `Sweep speed · ${sweepSpeed.toFixed(1)}x`,
                  value: sweepSpeed,
                  min: 0.1,
                  max: 2,
                  step: 0.1,
                  onChange: setSweepSpeed,
                },
              ]
            : []),
        ],
      },
      {
        id: 'appearance',
        label: isZh ? '可视与盲区配色' : 'Visibility Colors',
        controls: [
          {
            type: 'color',
            id: 'visibleColor',
            label: isZh ? '通视可见区' : 'Visible area',
            value: visibleColor,
            onChange: setVisibleColor,
          },
          {
            type: 'color',
            id: 'hiddenColor',
            label: isZh ? '遮挡盲区' : 'Occluded area',
            value: hiddenColor,
            onChange: setHiddenColor,
          },
          {
            type: 'slider',
            id: 'opacity',
            label: isZh
              ? `投射透明度 · ${Math.round(opacity * 100)}%`
              : `Overlay opacity · ${Math.round(opacity * 100)}%`,
            value: opacity,
            min: 0.15,
            max: 0.95,
            step: 0.05,
            onChange: setOpacity,
          },
        ],
      },
    ],
    [
      isZh,
      observerHeight,
      heading,
      pitch,
      distanceKm,
      horizontalFov,
      verticalFov,
      showFrustum,
      autoSweep,
      sweepRange,
      sweepSpeed,
      visibleColor,
      hiddenColor,
      opacity,
    ],
  );

  const handleResetCamera = () => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      resetCamera(viewer);
    }
  };

  const pageTitle = isZh ? '三维通视分析 (3D Viewshed)' : meta.title;
  const pageDescription = isZh
    ? '基于观察点虚拟相机 + 离屏 ShadowMap 深度贴图与 PostProcessStage 投射着色器的纯 GPU 三维通视分析：实时计算地形山脊与 3D 建筑遮挡，在真实地表像素级区分绿色可见区与红色盲区，支持 3D 视锥线框与自动巡航扫描。'
    : meta.description;

  const apiProperties = isZh
    ? [
        {
          property: 'observer / observerHeight',
          type: '[lng, lat] / number',
          defaultValue: 'required / 120',
          description: '观察点经纬度（度）及海拔高程（米）。',
        },
        {
          property: 'heading / pitch',
          type: 'number',
          defaultValue: '0 / -18',
          description: '观察方位角（度，0=正北，90=正东）与俯仰角（度，负值向下）。',
        },
        {
          property: 'horizontalFov / verticalFov',
          type: 'number',
          defaultValue: '75 / 48',
          description: '水平视场角与垂直视场角（度）。',
        },
        {
          property: 'distance',
          type: 'number',
          defaultValue: '3500',
          description: '最大通视分析探测距离（米）。',
        },
        {
          property: 'visibleColor / hiddenColor / opacity',
          type: 'Color | string / number',
          defaultValue: "'#00e5a0' / '#ff3b5c' / 0.58",
          description: '可见区与遮挡盲区投射颜色及叠加不透明度。',
        },
        {
          property: 'showFrustum',
          type: 'boolean',
          defaultValue: 'true',
          description: '是否叠加三维传感器视锥线框。',
        },
        {
          property: 'autoSweep / sweepRange / sweepSpeed',
          type: 'boolean / number',
          defaultValue: 'false / 35 / 0.6',
          description: '是否开启自动巡航扫描、左右摆幅（度）与摆动速度。',
        },
        {
          property: 'shadowMapSize',
          type: 'number',
          defaultValue: '1024',
          description: '离屏深度阴影贴图分辨率（512 / 1024 / 2048）。',
        },
        {
          property: 'update / show / hide / destroy',
          type: 'ViewshedHandle',
          defaultValue: '—',
          description: '实时热更新观察姿态/视场角，以及统一句柄显隐与幂等资源销毁。',
        },
      ]
    : [
        {
          property: 'observer / observerHeight',
          type: '[lng, lat] / number',
          defaultValue: 'required / 120',
          description: 'Observer [longitude, latitude] in degrees and altitude in metres.',
        },
        {
          property: 'heading / pitch',
          type: 'number',
          defaultValue: '0 / -18',
          description: 'Viewing azimuth heading (0 = North, 90 = East) and pitch in degrees.',
        },
        {
          property: 'horizontalFov / verticalFov',
          type: 'number',
          defaultValue: '75 / 48',
          description: 'Horizontal and vertical field of view in degrees.',
        },
        {
          property: 'distance',
          type: 'number',
          defaultValue: '3500',
          description: 'Maximum analysis range in metres.',
        },
        {
          property: 'visibleColor / hiddenColor / opacity',
          type: 'Color | string / number',
          defaultValue: "'#00e5a0' / '#ff3b5c' / 0.58",
          description: 'Projected colors for visible and occluded zones plus overlay opacity.',
        },
        {
          property: 'showFrustum',
          type: 'boolean',
          defaultValue: 'true',
          description: 'Toggle 3D sensor frustum wireframe lines.',
        },
        {
          property: 'autoSweep / sweepRange / sweepSpeed',
          type: 'boolean / number',
          defaultValue: 'false / 35 / 0.6',
          description:
            'Enable automated patrol sweep, oscillation half-angle (degrees), and speed.',
        },
        {
          property: 'shadowMapSize',
          type: 'number',
          defaultValue: '1024',
          description: 'Off-screen shadow map resolution (512, 1024, or 2048).',
        },
        {
          property: 'update / show / hide / destroy',
          type: 'ViewshedHandle',
          defaultValue: '—',
          description:
            'Live attitude/FOV updates plus unified handle visibility and cleanup methods.',
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
        label={isZh ? 'Viewshed 三维通视分析演示场景' : 'Viewshed 3D CesiumJS demo scene'}
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

        <HStack paddingInline={4} paddingBlock={2} gap={4} vAlign="center">
          <StackItem size="fill">
            <Text type="label" color="secondary">
              {isZh ? '属性' : 'Property'}
            </Text>
          </StackItem>
          <HStack width={140} vAlign="center">
            <Text type="label" color="secondary">
              {isZh ? '类型' : 'Type'}
            </Text>
          </HStack>
          <HStack width={130} vAlign="center">
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
                    <HStack width={140} vAlign="center">
                      <Code color="secondary">{prop.type}</Code>
                    </HStack>
                    <HStack width={130} vAlign="center">
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
