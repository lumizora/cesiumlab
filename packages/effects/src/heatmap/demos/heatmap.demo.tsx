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
import { Eye, EyeOff, RotateCcw } from 'lucide-react';
import { CesiumStage } from '@docs/components/CesiumStage';
import type { ParamGroup } from '@docs/components/EffectParamPanel';
import { useDocsPageMarkdown } from '@docs/lib/docsPage';
import type { EffectDemoMeta } from '@docs/lib/effectDemos';
import { useI18n } from '@docs/lib/i18n';
import { formatEffectDocMarkdown } from '@docs/lib/markdown';
import {
  createHeatmap,
  type HeatmapBounds,
  type HeatmapHandle,
  type HeatmapPalette,
  type HeatmapPoint,
} from '../index.ts';

export const meta: EffectDemoMeta = {
  id: 'heatmap',
  title: 'Heatmap',
  section: 'Visual Effects',
  description:
    'GPU-shaded Gaussian kernel-density heatmap with O(1) live palette, intensity, and isoline contour updates, seamlessly switchable between terrain-clamped GroundPrimitive and floating Primitive.',
  isNew: true,
  order: 11,
};

const INSTALL_CMD = 'pnpm add @cesiumlab/effects cesium';

const USAGE_CODE = `import { createHeatmap } from '@cesiumlab/effects';

const heatmap = createHeatmap(viewer, {
  points: [
    { position: [104.06, 30.67], weight: 1.0 },
    { position: [103.85, 30.78], weight: 0.8 },
    { position: [103.65, 30.92], weight: 0.9 },
  ],
  palette: 'thermal', // 'thermal' | 'inferno' | 'viridis' | 'ocean'
  radius: 0.065,
  intensity: 1.15,
  contours: false,
  clampToGround: true,
});

// O(1) GPU uniform updates (no re-rasterization for palette/intensity/contours)
heatmap.update({ palette: 'inferno', contours: true, intensity: 1.4 });
heatmap.destroy();`;

// Chengdu basin + Longmenshan mountain foothills (flat urban core + steep western ridges)
const DEMO_BOUNDS: HeatmapBounds = [103.42, 30.42, 104.34, 31.08];

const HOTSPOT_CLUSTERS: ReadonlyArray<{
  lng: number;
  lat: number;
  spreadLng: number;
  spreadLat: number;
  weight: number;
}> = [
  { lng: 104.06, lat: 30.67, spreadLng: 0.085, spreadLat: 0.065, weight: 1.0 },
  { lng: 103.88, lat: 30.76, spreadLng: 0.07, spreadLat: 0.055, weight: 0.78 },
  { lng: 103.66, lat: 30.91, spreadLng: 0.065, spreadLat: 0.055, weight: 0.88 },
  { lng: 104.14, lat: 30.56, spreadLng: 0.06, spreadLat: 0.05, weight: 0.72 },
  { lng: 103.72, lat: 30.64, spreadLng: 0.075, spreadLat: 0.06, weight: 0.65 },
  { lng: 103.98, lat: 30.89, spreadLng: 0.055, spreadLat: 0.045, weight: 0.6 },
];

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function generateDemoPoints(count: number): HeatmapPoint[] {
  const points: HeatmapPoint[] = [];
  for (let i = 0; i < count; i += 1) {
    const cluster = HOTSPOT_CLUSTERS[i % HOTSPOT_CLUSTERS.length]!;
    // Box-Muller approximate Gaussian scatter around each hotspot center
    const u1 = Math.max(1e-5, seededRandom(i * 5 + 1));
    const u2 = seededRandom(i * 5 + 2);
    const mag = Math.sqrt(-2 * Math.log(u1)) * 0.52;
    const theta = u2 * Math.PI * 2;
    const dx = Math.cos(theta) * mag * cluster.spreadLng;
    const dy = Math.sin(theta) * mag * cluster.spreadLat;
    const weight = cluster.weight * (0.45 + seededRandom(i * 5 + 3) * 0.85);
    points.push({
      position: [cluster.lng + dx, cluster.lat + dy],
      weight,
    });
  }
  return points;
}

function resetCamera(viewer: Viewer) {
  viewer.camera.lookAt(
    Cartesian3.fromDegrees(103.88, 30.74, 800),
    new HeadingPitchRange(CesiumMath.toRadians(340), CesiumMath.toRadians(-42), 115_000),
  );
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
}

const DEFAULTS = {
  size: 1_200,
  palette: 'thermal' as HeatmapPalette,
  radius: 0.065,
  intensity: 1.15,
  minThreshold: 0.04,
  opacity: 0.84,
  contours: false,
  clampToGround: true,
  heightM: 1_800,
} as const;

