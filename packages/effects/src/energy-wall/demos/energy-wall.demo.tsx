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
import { createEnergyWall, type EnergyWallHandle } from '../index.ts';

export const meta: EffectDemoMeta = {
  id: 'energy-wall',
  title: 'Energy Wall',
  section: 'Visual Effects',
  description:
    'GPU-driven luminous vertical energy fence along any polygon or polyline boundary with rising scan waves and crisp glowing footprint.',
  isNew: true,
  order: 4,
};

const INSTALL_CMD = 'pnpm add @cesiumlab/effects @cesiumlab/cesium';

const USAGE_CODE = `import { createEnergyWall } from '@cesiumlab/effects';

const wall = createEnergyWall(viewer, {
  positions: [
    [120.85, 31.48],
    [121.95, 31.48],
    [122.15, 30.82],
    [121.15, 30.68],
    [120.72, 31.05],
  ],
  color: '#00d4ff',
  height: 36_000,
  speed: 1,
  repeat: 3,
});

// Live GPU updates & unified EffectHandle controls
wall.update({ speed: 1.6, height: 48_000 });
wall.hide();
wall.show();
wall.destroy();`;

const DEMO_POLYGON: ReadonlyArray<readonly [number, number]> = [
  [120.85, 31.52],
  [121.92, 31.56],
  [122.18, 30.92],
  [121.48, 30.62],
  [120.72, 30.98],
];

function resetCamera(viewer: Viewer) {
  viewer.camera.lookAt(
    Cartesian3.fromDegrees(121.45, 31.12, 0),
    new HeadingPitchRange(CesiumMath.toRadians(342), CesiumMath.toRadians(-38), 320_000),
  );
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
}

const DEFAULTS = {
  color: '#00d4ff',
  heightKm: 36,
  baseHeightKm: 0,
  closed: true,
  clampToGround: true,
  speed: 1,
  opacity: 0.85,
  repeat: 3,
} as const;

