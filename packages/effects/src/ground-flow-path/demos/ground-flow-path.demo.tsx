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
import { createGroundFlowPath, type GroundFlowPathHandle } from '../index.ts';

export const meta: EffectDemoMeta = {
  id: 'ground-flow-path',
  title: 'Ground Flow Path',
  section: 'Visual Effects',
  description:
    'Terrain- and 3D-Tiles-clamped GPU flowing energy path built on GroundPolylinePrimitive with a glowing base track and tapered pulse streams.',
  isNew: true,
  order: 7,
};

const INSTALL_CMD = 'pnpm add @cesiumlab/effects cesium';

const USAGE_CODE = `import { createGroundFlowPath } from '@cesiumlab/effects';

// Pass a single LngLat[] path OR a multi-path LngLat[][] road network (auto-batched into 1 Draw Call)
const roadNetwork = createGroundFlowPath(viewer, {
  positions: [
    [
      [103.62, 30.98],
      [104.06, 30.67],
      [104.62, 30.42],
    ],
    [
      [102.86, 30.14],
      [103.58, 30.44],
      [104.07, 30.66],
    ],
  ],
  clampToGround: true, // toggle false for ultra-fast non-clamped massive road networks
  color: '#00e5a0',
  width: 10,
  speed: 1,
  pulseCount: 3,
});

// Seamlessly switch between clamped GroundPolylinePrimitive and lightweight Primitive
roadNetwork.update({ clampToGround: false, height: 1500, speed: 1.6 });
roadNetwork.destroy();`;

const DEMO_PATHS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  // Main northwest-to-southeast mountain-to-basin arterial corridor
  [
    [103.24, 31.18],
    [103.62, 30.98],
    [103.92, 30.78],
    [104.07, 30.66],
    [104.38, 30.52],
    [104.76, 30.28],
    [105.12, 29.94],
  ],
  // Southwest mountain pass branch converging into the basin hub
  [
    [102.86, 30.14],
    [103.22, 30.26],
    [103.58, 30.44],
    [103.88, 30.56],
    [104.07, 30.66],
  ],
  // Northeast highland transit route
  [
    [104.07, 30.66],
    [104.34, 30.92],
    [104.68, 31.16],
    [105.04, 31.42],
  ],
];

function resetCamera(viewer: Viewer) {
  viewer.camera.lookAt(
    Cartesian3.fromDegrees(104.05, 30.66, 0),
    new HeadingPitchRange(CesiumMath.toRadians(18), CesiumMath.toRadians(-38), 380_000),
  );
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
}

const DEFAULTS = {
  color: '#00e5a0',
  width: 10,
  speed: 1,
  pulseCount: 3,
  trailLength: 0.52,
  baseOpacity: 0.35,
  brightness: 1,
  reverse: false,
  loop: false,
  clampToGround: true,
  heightM: 2_500,
} as const;

