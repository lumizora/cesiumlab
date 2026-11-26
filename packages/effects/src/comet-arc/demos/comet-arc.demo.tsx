import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cartesian3, HeadingPitchRange, Math as CesiumMath, Matrix4, type Viewer } from '@cesiumlab/cesium';
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
import { createCometArc, type CometArcHandle } from '../index.ts';

export const meta: EffectDemoMeta = {
  id: 'comet-arc',
  title: 'Comet Arc',
  section: 'Visual Effects',
  description:
    'GPU-driven 3D geodesic comet arc rendered as a single Primitive with a custom GLSL shader for a luminous base curve, tapered comet trail, and seamless incandescent head.',
  isNew: true,
  order: 1,
};

const INSTALL_CMD = 'pnpm add @cesiumlab/effects @cesiumlab/cesium';

const USAGE_CODE = `import { createCometArc } from '@cesiumlab/effects';

const arc = createCometArc(viewer, {
  from: [104.07, 30.57],   // Chengdu
  to: [121.47, 31.23],     // Shanghai
  color: '#ffa31a',
  speed: 1,
  trailLength: 0.24,
  cometCount: 1,
  onArrive: () => console.log('Comet arrived'),
});

// O(1) GPU uniform updates
arc.update({ speed: 1.5, trailLength: 0.32, cometCount: 2 });

// Pause / resume or clean up
arc.setPaused(true);
arc.destroy();`;

const DEMO_ROUTES: ReadonlyArray<{ from: readonly [number, number]; phase: number }> = [
  { from: [87.6168, 43.8256], phase: 0 },
  { from: [91.1409, 29.6456], phase: 0.16 },
  { from: [104.0668, 30.5728], phase: 0.32 },
  { from: [126.6424, 45.7567], phase: 0.5 },
  { from: [113.2644, 23.1291], phase: 0.72 },
];
const HUB_COORD: readonly [number, number] = [121.4737, 31.2304];

function resetCamera(viewer: Viewer) {
  viewer.camera.lookAt(
    Cartesian3.fromDegrees(108, 32, 0),
    new HeadingPitchRange(CesiumMath.toRadians(342), CesiumMath.toRadians(-52), 5_400_000),
  );
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
}

const DEFAULTS = {
  color: '#ffa31a',
  heightKm: 640,
  width: 14,
  duration: 3.6,
  speed: 1,
  trailLength: 0.24,
  cometCount: 1,
  baseOpacity: 0.45,
  brightness: 1,
} as const;