export default function EnergyWallDemoPage() {
  const { isZh } = useI18n();
  const viewerRef = useRef<Viewer | null>(null);
  const wallRef = useRef<EnergyWallHandle | null>(null);

  const [paused, setPaused] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [visible, setVisible] = useState(true);
  const [color, setColor] = useState<string>(DEFAULTS.color);
  const [heightKm, setHeightKm] = useState<number>(DEFAULTS.heightKm);
  const [baseHeightKm, setBaseHeightKm] = useState<number>(DEFAULTS.baseHeightKm);
  const [closed, setClosed] = useState<boolean>(DEFAULTS.closed);
  const [clampToGround, setClampToGround] = useState<boolean>(DEFAULTS.clampToGround);
  const [speed, setSpeed] = useState<number>(DEFAULTS.speed);
  const [opacity, setOpacity] = useState<number>(DEFAULTS.opacity);
  const [repeat, setRepeat] = useState<number>(DEFAULTS.repeat);

  const handleMount = useCallback(
    (viewer: Viewer) => {
      viewerRef.current = viewer;
      wallRef.current = createEnergyWall(viewer, {
        positions: DEMO_POLYGON,
        color,
        height: heightKm * 1_000,
        baseHeight: baseHeightKm * 1_000,
        closed,
        clampToGround,
        speed,
        opacity,
        repeat,
        paused,
        show: visible,
      });
      resetCamera(viewer);

      return () => {
        wallRef.current?.destroy();
        wallRef.current = null;
        viewerRef.current = null;
      };
    },
    // Mount once per stage lifecycle; parameter updates use handle.update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    wallRef.current?.destroy();
    wallRef.current = createEnergyWall(viewer, {
      positions: DEMO_POLYGON,
      color,
      height: heightKm * 1_000,
      baseHeight: baseHeightKm * 1_000,
      closed,
      clampToGround,
      speed,
      opacity,
      repeat,
      paused,
      show: visible,
    });
    // Rebuild only when construction-only geometry options change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseHeightKm, closed]);

  useEffect(() => {
    wallRef.current?.update({
      color,
      height: heightKm * 1_000,
      clampToGround,
      speed,
      opacity,
      repeat,
    });
  }, [color, heightKm, clampToGround, speed, opacity, repeat]);

  const hasModifiedParams =
    color !== DEFAULTS.color ||
    heightKm !== DEFAULTS.heightKm ||
    baseHeightKm !== DEFAULTS.baseHeightKm ||
    closed !== DEFAULTS.closed ||
    clampToGround !== DEFAULTS.clampToGround ||
    speed !== DEFAULTS.speed ||
    opacity !== DEFAULTS.opacity ||
    repeat !== DEFAULTS.repeat;

  const handleResetParams = useCallback(() => {
    setColor(DEFAULTS.color);
    setHeightKm(DEFAULTS.heightKm);
    setBaseHeightKm(DEFAULTS.baseHeightKm);
    setClosed(DEFAULTS.closed);
    setClampToGround(DEFAULTS.clampToGround);
    setSpeed(DEFAULTS.speed);
    setOpacity(DEFAULTS.opacity);
    setRepeat(DEFAULTS.repeat);
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
            label: isZh ? '围栏颜色' : 'Color',
            value: color,
            onChange: setColor,
          },
          {
            type: 'slider',
            id: 'opacity',
            label: isZh
              ? `不透明度 · ${Math.round(opacity * 100)}%`
              : `Opacity · ${Math.round(opacity * 100)}%`,
            value: opacity,
            min: 0.15,
            max: 1.4,
            step: 0.05,
            onChange: setOpacity,
          },
          {
            type: 'slider',
            id: 'repeat',
            label: isZh ? `波带数 · ${repeat}` : `Bands · ${repeat}`,
            value: repeat,
            min: 1,
            max: 6,
            step: 1,
            onChange: setRepeat,
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
            label: isZh ? `墙高 · ${heightKm}km` : `Height · ${heightKm}km`,
            value: heightKm,
            min: 10,
            max: 80,
            step: 2,
            onChange: setHeightKm,
          },
          {
            type: 'slider',
            id: 'baseHeight',
            label: isZh ? `底部高度 · ${baseHeightKm}km` : `Base height · ${baseHeightKm}km`,
            value: baseHeightKm,
            min: 0,
            max: 30,
            step: 1,
            onChange: setBaseHeightKm,
          },
          {
            type: 'switch',
            id: 'clampToGround',
            label: isZh ? '深度交界贴地' : 'Clamp to ground',
            value: clampToGround,
            onChange: setClampToGround,
          },
          {
            type: 'switch',
            id: 'closed',
            label: isZh ? '闭合围栏' : 'Closed loop',
            value: closed,
            onChange: setClosed,
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
        ],
      },
    ],
    [isZh, color, opacity, repeat, heightKm, baseHeightKm, clampToGround, closed, speed],
  );

  useEffect(() => {
    wallRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    wallRef.current?.setVisible(visible);
  }, [visible]);

  const handleResetCamera = () => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      resetCamera(viewer);
    }
  };

  const pageTitle = isZh ? '流光电子围栏 (Energy Wall)' : meta.title;
  const pageDescription = isZh
    ? '沿任意经纬度多边形或折线构建的单 Primitive 发光电子围栏，底部轮廓锐利高亮、顶部平滑渐隐，表面附带向上流动的能量扫描波纹。'
    : meta.description;

  const apiProperties = isZh
    ? [
        {
          property: 'positions',
          type: 'LngLat[]',
          defaultValue: 'required',
          description: '围栏路径顶点数组 [lng, lat]（至少 2 个点）。',
        },
        {
          property: 'color',
          type: 'Color | string',
          defaultValue: "'#00d4ff'",
          description: '光墙色调，支持 Cesium Color 或 CSS 色值。',
        },
        {
          property: 'height / baseHeight',
          type: 'number',
          defaultValue: '30000 / 0',
          description: '光墙垂直高度与底部基准高程（单位：米）。',
        },
        {
          property: 'closed',
          type: 'boolean',
          defaultValue: 'auto',
          description: '顶点数 ≥ 3 时默认自动首尾闭合，设为 false 可绘制开放光墙。',
        },
        {
          property: 'speed / repeat / opacity',
          type: 'number',
          defaultValue: '1 / 3 / 0.85',
          description: '扫描波纹上升速度、纵向波带数量与整体透明度系数。',
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
          description: '统一特效句柄方法：显隐切换、实时更新参数、暂停/重置与幂等销毁。',
        },
      ]
    : [
        {
          property: 'positions',
          type: 'LngLat[]',
          defaultValue: 'required',
          description: 'Ordered [longitude, latitude] vertices (minimum 2 points).',
        },
        {
          property: 'color',
          type: 'Color | string',
          defaultValue: "'#00d4ff'",
          description: 'Wall glow color (Cesium Color or CSS string).',
        },
        {
          property: 'height / baseHeight',
          type: 'number',
          defaultValue: '30000 / 0',
          description: 'Vertical wall height and base elevation in metres.',
        },
        {
          property: 'closed',
          type: 'boolean',
          defaultValue: 'auto',
          description: 'Closes the polygon automatically when >= 3 points are provided.',
        },
        {
          property: 'speed / repeat / opacity',
          type: 'number',
          defaultValue: '1 / 3 / 0.85',
          description: 'Upward wave speed, vertical band count, and opacity multiplier.',
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
            'Unified handle methods for visibility, live updates, pause/restart, and cleanup.',
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
        label={isZh ? 'Energy Wall 流光电子围栏演示场景' : 'Energy Wall 3D CesiumJS demo scene'}
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
