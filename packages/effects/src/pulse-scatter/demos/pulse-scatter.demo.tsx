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
import {
  createPulseScatter,
  type PulseScatterHandle,
  type PulseScatterPoint,
  type PulseScatterStyle,
} from '../index.ts';

export const meta: EffectDemoMeta = {
  id: 'pulse-scatter',
  title: 'Pulse Scatter',
  section: 'Visual Effects',
  description:
    'Single-Draw-Call batched GPU pulsing, breathing, and multi-ripple scatter layer supporting 10,000–30,000+ points with per-point color, radius, and staggered phase at 60fps.',
  isNew: true,
  order: 13,
};

const INSTALL_CMD = 'pnpm add @cesiumlab/effects cesium';

const USAGE_CODE = `import { createPulseScatter } from '@cesiumlab/effects';

const scatter = createPulseScatter(viewer, {
  points: [
    { position: [116.46, 39.91], radius: 420, color: '#00e5ff' },
    { position: [116.32, 39.98], radius: 360, color: '#a855f7' },
    { position: [116.36, 39.91], radius: 380, color: '#f59e0b' },
  ],
  style: 'pulse', // 'pulse' | 'breath' | 'ripple'
  speed: 1,
  sizeScale: 1,
  glow: 1.15,
  height: 85,
});

// O(1) GPU uniform updates (no geometry rebuild)
scatter.update({ style: 'ripple', speed: 1.4, glow: 1.5 });
scatter.destroy();`;

interface UrbanHub {
  lng: number;
  lat: number;
  spreadLng: number;
  spreadLat: number;
  color: string;
  weight: number;
}

// Beijing urban tech & commercial clusters on flat North China Plain
const URBAN_HUBS: readonly UrbanHub[] = [
  { lng: 116.462, lat: 39.912, spreadLng: 0.048, spreadLat: 0.036, color: '#00e5ff', weight: 0.24 }, // CBD
  { lng: 116.316, lat: 39.982, spreadLng: 0.052, spreadLat: 0.038, color: '#a855f7', weight: 0.2 }, // Zhongguancun
  { lng: 116.362, lat: 39.914, spreadLng: 0.042, spreadLat: 0.032, color: '#f59e0b', weight: 0.16 }, // Financial St
  { lng: 116.482, lat: 39.995, spreadLng: 0.046, spreadLat: 0.034, color: '#38bdf8', weight: 0.15 }, // Wangjing
  { lng: 116.454, lat: 39.936, spreadLng: 0.034, spreadLat: 0.028, color: '#fb7185', weight: 0.13 }, // Sanlitun
  { lng: 116.512, lat: 39.798, spreadLng: 0.055, spreadLat: 0.04, color: '#34d399', weight: 0.12 }, // Yizhuang
];