export default function CometArcDemoPage() {
  const { isZh } = useI18n();
  const viewerRef = useRef<Viewer | null>(null);
  const arcsRef = useRef<CometArcHandle[]>([]);

  const [paused, setPaused] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [visible, setVisible] = useState(true);
  const [color, setColor] = useState<string>(DEFAULTS.color);
  const [heightKm, setHeightKm] = useState<number>(DEFAULTS.heightKm);
  const [width, setWidth] = useState<number>(DEFAULTS.width);
  const [duration, setDuration] = useState<number>(DEFAULTS.duration);
  const [speed, setSpeed] = useState<number>(DEFAULTS.speed);
  const [trailLength, setTrailLength] = useState<number>(DEFAULTS.trailLength);
  const [cometCount, setCometCount] = useState<number>(DEFAULTS.cometCount);
  const [baseOpacity, setBaseOpacity] = useState<number>(DEFAULTS.baseOpacity);
  const [brightness, setBrightness] = useState<number>(DEFAULTS.brightness);

  const rebuildArcs = useCallback(
    (viewer: Viewer, nextWidth: number, nextDuration: number) => {
      for (const arc of arcsRef.current) {
        arc.destroy();
      }
      arcsRef.current = DEMO_ROUTES.map((route) =>
        createCometArc(viewer, {
          from: route.from,
          to: HUB_COORD,
          phase: route.phase,
          color,
          height: heightKm * 1_000,
          width: nextWidth,
          duration: nextDuration,
          speed,
          trailLength,
          cometCount,
          baseOpacity,
          brightness,
          paused,
          show: visible,
        }),
      );
    },
    // Rebuild only when construction-only options change; live options use update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleMount = useCallback(
    (viewer: Viewer) => {
      viewerRef.current = viewer;
      rebuildArcs(viewer, width, duration);
      resetCamera(viewer);

      return () => {
        for (const arc of arcsRef.current) {
          arc.destroy();
        }
        arcsRef.current = [];
        viewerRef.current = null;
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    for (const arc of arcsRef.current) {
      arc.destroy();
    }
    arcsRef.current = DEMO_ROUTES.map((route) =>
      createCometArc(viewer, {
        from: route.from,
        to: HUB_COORD,
        phase: route.phase,
        color,
        height: heightKm * 1_000,
        width,
        duration,
        speed,
        trailLength,
        cometCount,
        baseOpacity,
        brightness,
        paused,
        show: visible,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, duration]);

  useEffect(() => {
    for (const arc of arcsRef.current) {
      arc.update({
        color,
        height: heightKm * 1_000,
        speed,
        trailLength,
        cometCount,
        baseOpacity,
        brightness,
      });
    }
  }, [color, heightKm, speed, trailLength, cometCount, baseOpacity, brightness]);

  const hasModifiedParams =
    color !== DEFAULTS.color ||
    heightKm !== DEFAULTS.heightKm ||
    width !== DEFAULTS.width ||
    duration !== DEFAULTS.duration ||
    speed !== DEFAULTS.speed ||
    trailLength !== DEFAULTS.trailLength ||
    cometCount !== DEFAULTS.cometCount ||
    baseOpacity !== DEFAULTS.baseOpacity ||
    brightness !== DEFAULTS.brightness;

  const handleResetParams = useCallback(() => {
    setColor(DEFAULTS.color);
    setHeightKm(DEFAULTS.heightKm);
    setWidth(DEFAULTS.width);
    setDuration(DEFAULTS.duration);
    setSpeed(DEFAULTS.speed);
    setTrailLength(DEFAULTS.trailLength);
    setCometCount(DEFAULTS.cometCount);
    setBaseOpacity(DEFAULTS.baseOpacity);
    setBrightness(DEFAULTS.brightness);
  }, []);

  const paramGroups = useMemo<ParamGroup[]>(
    () => [
      {
        id: 'appearance',
        label: isZh ? '外观' : 'Appearance',
        controls: [
          {
            type: 'color',
            id: 'color',
            label: isZh ? '光流颜色' : 'Color',
            value: color,
            onChange: setColor,
          },
          {
            type: 'slider',
            id: 'width',
            label: isZh ? `线宽 · ${width}px` : `Width · ${width}px`,
            value: width,
            min: 6,
            max: 28,
            step: 1,
            onChange: setWidth,
          },
          {
            type: 'slider',
            id: 'baseOpacity',
            label: isZh
              ? `底弧透明度 · ${Math.round(baseOpacity * 100)}%`
              : `Base opacity · ${Math.round(baseOpacity * 100)}%`,
            value: baseOpacity,
            min: 0,
            max: 1,
            step: 0.05,
            onChange: setBaseOpacity,
          },
          {
            type: 'slider',
            id: 'brightness',
            label: isZh
              ? `亮度 · ${brightness.toFixed(1)}x`
              : `Brightness · ${brightness.toFixed(1)}x`,
            value: brightness,
            min: 0.4,
            max: 2,
            step: 0.1,
            onChange: setBrightness,
          },
        ],
      },
      {
        id: 'geometry',
        label: isZh ? '几何' : 'Geometry',
        controls: [
          {
            type: 'slider',
            id: 'height',
            label: isZh ? `弧顶高度 · ${heightKm}km` : `Peak height · ${heightKm}km`,
            value: heightKm,
            min: 200,
            max: 1400,
            step: 20,
            onChange: setHeightKm,
          },
        ],
      },
      {
        id: 'motion',
        label: isZh ? '动画' : 'Motion',
        controls: [
          {
            type: 'slider',
            id: 'speed',
            label: isZh ? `速度 · ${speed.toFixed(1)}x` : `Speed · ${speed.toFixed(1)}x`,
            value: speed,
            min: 0.2,
            max: 3,
            step: 0.1,
            onChange: setSpeed,
          },
          {
            type: 'slider',
            id: 'trailLength',
            label: isZh
              ? `拖尾 · ${Math.round(trailLength * 100)}%`
              : `Trail · ${Math.round(trailLength * 100)}%`,
            value: trailLength,
            min: 0.08,
            max: 0.65,
            step: 0.01,
            onChange: setTrailLength,
          },
          {
            type: 'slider',
            id: 'cometCount',
            label: isZh ? `光流数量 · ${cometCount}` : `Comets · ${cometCount}`,
            value: cometCount,
            min: 1,
            max: 4,
            step: 1,
            onChange: setCometCount,
          },
          {
            type: 'slider',
            id: 'duration',
            label: isZh ? `周期 · ${duration.toFixed(1)}s` : `Duration · ${duration.toFixed(1)}s`,
            value: duration,
            min: 1.5,
            max: 8,
            step: 0.5,
            onChange: setDuration,
          },
        ],
      },
    ],
    [
      isZh,
      color,
      width,
      baseOpacity,
      brightness,
      heightKm,
      speed,
      trailLength,
      cometCount,
      duration,
    ],
  );

  useEffect(() => {
    for (const arc of arcsRef.current) {
      arc.setPaused(paused);
    }
  }, [paused]);

  useEffect(() => {
    for (const arc of arcsRef.current) {
      arc.setVisible(visible);
    }
  }, [visible]);

  const handleResetCamera = () => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      resetCamera(viewer);
    }
  };

  const pageTitle = isZh ? '拖尾飞线 (Comet Arc)' : meta.title;
  const pageDescription = isZh
    ? '纯 GPU 自定义 GLSL 着色器驱动的三维测地线飞线：单 Primitive 静态构建、0 每帧顶点重建，头尾无缝融合并带横向收尖拖尾，支持同轨多光流。'
    : meta.description;

  const apiProperties = isZh
    ? [
        {
          property: 'from / to',
          type: '[lng, lat]',
          defaultValue: 'required',
          description: '起止点经纬度（单位：度），两点必须不同且不能接近对跖点。',
        },
        {
          property: 'color',
          type: 'Color | string',
          defaultValue: "'#ffa31a'",
          description: '底弧、彗星头部与拖尾颜色，支持 Cesium Color 或 CSS 色值。',
        },
        {
          property: 'height / width',
          type: 'number',
          defaultValue: 'auto / 14',
          description: '弧顶高度（米，默认按距离自适应）与屏幕空间光带像素宽度。',
        },
        {
          property: 'duration / speed',
          type: 'number',
          defaultValue: 'auto / 1',
          description: '单程基础飞行秒数与实时 GPU 速度倍率。',
        },
        {
          property: 'trailLength / cometCount',
          type: 'number',
          defaultValue: '0.24 / 1',
          description: '收尖彗星拖尾占比，以及同轨错位发射的光流数量（1–4）。',
        },
        {
          property: 'baseOpacity / brightness',
          type: 'number',
          defaultValue: '0.45 / 1',
          description: '常驻底弧透明度与彗星光流亮度系数。',
        },
        {
          property: 'show / paused',
          type: 'boolean',
          defaultValue: 'true / false',
          description: '初始是否可见、初始是否暂停动画。',
        },
        {
          property: 'onArrive',
          type: '() => void',
          defaultValue: 'undefined',
          description: '主光流抵达终点时触发，可用于联动 Pulse Ring 强脉冲。',
        },
        {
          property: 'show / hide / setVisible / update / setPaused / restart / destroy',
          type: 'EffectHandle',
          defaultValue: '—',
          description: '统一特效句柄方法：显隐切换、O(1) 更新参数、暂停/重置与幂等销毁。',
        },
      ]
    : [
        {
          property: 'from / to',
          type: '[lng, lat]',
          defaultValue: 'required',
          description:
            'Origin and destination [lng, lat] in degrees. Must differ and not be antipodal.',
        },
        {
          property: 'color',
          type: 'Color | string',
          defaultValue: "'#ffa31a'",
          description: 'Base arc, comet head, and trail color (Cesium Color or CSS string).',
        },
        {
          property: 'height / width',
          type: 'number',
          defaultValue: 'auto / 14',
          description:
            'Peak altitude in metres (auto-scaled by distance) and ribbon width in pixels.',
        },
        {
          property: 'duration / speed',
          type: 'number',
          defaultValue: 'auto / 1',
          description: 'Base cycle duration in seconds and live GPU speed multiplier.',
        },
        {
          property: 'trailLength / cometCount',
          type: 'number',
          defaultValue: '0.24 / 1',
          description: 'Tapered trail fraction and number of staggered comets per arc (1–4).',
        },
        {
          property: 'baseOpacity / brightness',
          type: 'number',
          defaultValue: '0.45 / 1',
          description: 'Static base arc opacity and comet head/trail brightness multiplier.',
        },
        {
          property: 'show / paused',
          type: 'boolean',
          defaultValue: 'true / false',
          description: 'Initial visibility and paused state.',
        },
        {
          property: 'onArrive',
          type: '() => void',
          defaultValue: 'undefined',
          description: 'Callback fired each time the primary comet reaches `to`.',
        },
        {
          property: 'show / hide / setVisible / update / setPaused / restart / destroy',
          type: 'EffectHandle',
          defaultValue: '—',
          description:
            'Unified handle methods for visibility, O(1) GPU updates, pause/restart, and idempotent cleanup.',
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
        label={isZh ? 'Comet Arc 三维飞线演示场景' : 'Comet Arc 3D CesiumJS demo scene'}
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
