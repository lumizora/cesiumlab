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
import { Eye, EyeOff, Pause, Play, RotateCcw, TrendingUp } from 'lucide-react';
import { CesiumStage } from '@docs/components/CesiumStage';
import type { ParamGroup } from '@docs/components/EffectParamPanel';
import { useDocsPageMarkdown } from '@docs/lib/docsPage';
import type { EffectDemoMeta } from '@docs/lib/effectDemos';
import { useI18n } from '@docs/lib/i18n';
import { formatEffectDocMarkdown } from '@docs/lib/markdown';
import {
  createHexPrism,
  type HexPrismHandle,
  type HexPrismPalette,
  type HexPrismPoint,
  type HexPrismShape,
} from '../index.ts';

export const meta: EffectDemoMeta = {
  id: 'hex-prism',
  title: '3D Hex Prism',
  section: 'Visual Effects',
  description:
    'Single-Draw-Call 3D hexagonal honeycomb & square column matrix with automatic spatial binning, 5-stop GPU color ramps, and smooth rising growth animation.',
  isNew: true,
  order: 16,
};

const INSTALL_CMD = 'pnpm add @cesiumlab/effects @cesiumlab/cesium';

const USAGE_CODE = `import { createHexPrism } from '@cesiumlab/effects';

// Pass raw spatial points — automatically aggregated into a 3D honeycomb prism grid (1 Draw Call)
const prisms = createHexPrism(viewer, {
  points: [
    { position: [121.499, 31.239], value: 86 },
    { position: [121.495, 31.236], value: 64 },
    { position: [121.473, 31.230], value: 92 },
  ],
  shape: 'hex',        // 'hex' | 'square'
  cellRadius: 280,
  coverage: 0.86,
  maxHeight: 2_600,
  palette: 'cyber',    // 'cyber' | 'thermal' | 'viridis' | 'ocean'
  growDuration: 1.2,
});

// O(1) real-time height scale & palette swap (zero geometry rebuild)
prisms.update({ elevationScale: 1.5, palette: 'thermal' });
prisms.restart();      // Replay smooth rising growth animation
prisms.destroy();`;

// Shanghai metropolitan core (Lujiazui / Bund / People's Square / Jing'an / Xujiahui / Century Park)
const CENTER_COORD: readonly [number, number] = [121.492, 31.233];

function createSeededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

function generateUrbanDensityPoints(): HexPrismPoint[] {
  const rand = createSeededRandom(20261126);
  const hubs: ReadonlyArray<{
    lng: number;
    lat: number;
    spread: number;
    count: number;
    weight: number;
  }> = [
    { lng: 121.501, lat: 31.239, spread: 0.022, count: 1_250, weight: 1.45 }, // Lujiazui CBD
    { lng: 121.474, lat: 31.232, spread: 0.026, count: 1_050, weight: 1.2 }, // People's Square / Bund
    { lng: 121.448, lat: 31.224, spread: 0.02, count: 760, weight: 1.05 }, // Jing'an
    { lng: 121.438, lat: 31.195, spread: 0.024, count: 700, weight: 0.95 }, // Xujiahui
    { lng: 121.552, lat: 31.216, spread: 0.028, count: 640, weight: 0.85 }, // Century Park / Zhangjiang
    { lng: 121.505, lat: 31.268, spread: 0.024, count: 520, weight: 0.75 }, // North Bund / Wujiaochang
  ];

  const points: HexPrismPoint[] = [];
  for (const hub of hubs) {
    for (let i = 0; i < hub.count; i++) {
      // Box-Muller Gaussian cluster
      const u1 = Math.max(1e-6, rand());
      const u2 = rand();
      const r = Math.sqrt(-2 * Math.log(u1)) * hub.spread;
      const theta = 2 * Math.PI * u2;
      const lng = hub.lng + Math.cos(theta) * r * 1.15;
      const lat = hub.lat + Math.sin(theta) * r * 0.95;
      const falloff = Math.exp(-(r * r) / (2 * hub.spread * hub.spread));
      points.push({
        position: [lng, lat],
        value: hub.weight * (0.4 + 0.6 * falloff) * (0.7 + 0.6 * rand()),
      });
    }
  }
  return points;
}