function generateUrbanScatter(count: number): PulseScatterPoint[] {
  // Deterministic PRNG for reproducible clustering
  let s = 20261125;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const randNormal = () => {
    const u1 = Math.max(1e-6, rand());
    const u2 = rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  const points: PulseScatterPoint[] = [];

  // Cumulative hub weights
  const cdf: number[] = [];
  let acc = 0;
  for (const hub of URBAN_HUBS) {
    acc += hub.weight;
    cdf.push(acc);
  }

  for (let i = 0; i < count; i += 1) {
    if (i < URBAN_HUBS.length) {
      const hub = URBAN_HUBS[i]!;
      points.push({
        position: [hub.lng, hub.lat],
        radius: 680,
        color: hub.color,
        phase: i / URBAN_HUBS.length,
      });
      continue;
    }

    const rPick = rand();
    let hubIdx = URBAN_HUBS.length - 1;
    for (let j = 0; j < cdf.length; j += 1) {
      if (rPick <= cdf[j]!) {
        hubIdx = j;
        break;
      }
    }
    const hub = URBAN_HUBS[hubIdx]!;

    // 80% Gaussian urban cluster points + 20% broader metropolitan ring scatter
    let lng: number;
    let lat: number;
    let radius: number;
    if (rand() < 0.8) {
      const gx = randNormal();
      const gy = randNormal();
      lng = hub.lng + gx * hub.spreadLng;
      lat = hub.lat + gy * hub.spreadLat;
      const distNorm = Math.min(1, Math.hypot(gx, gy) / 3);
      radius = 120 + (1 - distNorm) * 260 + rand() * 80;
    } else {
      const angle = rand() * Math.PI * 2;
      const ringR = 0.05 + Math.sqrt(rand()) * 0.22;
      lng = 116.397 + Math.cos(angle) * ringR * 1.25;
      lat = 39.908 + Math.sin(angle) * ringR;
      radius = 110 + rand() * 170;
    }

    points.push({
      position: [lng, lat],
      radius,
      color: hub.color,
      phase: rand(),
    });
  }

  return points;
}

function resetCamera(viewer: Viewer) {
  viewer.camera.lookAt(
    Cartesian3.fromDegrees(116.415, 39.92, 85),
    new HeadingPitchRange(CesiumMath.toRadians(12), CesiumMath.toRadians(-46), 34_000),
  );
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
}

const DEFAULTS = {
  style: 'pulse' as PulseScatterStyle,
  pointCount: 8_000,
  sizeScale: 1,
  speed: 1,
  glow: 1.15,
  opacity: 0.92,
  height: 85,
} as const;

export default function PulseScatterDemoPage() {
  const { isZh } = useI18n();
  const viewerRef = useRef<Viewer | null>(null);
  const scatterRef = useRef<PulseScatterHandle | null>(null);

  const [paused, setPaused] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [visible, setVisible] = useState(true);
  const [style, setStyle] = useState<PulseScatterStyle>(DEFAULTS.style);
  const [pointCount, setPointCount] = useState<number>(DEFAULTS.pointCount);
  const [sizeScale, setSizeScale] = useState<number>(DEFAULTS.sizeScale);
  const [speed, setSpeed] = useState<number>(DEFAULTS.speed);
  const [glow, setGlow] = useState<number>(DEFAULTS.glow);
  const [opacity, setOpacity] = useState<number>(DEFAULTS.opacity);
  const [height, setHeight] = useState<number>(DEFAULTS.height);

  const points = useMemo(() => generateUrbanScatter(pointCount), [pointCount]);

  const handleMount = useCallback(
    (viewer: Viewer) => {
      viewerRef.current = viewer;
      scatterRef.current = createPulseScatter(viewer, {
        points,
        style,
        sizeScale,
        speed,
        glow,
        opacity,
        height,
        paused,
        show: visible,
      });
      resetCamera(viewer);

      return () => {
        scatterRef.current?.destroy();
        scatterRef.current = null;
        viewerRef.current = null;
      };
    },
    // Mount once per stage lifecycle; updates are synced by effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Geometry-affecting updates (points, sizeScale, height)
  useEffect(() => {
    scatterRef.current?.update({ points, sizeScale, height });
  }, [points, sizeScale, height]);

  // O(1) GPU uniform updates
  useEffect(() => {
    scatterRef.current?.update({ style, speed, glow, opacity });
  }, [style, speed, glow, opacity]);

  useEffect(() => {
    scatterRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    scatterRef.current?.setVisible(visible);
  }, [visible]);

  const handleResetCamera = () => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      resetCamera(viewer);
    }
  };

  const hasModifiedParams =
    style !== DEFAULTS.style ||
    pointCount !== DEFAULTS.pointCount ||
    sizeScale !== DEFAULTS.sizeScale ||
    speed !== DEFAULTS.speed ||
    glow !== DEFAULTS.glow ||
    opacity !== DEFAULTS.opacity ||
    height !== DEFAULTS.height;

  const handleResetParams = useCallback(() => {
    setStyle(DEFAULTS.style);
    setPointCount(DEFAULTS.pointCount);
    setSizeScale(DEFAULTS.sizeScale);
    setSpeed(DEFAULTS.speed);
    setGlow(DEFAULTS.glow);
    setOpacity(DEFAULTS.opacity);
    setHeight(DEFAULTS.height);
  }, []);

  const paramGroups = useMemo<ParamGroup[]>(
    () => [
      {
        id: 'style',
        label: isZh ? '样式与规模' : 'Style & Scale',
        controls: [
          {
            type: 'segment',
            id: 'style',
            label: isZh ? '点阵模式' : 'Animation style',
            value: style,
            options: [
              { value: 'pulse', label: isZh ? '脉冲' : 'Pulse' },
              { value: 'breath', label: isZh ? '呼吸' : 'Breath' },
              { value: 'ripple', label: isZh ? '双波纹' : 'Ripple' },
            ],
            onChange: (val) => {
              if (val === 'pulse' || val === 'breath' || val === 'ripple') setStyle(val);
            },
          },
          {
            type: 'slider',
            id: 'pointCount',
            label: isZh
              ? `散点数量 · ${pointCount.toLocaleString()}`
              : `Points · ${pointCount.toLocaleString()}`,
            value: pointCount,
            min: 1_000,
            max: 30_000,
            step: 1_000,
            onChange: setPointCount,
          },
          {
            type: 'slider',
            id: 'sizeScale',
            label: isZh
              ? `半径倍率 · ${sizeScale.toFixed(1)}x`
              : `Size scale · ${sizeScale.toFixed(1)}x`,
            value: sizeScale,
            min: 0.4,
            max: 2.6,
            step: 0.1,
            onChange: setSizeScale,
          },
        ],
      },
      {
        id: 'appearance',
        label: isZh ? '动态与光效' : 'Motion & Glow',
        controls: [
          {
            type: 'slider',
            id: 'speed',
            label: isZh ? `节奏速率 · ${speed.toFixed(1)}x` : `Speed · ${speed.toFixed(1)}x`,
            value: speed,
            min: 0.2,
            max: 3,
            step: 0.1,
            onChange: setSpeed,
          },
          {
            type: 'slider',
            id: 'glow',
            label: isZh ? `辉光强度 · ${glow.toFixed(2)}` : `Glow · ${glow.toFixed(2)}`,
            value: glow,
            min: 0.4,
            max: 2.2,
            step: 0.05,
            onChange: setGlow,
          },
          {
            type: 'slider',
            id: 'opacity',
            label: isZh
              ? `不透明度 · ${Math.round(opacity * 100)}%`
              : `Opacity · ${Math.round(opacity * 100)}%`,
            value: opacity,
            min: 0.2,
            max: 1,
            step: 0.04,
            onChange: setOpacity,
          },
          {
            type: 'slider',
            id: 'height',
            label: isZh ? `海拔高度 · ${height}m` : `Altitude · ${height}m`,
            value: height,
            min: 0,
            max: 500,
            step: 5,
            onChange: setHeight,
          },
        ],
      },
    ],
    [isZh, style, pointCount, sizeScale, speed, glow, opacity, height],
  );

  const pageTitle = isZh ? '海量脉冲散点 / 呼吸点阵 (Pulse Scatter)' : meta.title;
  const pageDescription = isZh
    ? '单 Draw Call 合批 GPU 散点图层：将数万个地理散点的颜色、半径与交错动画相位直接编码进顶点属性，通过自定义 GLSL 着色器以 60fps 渲染脉冲扩散、星海呼吸与双波纹涟漪点阵。'
    : meta.description;

  const apiProperties = isZh
    ? [
        {
          property: 'points',
          type: 'PulseScatterPoint[]',
          defaultValue: 'required',
          description:
            '散点数组，每项包含 `position: [lng, lat]` 及可选 `radius`、`color`、`phase`、`height`。',
        },
        {
          property: 'style',
          type: "'pulse' | 'breath' | 'ripple'",
          defaultValue: "'pulse'",
          description: 'GPU 着色器动画模式：脉冲扩散、呼吸点阵或双波纹涟漪（O(1) 实时切换）。',
        },
        {
          property: 'radius',
          type: 'number',
          defaultValue: '400',
          description: '未指定单点 `radius` 时的默认圆盘半径（米）。',
        },
        {
          property: 'sizeScale',
          type: 'number',
          defaultValue: '1',
          description: '全局散点半径缩放倍率。',
        },
        {
          property: 'color',
          type: 'ColorInput',
          defaultValue: "'#00e5ff'",
          description: '未指定单点 `color` 时的默认发光色。',
        },
        {
          property: 'speed',
          type: 'number',
          defaultValue: '1',
          description: '脉冲/呼吸动画速率倍率（O(1) 实时更新）。',
        },
        {
          property: 'glow',
          type: 'number',
          defaultValue: '1.15',
          description: '核心高光与外围辉光亮度倍率（0.2–2.5）。',
        },
        {
          property: 'opacity',
          type: 'number',
          defaultValue: '0.92',
          description: '整体不透明度（0–1）。',
        },
        {
          property: 'height',
          type: 'number',
          defaultValue: '20',
          description: '未指定单点 `height` 时的默认椭球海拔高度（米）。',
        },
      ]
    : [
        {
          property: 'points',
          type: 'PulseScatterPoint[]',
          defaultValue: 'required',
          description:
            'Array of scatter points with `position: [lng, lat]` and optional `radius`, `color`, `phase`, `height`.',
        },
        {
          property: 'style',
          type: "'pulse' | 'breath' | 'ripple'",
          defaultValue: "'pulse'",
          description: 'GPU shader animation mode switched in O(1) without geometry rebuild.',
        },
        {
          property: 'radius',
          type: 'number',
          defaultValue: '400',
          description: 'Default disc radius in metres when a point omits `radius`.',
        },
        {
          property: 'sizeScale',
          type: 'number',
          defaultValue: '1',
          description: 'Global multiplier applied to all point radii.',
        },
        {
          property: 'color',
          type: 'ColorInput',
          defaultValue: "'#00e5ff'",
          description: 'Default color when a point omits `color`.',
        },
        {
          property: 'speed',
          type: 'number',
          defaultValue: '1',
          description: 'Animation speed multiplier (O(1) uniform update).',
        },
        {
          property: 'glow',
          type: 'number',
          defaultValue: '1.15',
          description: 'Core and halo luminance multiplier (0.2–2.5).',
        },
        {
          property: 'opacity',
          type: 'number',
          defaultValue: '0.92',
          description: 'Overall opacity multiplier (0–1).',
        },
        {
          property: 'height',
          type: 'number',
          defaultValue: '20',
          description: 'Default ellipsoid altitude in metres when a point omits `height`.',
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
        label={isZh ? 'Pulse Scatter 海量脉冲散点演示场景' : 'Pulse Scatter 3D CesiumJS demo scene'}
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