export default function GroundFlowPathDemoPage() {
  const { isZh } = useI18n();
  const viewerRef = useRef<Viewer | null>(null);
  const pathRef = useRef<GroundFlowPathHandle | null>(null);

  const [paused, setPaused] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [visible, setVisible] = useState(true);
  const [color, setColor] = useState<string>(DEFAULTS.color);
  const [width, setWidth] = useState<number>(DEFAULTS.width);
  const [speed, setSpeed] = useState<number>(DEFAULTS.speed);
  const [pulseCount, setPulseCount] = useState<number>(DEFAULTS.pulseCount);
  const [trailLength, setTrailLength] = useState<number>(DEFAULTS.trailLength);
  const [baseOpacity, setBaseOpacity] = useState<number>(DEFAULTS.baseOpacity);
  const [brightness, setBrightness] = useState<number>(DEFAULTS.brightness);
  const [reverse, setReverse] = useState<boolean>(DEFAULTS.reverse);
  const [loop, setLoop] = useState<boolean>(DEFAULTS.loop);
  const [clampToGround, setClampToGround] = useState<boolean>(DEFAULTS.clampToGround);
  const [heightM, setHeightM] = useState<number>(DEFAULTS.heightM);

  const handleMount = useCallback(
    (viewer: Viewer) => {
      viewerRef.current = viewer;
      pathRef.current = createGroundFlowPath(viewer, {
        positions: DEMO_PATHS,
        color,
        width,
        speed,
        pulseCount,
        trailLength,
        baseOpacity,
        brightness,
        reverse,
        loop,
        clampToGround,
        height: heightM,
        paused,
        show: visible,
      });
      resetCamera(viewer);

      return () => {
        pathRef.current?.destroy();
        pathRef.current = null;
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
    pathRef.current?.destroy();
    pathRef.current = createGroundFlowPath(viewer, {
      positions: DEMO_PATHS,
      color,
      width,
      speed,
      pulseCount,
      trailLength,
      baseOpacity,
      brightness,
      reverse,
      loop,
      clampToGround,
      height: heightM,
      paused,
      show: visible,
    });
    // Rebuild only when construction-only geometry options change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, loop]);

  useEffect(() => {
    pathRef.current?.update({
      color,
      speed,
      pulseCount,
      trailLength,
      baseOpacity,
      brightness,
      reverse,
      clampToGround,
      height: heightM,
    });
  }, [
    color,
    speed,
    pulseCount,
    trailLength,
    baseOpacity,
    brightness,
    reverse,
    clampToGround,
    heightM,
  ]);

  useEffect(() => {
    pathRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    pathRef.current?.setVisible(visible);
  }, [visible]);

  const handleResetCamera = () => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      resetCamera(viewer);
    }
  };

  const hasModifiedParams =
    color !== DEFAULTS.color ||
    width !== DEFAULTS.width ||
    speed !== DEFAULTS.speed ||
    pulseCount !== DEFAULTS.pulseCount ||
    trailLength !== DEFAULTS.trailLength ||
    baseOpacity !== DEFAULTS.baseOpacity ||
    brightness !== DEFAULTS.brightness ||
    reverse !== DEFAULTS.reverse ||
    loop !== DEFAULTS.loop ||
    clampToGround !== DEFAULTS.clampToGround ||
    heightM !== DEFAULTS.heightM;

  const handleResetParams = useCallback(() => {
    setColor(DEFAULTS.color);
    setWidth(DEFAULTS.width);
    setSpeed(DEFAULTS.speed);
    setPulseCount(DEFAULTS.pulseCount);
    setTrailLength(DEFAULTS.trailLength);
    setBaseOpacity(DEFAULTS.baseOpacity);
    setBrightness(DEFAULTS.brightness);
    setReverse(DEFAULTS.reverse);
    setLoop(DEFAULTS.loop);
    setClampToGround(DEFAULTS.clampToGround);
    setHeightM(DEFAULTS.heightM);
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
            label: isZh ? '路径颜色' : 'Color',
            value: color,
            onChange: setColor,
          },
          {
            type: 'slider',
            id: 'width',
            label: isZh ? `线宽 · ${width}px` : `Width · ${width}px`,
            value: width,
            min: 4,
            max: 24,
            step: 1,
            onChange: setWidth,
          },
          {
            type: 'slider',
            id: 'baseOpacity',
            label: isZh
              ? `底线透明度 · ${Math.round(baseOpacity * 100)}%`
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
            type: 'switch',
            id: 'clampToGround',
            label: isZh ? '贴合地形' : 'Clamp to ground',
            value: clampToGround,
            onChange: setClampToGround,
          },
          ...(!clampToGround
            ? [
                {
                  type: 'slider' as const,
                  id: 'height',
                  label: isZh
                    ? `海拔高度 · ${(heightM / 1_000).toFixed(1)}km`
                    : `Elevation · ${(heightM / 1_000).toFixed(1)}km`,
                  value: heightM,
                  min: 0,
                  max: 10_000,
                  step: 500,
                  onChange: setHeightM,
                },
              ]
            : []),
          {
            type: 'switch',
            id: 'loop',
            label: isZh ? '首尾闭合' : 'Closed loop',
            value: loop,
            onChange: setLoop,
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
            label: isZh ? `流速 · ${speed.toFixed(1)}x` : `Speed · ${speed.toFixed(1)}x`,
            value: speed,
            min: 0,
            max: 3,
            step: 0.1,
            onChange: setSpeed,
          },
          {
            type: 'slider',
            id: 'pulseCount',
            label: isZh ? `流光段数 · ${pulseCount}` : `Pulses · ${pulseCount}`,
            value: pulseCount,
            min: 1,
            max: 8,
            step: 1,
            onChange: setPulseCount,
          },
          {
            type: 'slider',
            id: 'trailLength',
            label: isZh
              ? `拖尾占比 · ${Math.round(trailLength * 100)}%`
              : `Trail · ${Math.round(trailLength * 100)}%`,
            value: trailLength,
            min: 0.15,
            max: 0.9,
            step: 0.05,
            onChange: setTrailLength,
          },
          {
            type: 'switch',
            id: 'reverse',
            label: isZh ? '反向流动' : 'Reverse flow',
            value: reverse,
            onChange: setReverse,
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
      clampToGround,
      heightM,
      loop,
      speed,
      pulseCount,
      trailLength,
      reverse,
    ],
  );

  const pageTitle = isZh ? '贴地流光路径 (Ground Flow Path)' : meta.title;
  const pageDescription = isZh
    ? '基于 GroundPolylinePrimitive 与自定义 GLSL 着色器的贴地流光路径：自动贴合起伏地形与 3D Tiles 表面，融合双层发光底路、错位脉冲流光与收尖渐隐拖尾，适用于城市路网、交通走廊与管网能源可视化。'
    : meta.description;

  const apiProperties = isZh
    ? [
        {
          property: 'positions',
          type: '[lng, lat][]',
          defaultValue: 'required',
          description: '路径顶点经纬度数组（至少 2 个点），自动沿地表起伏贴合。',
        },
        {
          property: 'color',
          type: 'Color | string',
          defaultValue: "'#00e5a0'",
          description: '底路与流光脉冲颜色，支持 Cesium Color 或 CSS 色值。',
        },
        {
          property: 'width',
          type: 'number',
          defaultValue: '10',
          description: '屏幕空间路径像素宽度。',
        },
        {
          property: 'speed / reverse',
          type: 'number / boolean',
          defaultValue: '1 / false',
          description: '流光沿路径推进的速度倍率及是否反向流动。',
        },
        {
          property: 'pulseCount / trailLength',
          type: 'number',
          defaultValue: '3 / 0.52',
          description: '同轨错位流光段数（1–8）以及单段收尖拖尾占比（0.1–0.95）。',
        },
        {
          property: 'baseOpacity / brightness',
          type: 'number',
          defaultValue: '0.35 / 1',
          description: '常驻发光底路透明度与流光脉冲亮度系数。',
        },
        {
          property: 'loop / classificationType',
          type: 'boolean / ClassificationType',
          defaultValue: 'false / BOTH',
          description: '是否首尾闭合以及贴合目标类型（地形、3D Tiles 或两者同时）。',
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
          description: '统一特效句柄方法：显隐切换、O(1) 更新 GPU 参数、暂停/重置与幂等销毁。',
        },
      ]
    : [
        {
          property: 'positions',
          type: '[lng, lat][]',
          defaultValue: 'required',
          description:
            'Ordered [longitude, latitude] vertices (minimum 2 points) clamped to terrain.',
        },
        {
          property: 'color',
          type: 'Color | string',
          defaultValue: "'#00e5a0'",
          description: 'Base track and flowing pulse color (Cesium Color or CSS string).',
        },
        {
          property: 'width',
          type: 'number',
          defaultValue: '10',
          description: 'Screen-space path width in pixels.',
        },
        {
          property: 'speed / reverse',
          type: 'number / boolean',
          defaultValue: '1 / false',
          description: 'Live flow speed multiplier and flow direction toggle.',
        },
        {
          property: 'pulseCount / trailLength',
          type: 'number',
          defaultValue: '3 / 0.52',
          description:
            'Number of staggered pulses along the path (1–8) and tapered trail fraction.',
        },
        {
          property: 'baseOpacity / brightness',
          type: 'number',
          defaultValue: '0.35 / 1',
          description: 'Static base track opacity and flowing pulse brightness multiplier.',
        },
        {
          property: 'loop / classificationType',
          type: 'boolean / ClassificationType',
          defaultValue: 'false / BOTH',
          description:
            'Whether to close the loop and whether to clamp to terrain, 3D Tiles, or both.',
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
        label={
          isZh ? 'Ground Flow Path 贴地流光路径演示场景' : 'Ground Flow Path 3D CesiumJS demo scene'
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