const URBAN_POINTS = generateUrbanDensityPoints();

function resetCamera(viewer: Viewer) {
  viewer.camera.lookAt(
    Cartesian3.fromDegrees(CENTER_COORD[0], CENTER_COORD[1], 300),
    new HeadingPitchRange(CesiumMath.toRadians(22), CesiumMath.toRadians(-34), 19_500),
  );
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
}

const DEFAULTS = {
  shape: 'hex' as HexPrismShape,
  palette: 'cyber' as HexPrismPalette,
  cellRadius: 280,
  coverage: 0.86,
  elevationScale: 1,
  pulseSpeed: 1,
  opacity: 0.92,
} as const;

export default function HexPrismDemoPage() {
  const { isZh } = useI18n();
  const viewerRef = useRef<Viewer | null>(null);
  const prismRef = useRef<HexPrismHandle | null>(null);

  const [shape, setShape] = useState<HexPrismShape>(DEFAULTS.shape);
  const [palette, setPalette] = useState<HexPrismPalette>(DEFAULTS.palette);
  const [cellRadius, setCellRadius] = useState<number>(DEFAULTS.cellRadius);
  const [coverage, setCoverage] = useState<number>(DEFAULTS.coverage);
  const [elevationScale, setElevationScale] = useState<number>(DEFAULTS.elevationScale);
  const [pulseSpeed, setPulseSpeed] = useState<number>(DEFAULTS.pulseSpeed);
  const [opacity, setOpacity] = useState<number>(DEFAULTS.opacity);
  const [paused, setPaused] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [visible, setVisible] = useState(true);

  const handleMount = useCallback(
    (viewer: Viewer) => {
      viewerRef.current = viewer;
      const handle = createHexPrism(viewer, {
        points: URBAN_POINTS,
        shape,
        palette,
        cellRadius,
        coverage,
        baseHeight: 15,
        minHeight: 80,
        maxHeight: 2_800,
        elevationScale,
        growDuration: 1.2,
        pulseSpeed,
        opacity,
        show: visible,
        paused,
      });
      prismRef.current = handle;
      resetCamera(viewer);
      return () => {
        handle.destroy();
        prismRef.current = null;
        viewerRef.current = null;
      };
    },
    // Mount once; live updates flow through handle.update() below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    prismRef.current?.update({
      shape,
      palette,
      cellRadius,
      coverage,
      elevationScale,
      pulseSpeed,
      opacity,
    });
  }, [shape, palette, cellRadius, coverage, elevationScale, pulseSpeed, opacity]);

  useEffect(() => {
    prismRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    prismRef.current?.setVisible(visible);
  }, [visible]);

  const handleResetParams = useCallback(() => {
    setShape(DEFAULTS.shape);
    setPalette(DEFAULTS.palette);
    setCellRadius(DEFAULTS.cellRadius);
    setCoverage(DEFAULTS.coverage);
    setElevationScale(DEFAULTS.elevationScale);
    setPulseSpeed(DEFAULTS.pulseSpeed);
    setOpacity(DEFAULTS.opacity);
  }, []);

  const hasModifiedParams =
    shape !== DEFAULTS.shape ||
    palette !== DEFAULTS.palette ||
    cellRadius !== DEFAULTS.cellRadius ||
    coverage !== DEFAULTS.coverage ||
    elevationScale !== DEFAULTS.elevationScale ||
    pulseSpeed !== DEFAULTS.pulseSpeed ||
    opacity !== DEFAULTS.opacity;

  const paramGroups = useMemo<ParamGroup[]>(
    () => [
      {
        id: 'appearance',
        label: isZh ? '形态与色带' : 'Shape & Palette',
        controls: [
          {
            type: 'segment',
            id: 'shape',
            label: isZh ? '柱体截面' : 'Column shape',
            value: shape,
            options: [
              { value: 'hex', label: isZh ? '六棱柱蜂窝' : 'Hexagon' },
              { value: 'square', label: isZh ? '方柱矩阵' : 'Square' },
            ],
            onChange: (val) => {
              if (val === 'hex' || val === 'square') setShape(val);
            },
          },
          {
            type: 'segment',
            id: 'palette',
            label: isZh ? '色带映射' : 'Color ramp',
            value: palette,
            options: [
              { value: 'cyber', label: isZh ? '赛博青' : 'Cyber' },
              { value: 'thermal', label: isZh ? '热力橙' : 'Thermal' },
              { value: 'viridis', label: 'Viridis' },
              { value: 'ocean', label: isZh ? '深海蓝' : 'Ocean' },
            ],
            onChange: (val) => {
              if (val === 'cyber' || val === 'thermal' || val === 'viridis' || val === 'ocean') {
                setPalette(val);
              }
            },
          },
          {
            type: 'slider',
            id: 'opacity',
            label: isZh
              ? `不透明度 · ${Math.round(opacity * 100)}%`
              : `Opacity · ${Math.round(opacity * 100)}%`,
            value: opacity,
            min: 0.25,
            max: 1,
            step: 0.05,
            onChange: setOpacity,
          },
        ],
      },
      {
        id: 'geometry',
        label: isZh ? '网格与高度' : 'Grid & Elevation',
        controls: [
          {
            type: 'slider',
            id: 'elevationScale',
            label: isZh
              ? `高度倍率 · ${elevationScale.toFixed(1)}x`
              : `Elevation scale · ${elevationScale.toFixed(1)}x`,
            value: elevationScale,
            min: 0.2,
            max: 3,
            step: 0.1,
            onChange: setElevationScale,
          },
          {
            type: 'slider',
            id: 'cellRadius',
            label: isZh ? `单元半径 · ${cellRadius}m` : `Cell radius · ${cellRadius}m`,
            value: cellRadius,
            min: 160,
            max: 700,
            step: 20,
            onChange: setCellRadius,
          },
          {
            type: 'slider',
            id: 'coverage',
            label: isZh
              ? `填充占比 · ${Math.round(coverage * 100)}%`
              : `Coverage · ${Math.round(coverage * 100)}%`,
            value: coverage,
            min: 0.45,
            max: 0.98,
            step: 0.02,
            onChange: setCoverage,
          },
        ],
      },
      {
        id: 'motion',
        label: isZh ? '动态光效' : 'Motion',
        controls: [
          {
            type: 'slider',
            id: 'pulseSpeed',
            label: isZh
              ? `上升扫描速度 · ${pulseSpeed.toFixed(1)}x`
              : `Energy pulse · ${pulseSpeed.toFixed(1)}x`,
            value: pulseSpeed,
            min: 0,
            max: 3,
            step: 0.1,
            onChange: setPulseSpeed,
          },
        ],
      },
    ],
    [isZh, shape, palette, opacity, elevationScale, cellRadius, coverage, pulseSpeed],
  );

  const handleResetCamera = () => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      resetCamera(viewer);
    }
  };

  const pageTitle = isZh ? '3D 蜂窝柱阵 (Hex Prism)' : meta.title;
  const pageDescription = isZh
    ? '单 Draw Call 合批渲染的三维蜂窝六棱柱与方柱统计矩阵：内置 4,900+ 原始点自动空间蜂窝聚合、5 段 GPU 色带映射、O(1) 实时高度拉伸、平滑生长入场动画及立体分面光照。'
    : meta.description;

  const apiProperties = isZh
    ? [
        {
          property: 'points',
          type: 'HexPrismPoint[]',
          defaultValue: 'required',
          description:
            '输入点集（{ position, value?, color? }），默认自动空间聚合为蜂窝/方柱网格。',
        },
        {
          property: 'shape',
          type: "'hex' | 'square'",
          defaultValue: "'hex'",
          description: '柱体截面形态：六棱柱蜂窝或方柱矩阵。',
        },
        {
          property: 'aggregate',
          type: 'boolean',
          defaultValue: 'true',
          description:
            '是否按 cellRadius 自动空间分箱聚合；设为 false 时按点直出柱体并支持单柱自定义颜色。',
        },
        {
          property: 'cellRadius / coverage',
          type: 'number',
          defaultValue: '350 / 0.86',
          description: '网格单元半径（米）与填充占比（0.3–1.0，控制柱体间隙）。',
        },
        {
          property: 'baseHeight / minHeight / maxHeight',
          type: 'number',
          defaultValue: '0 / 80 / 2400',
          description: '底面基准高程及归一化数据值对应的最小/最大柱高（米）。',
        },
        {
          property: 'elevationScale',
          type: 'number',
          defaultValue: '1',
          description: '实时高度倍率（O(1) 矩阵缩放，零几何重建）。',
        },
        {
          property: 'palette',
          type: "'cyber' | 'thermal' | 'viridis' | 'ocean'",
          defaultValue: "'cyber'",
          description: '内置 5 段 GPU 色带映射（O(1) 实时切换）。',
        },
        {
          property: 'growDuration / pulseSpeed / opacity',
          type: 'number',
          defaultValue: '1.2 / 1 / 0.92',
          description: '平滑生长入场时长（秒）、侧壁能量波速与整体不透明度。',
        },
        {
          property: 'restart / update / show / hide / destroy',
          type: 'HexPrismHandle',
          defaultValue: '—',
          description: '重播生长动画与统一句柄生命周期方法。',
        },
      ]
    : [
        {
          property: 'points',
          type: 'HexPrismPoint[]',
          defaultValue: 'required',
          description:
            'Input data points ({ position, value?, color? }), auto-aggregated into a 3D grid by default.',
        },
        {
          property: 'shape',
          type: "'hex' | 'square'",
          defaultValue: "'hex'",
          description: 'Column cross-section: hexagonal honeycomb or square grid.',
        },
        {
          property: 'aggregate',
          type: 'boolean',
          defaultValue: 'true',
          description:
            'Bin nearby points into cells (`true`) or render one prism per point (`false`).',
        },
        {
          property: 'cellRadius / coverage',
          type: 'number',
          defaultValue: '350 / 0.86',
          description:
            'Grid cell radius in metres and fill ratio (0.3–1.0) controlling inter-column gaps.',
        },
        {
          property: 'baseHeight / minHeight / maxHeight',
          type: 'number',
          defaultValue: '0 / 80 / 2400',
          description: 'Base altitude and min/max prism heights in metres.',
        },
        {
          property: 'elevationScale',
          type: 'number',
          defaultValue: '1',
          description: 'Real-time O(1) vertical height scale multiplier (zero geometry rebuild).',
        },
        {
          property: 'palette',
          type: "'cyber' | 'thermal' | 'viridis' | 'ocean'",
          defaultValue: "'cyber'",
          description: 'Built-in 5-stop GPU color ramp (O(1) live uniform switch).',
        },
        {
          property: 'growDuration / pulseSpeed / opacity',
          type: 'number',
          defaultValue: '1.2 / 1 / 0.92',
          description:
            'Rising growth animation duration (seconds), upward energy scan speed, and opacity.',
        },
        {
          property: 'restart / update / show / hide / destroy',
          type: 'HexPrismHandle',
          defaultValue: '—',
          description: 'Replay growth animation plus unified handle lifecycle methods.',
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
        label={isZh ? 'Hex Prism 3D 蜂窝柱阵演示场景' : 'Hex Prism 3D CesiumJS demo scene'}
        shouldAnimate={false}
        onMount={handleMount}
        paramGroups={paramGroups}
        onResetParams={handleResetParams}
        hasModifiedParams={hasModifiedParams}
        actions={
          <>
            <Button
              label={isZh ? '重新生长' : 'Replay growth'}
              variant="primary"
              size="sm"
              icon={<Icon icon={TrendingUp} />}
              onClick={() => prismRef.current?.restart()}
            />
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