export default function HeatmapDemoPage() {
  const { isZh } = useI18n();
  const viewerRef = useRef<Viewer | null>(null);
  const heatmapRef = useRef<HeatmapHandle | null>(null);

  const [visible, setVisible] = useState(true);
  const [size, setSize] = useState<number>(DEFAULTS.size);
  const [palette, setPalette] = useState<HeatmapPalette>(DEFAULTS.palette);
  const [radius, setRadius] = useState<number>(DEFAULTS.radius);
  const [intensity, setIntensity] = useState<number>(DEFAULTS.intensity);
  const [minThreshold, setMinThreshold] = useState<number>(DEFAULTS.minThreshold);
  const [opacity, setOpacity] = useState<number>(DEFAULTS.opacity);
  const [contours, setContours] = useState<boolean>(DEFAULTS.contours);
  const [clampToGround, setClampToGround] = useState<boolean>(DEFAULTS.clampToGround);
  const [heightM, setHeightM] = useState<number>(DEFAULTS.heightM);

  const demoPoints = useMemo(() => generateDemoPoints(size), [size]);

  const handleMount = useCallback(
    (viewer: Viewer) => {
      viewerRef.current = viewer;
      heatmapRef.current = createHeatmap(viewer, {
        points: demoPoints,
        bounds: DEMO_BOUNDS,
        palette,
        radius,
        intensity,
        minThreshold,
        opacity,
        contours,
        clampToGround,
        height: heightM,
        show: visible,
      });
      resetCamera(viewer);

      return () => {
        heatmapRef.current?.destroy();
        heatmapRef.current = null;
        viewerRef.current = null;
      };
    },
    // Mount once per stage lifecycle; updates are synced by effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    heatmapRef.current?.update({
      points: demoPoints,
      radius,
    });
  }, [demoPoints, radius]);

  useEffect(() => {
    heatmapRef.current?.update({
      palette,
      intensity,
      minThreshold,
      opacity,
      contours,
      clampToGround,
      height: heightM,
    });
  }, [palette, intensity, minThreshold, opacity, contours, clampToGround, heightM]);

  useEffect(() => {
    heatmapRef.current?.setVisible(visible);
  }, [visible]);

  const handleResetCamera = () => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      resetCamera(viewer);
    }
  };

  const hasModifiedParams =
    size !== DEFAULTS.size ||
    palette !== DEFAULTS.palette ||
    radius !== DEFAULTS.radius ||
    intensity !== DEFAULTS.intensity ||
    minThreshold !== DEFAULTS.minThreshold ||
    opacity !== DEFAULTS.opacity ||
    contours !== DEFAULTS.contours ||
    clampToGround !== DEFAULTS.clampToGround ||
    heightM !== DEFAULTS.heightM;

  const handleResetParams = useCallback(() => {
    setSize(DEFAULTS.size);
    setPalette(DEFAULTS.palette);
    setRadius(DEFAULTS.radius);
    setIntensity(DEFAULTS.intensity);
    setMinThreshold(DEFAULTS.minThreshold);
    setOpacity(DEFAULTS.opacity);
    setContours(DEFAULTS.contours);
    setClampToGround(DEFAULTS.clampToGround);
    setHeightM(DEFAULTS.heightM);
  }, []);

  const paramGroups = useMemo<ParamGroup[]>(
    () => [
      {
        id: 'appearance',
        label: isZh ? '色带与外观' : 'Palette & Look',
        controls: [
          {
            type: 'segment',
            id: 'palette',
            label: isZh ? '配色方案' : 'Palette',
            value: palette,
            options: [
              { value: 'thermal', label: isZh ? '经典' : 'Thermal' },
              { value: 'inferno', label: isZh ? '烈焰' : 'Inferno' },
              { value: 'viridis', label: isZh ? '科学' : 'Viridis' },
              { value: 'ocean', label: isZh ? '海洋' : 'Ocean' },
            ],
            onChange: (val) => {
              if (val === 'thermal' || val === 'inferno' || val === 'viridis' || val === 'ocean') {
                setPalette(val);
              }
            },
          },
          {
            type: 'slider',
            id: 'intensity',
            label: isZh
              ? `热度强度 · ${intensity.toFixed(2)}x`
              : `Intensity · ${intensity.toFixed(2)}x`,
            value: intensity,
            min: 0.4,
            max: 2.5,
            step: 0.05,
            onChange: setIntensity,
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
            id: 'minThreshold',
            label: isZh
              ? `低值裁切 · ${Math.round(minThreshold * 100)}%`
              : `Cutoff · ${Math.round(minThreshold * 100)}%`,
            value: minThreshold,
            min: 0,
            max: 0.3,
            step: 0.02,
            onChange: setMinThreshold,
          },
          {
            type: 'switch',
            id: 'contours',
            label: isZh ? '等值线叠加' : 'Isoline contours',
            value: contours,
            onChange: setContours,
          },
        ],
      },
      {
        id: 'kernel',
        label: isZh ? '核密度与地形' : 'Kernel & Terrain',
        controls: [
          {
            type: 'slider',
            id: 'size',
            label: isZh ? `样本点数量 · ${size}` : `Points · ${size}`,
            value: size,
            min: 200,
            max: 4_000,
            step: 200,
            onChange: setSize,
          },
          {
            type: 'slider',
            id: 'radius',
            label: isZh
              ? `核半径 · ${(radius * 100).toFixed(1)}%`
              : `Radius · ${(radius * 100).toFixed(1)}%`,
            value: radius,
            min: 0.02,
            max: 0.16,
            step: 0.005,
            onChange: setRadius,
          },
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
                  max: 6_000,
                  step: 200,
                  onChange: setHeightM,
                },
              ]
            : []),
        ],
      },
    ],
    [
      isZh,
      palette,
      intensity,
      opacity,
      minThreshold,
      contours,
      size,
      radius,
      clampToGround,
      heightM,
    ],
  );

  const pageTitle = isZh ? '热力图 (Heatmap)' : meta.title;
  const pageDescription = isZh
    ? '基于高斯核密度估计（KDE）与 GPU 实时色带映射的三维地理热力图：切换配色方案、热度强度、低值裁切与抗锯齿等值线均为 O(1) GPU Uniform 更新，并支持在贴合地形/3D Tiles（GroundPrimitive）与悬浮平面（Primitive）之间实时无缝切换。'
    : meta.description;

  const apiProperties = isZh
    ? [
        {
          property: 'points',
          type: 'HeatmapPoint[]',
          defaultValue: 'required',
          description: '加权地理样本点数组 `{ position: [lng, lat], weight? }`（至少 1 个点）。',
        },
        {
          property: 'bounds',
          type: '[w, s, e, n]',
          defaultValue: 'auto',
          description: '热力图经纬度边界；省略时自动根据样本点与核半径扩展计算。',
        },
        {
          property: 'radius',
          type: 'number',
          defaultValue: '0.065',
          description: '高斯核影响半径占网格宽度的比例（0.01–0.25）。',
        },
        {
          property: 'palette',
          type: "'thermal' | 'inferno' | 'viridis' | 'ocean'",
          defaultValue: "'thermal'",
          description: '内置 5 段平滑色带预设，切换时仅更新 GPU Uniform，零重绘开销。',
        },
        {
          property: 'colors',
          type: 'ColorInput[5]',
          defaultValue: '—',
          description: '自定义 5 段色带数组，传入后覆盖内置 `palette`。',
        },
        {
          property: 'intensity / opacity',
          type: 'number',
          defaultValue: '1 / 0.82',
          description: '热度增益倍率与整体不透明度，支持 O(1) 实时更新。',
        },
        {
          property: 'minThreshold',
          type: 'number',
          defaultValue: '0.04',
          description: '低密度透明裁切阈值（0–0.4），让边缘平滑融入底图影像。',
        },
        {
          property: 'contours',
          type: 'boolean',
          defaultValue: 'false',
          description: '是否在 GPU 片元着色器中叠加抗锯齿等密度等值线。',
        },
        {
          property: 'clampToGround',
          type: 'boolean',
          defaultValue: 'true',
          description:
            'true 时使用 GroundPrimitive 像素级贴合地形与 3D Tiles；false 时渲染悬浮平面。',
        },
      ]
    : [
        {
          property: 'points',
          type: 'HeatmapPoint[]',
          defaultValue: 'required',
          description: 'Weighted geographic points `{ position: [lng, lat], weight? }` (min 1).',
        },
        {
          property: 'bounds',
          type: '[w, s, e, n]',
          defaultValue: 'auto',
          description:
            'Geographic bounds in degrees; auto-computed with kernel padding if omitted.',
        },
        {
          property: 'radius',
          type: 'number',
          defaultValue: '0.065',
          description: 'Gaussian kernel radius as a fraction of grid width (0.01–0.25).',
        },
        {
          property: 'palette',
          type: "'thermal' | 'inferno' | 'viridis' | 'ocean'",
          defaultValue: "'thermal'",
          description: 'Built-in 5-stop color ramp preset (O(1) GPU uniform update).',
        },
        {
          property: 'colors',
          type: 'ColorInput[5]',
          defaultValue: '—',
          description: 'Custom 5-stop color ramp overriding `palette`.',
        },
        {
          property: 'intensity / opacity',
          type: 'number',
          defaultValue: '1 / 0.82',
          description: 'Density intensity multiplier and overall layer opacity.',
        },
        {
          property: 'minThreshold',
          type: 'number',
          defaultValue: '0.04',
          description: 'Lower density cutoff [0–0.4] dissolving outskirts cleanly into imagery.',
        },
        {
          property: 'contours',
          type: 'boolean',
          defaultValue: 'false',
          description: 'Overlays crisp anti-aliased equal-density isoline contours in GLSL.',
        },
        {
          property: 'clampToGround',
          type: 'boolean',
          defaultValue: 'true',
          description:
            'Drapes pixel-perfectly on terrain & 3D Tiles via GroundPrimitive when true.',
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
        label={isZh ? 'Heatmap 地理热力图演示场景' : 'Heatmap 3D CesiumJS demo scene'}
        shouldAnimate={false}
        onMount={handleMount}
        paramGroups={paramGroups}
        onResetParams={handleResetParams}
        hasModifiedParams={hasModifiedParams}
        actions={
          <>
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
