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
import { Eye, EyeOff, RotateCcw } from 'lucide-react';
import { CesiumStage } from '@docs/components/CesiumStage';
import type { ParamGroup } from '@docs/components/EffectParamPanel';
import { useDocsPageMarkdown } from '@docs/lib/docsPage';
import type { EffectDemoMeta } from '@docs/lib/effectDemos';
import { useI18n } from '@docs/lib/i18n';
import { formatEffectDocMarkdown } from '@docs/lib/markdown';
import {
  createTerrainAnalysis,
  type TerrainAnalysisHandle,
  type TerrainAnalysisMode,
} from '../index.ts';

export const meta: EffectDemoMeta = {
  id: 'terrain-analysis',
  title: 'Terrain Analysis',
  section: 'Visual Effects',
  description:
    'Pure-GPU CesiumJS globe.material shader for anti-aliased topographic contours, hypsometric elevation bands, geotechnical slope hazard, and 360-degree terrain aspect.',
  isNew: true,
  order: 14,
};

const INSTALL_CMD = 'pnpm add @cesiumlab/effects @cesiumlab/cesium';

const USAGE_CODE = `import { createTerrainAnalysis } from '@cesiumlab/effects';

// Ensure terrain has vertex normals enabled for slope & aspect analysis:
// Terrain.fromWorldTerrain({ requestVertexNormals: true })
const terrain = createTerrainAnalysis(viewer, {
  mode: 'elevation', // 'contour' | 'elevation' | 'slope' | 'aspect'
  contourSpacing: 200,
  contourWidth: 1.4,
  contourColor: '#f8fafc',
  showContours: true,
  minElevation: 1_400,
  maxElevation: 6_500,
  opacity: 0.72,
});

// O(1) live mode switching
terrain.update({ mode: 'slope', maxSlopeDegrees: 55 });
terrain.destroy(); // Automatically restores previous globe.material`;

// Gongga Shan (7,556m) & Dadu River Gorge (~1,300m) in Western Sichuan — extreme relief & slope gradient
function resetCamera(viewer: Viewer) {
  viewer.camera.lookAt(
    Cartesian3.fromDegrees(101.88, 29.6, 3_600),
    new HeadingPitchRange(CesiumMath.toRadians(315), CesiumMath.toRadians(-26), 28_000),
  );
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
}

const DEFAULTS = {
  mode: 'elevation' as TerrainAnalysisMode,
  contourSpacing: 200,
  contourWidth: 1.4,
  contourColor: '#f8fafc',
  showContours: true,
  minElevation: 1_400,
  maxElevation: 6_500,
  maxSlopeDegrees: 60,
  opacity: 0.72,
} as const;

export default function TerrainAnalysisDemoPage() {
  const { isZh } = useI18n();
  const viewerRef = useRef<Viewer | null>(null);
  const analysisRef = useRef<TerrainAnalysisHandle | null>(null);

  const [visible, setVisible] = useState(true);
  const [mode, setMode] = useState<TerrainAnalysisMode>(DEFAULTS.mode);
  const [contourSpacing, setContourSpacing] = useState<number>(DEFAULTS.contourSpacing);
  const [contourWidth, setContourWidth] = useState<number>(DEFAULTS.contourWidth);
  const [contourColor, setContourColor] = useState<string>(DEFAULTS.contourColor);
  const [showContours, setShowContours] = useState<boolean>(DEFAULTS.showContours);
  const [minElevation, setMinElevation] = useState<number>(DEFAULTS.minElevation);
  const [maxElevation, setMaxElevation] = useState<number>(DEFAULTS.maxElevation);
  const [maxSlopeDegrees, setMaxSlopeDegrees] = useState<number>(DEFAULTS.maxSlopeDegrees);
  const [opacity, setOpacity] = useState<number>(DEFAULTS.opacity);

  const handleMount = useCallback(
    (viewer: Viewer) => {
      viewerRef.current = viewer;
      analysisRef.current = createTerrainAnalysis(viewer, {
        mode,
        contourSpacing,
        contourWidth,
        contourColor,
        showContours,
        minElevation,
        maxElevation,
        maxSlopeDegrees,
        opacity,
        show: visible,
      });
      resetCamera(viewer);

      return () => {
        analysisRef.current?.destroy();
        analysisRef.current = null;
        viewerRef.current = null;
      };
    },
    // Mount once per stage lifecycle; updates are synced by effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const safeMax = Math.max(maxElevation, minElevation + 200);
    analysisRef.current?.update({
      mode,
      contourSpacing,
      contourWidth,
      contourColor,
      showContours,
      minElevation,
      maxElevation: safeMax,
      maxSlopeDegrees,
      opacity,
    });
  }, [
    mode,
    contourSpacing,
    contourWidth,
    contourColor,
    showContours,
    minElevation,
    maxElevation,
    maxSlopeDegrees,
    opacity,
  ]);

  useEffect(() => {
    analysisRef.current?.setVisible(visible);
  }, [visible]);

  const handleResetCamera = () => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      resetCamera(viewer);
    }
  };

  const hasModifiedParams =
    mode !== DEFAULTS.mode ||
    contourSpacing !== DEFAULTS.contourSpacing ||
    contourWidth !== DEFAULTS.contourWidth ||
    contourColor !== DEFAULTS.contourColor ||
    showContours !== DEFAULTS.showContours ||
    minElevation !== DEFAULTS.minElevation ||
    maxElevation !== DEFAULTS.maxElevation ||
    maxSlopeDegrees !== DEFAULTS.maxSlopeDegrees ||
    opacity !== DEFAULTS.opacity;

  const handleResetParams = useCallback(() => {
    setMode(DEFAULTS.mode);
    setContourSpacing(DEFAULTS.contourSpacing);
    setContourWidth(DEFAULTS.contourWidth);
    setContourColor(DEFAULTS.contourColor);
    setShowContours(DEFAULTS.showContours);
    setMinElevation(DEFAULTS.minElevation);
    setMaxElevation(DEFAULTS.maxElevation);
    setMaxSlopeDegrees(DEFAULTS.maxSlopeDegrees);
    setOpacity(DEFAULTS.opacity);
  }, []);

  const paramGroups = useMemo<ParamGroup[]>(
    () => [
      {
        id: 'mode',
        label: isZh ? '分析模式' : 'Analysis Mode',
        controls: [
          {
            type: 'segment',
            id: 'mode',
            label: isZh ? '着色模式' : 'Shading mode',
            value: mode,
            options: [
              { value: 'elevation', label: isZh ? '高程' : 'Elev' },
              { value: 'slope', label: isZh ? '坡度' : 'Slope' },
              { value: 'aspect', label: isZh ? '坡向' : 'Aspect' },
              { value: 'contour', label: isZh ? '等高线' : 'Lines' },
            ],
            onChange: (val) => {
              if (val === 'contour' || val === 'elevation' || val === 'slope' || val === 'aspect') {
                setMode(val);
              }
            },
          },
          {
            type: 'slider',
            id: 'opacity',
            label: isZh
              ? `叠层不透明度 · ${Math.round(opacity * 100)}%`
              : `Overlay opacity · ${Math.round(opacity * 100)}%`,
            value: opacity,
            min: 0.15,
            max: 1,
            step: 0.05,
            onChange: setOpacity,
          },
          ...(mode === 'elevation'
            ? [
                {
                  type: 'slider' as const,
                  id: 'minElevation',
                  label: isZh ? `最低高程 · ${minElevation}m` : `Min elev · ${minElevation}m`,
                  value: minElevation,
                  min: 0,
                  max: 4_500,
                  step: 100,
                  onChange: (v: number) => {
                    setMinElevation(v);
                    if (v + 400 > maxElevation) setMaxElevation(v + 400);
                  },
                },
                {
                  type: 'slider' as const,
                  id: 'maxElevation',
                  label: isZh ? `最高高程 · ${maxElevation}m` : `Max elev · ${maxElevation}m`,
                  value: maxElevation,
                  min: 1_500,
                  max: 8_000,
                  step: 100,
                  onChange: (v: number) => {
                    setMaxElevation(v);
                    if (v - 400 < minElevation) setMinElevation(Math.max(0, v - 400));
                  },
                },
              ]
            : []),
          ...(mode === 'slope'
            ? [
                {
                  type: 'slider' as const,
                  id: 'maxSlopeDegrees',
                  label: isZh
                    ? `陡坡阈值 · ${maxSlopeDegrees}°`
                    : `Max slope · ${maxSlopeDegrees}°`,
                  value: maxSlopeDegrees,
                  min: 20,
                  max: 85,
                  step: 5,
                  onChange: setMaxSlopeDegrees,
                },
              ]
            : []),
        ],
      },
      {
        id: 'contours',
        label: isZh ? '等高线设置' : 'Contours',
        controls: [
          ...(mode !== 'contour'
            ? [
                {
                  type: 'switch' as const,
                  id: 'showContours',
                  label: isZh ? '叠加主/次等高线' : 'Overlay contours',
                  value: showContours,
                  onChange: setShowContours,
                },
              ]
            : []),
          {
            type: 'slider',
            id: 'contourSpacing',
            label: isZh ? `等高距 · ${contourSpacing}m` : `Spacing · ${contourSpacing}m`,
            value: contourSpacing,
            min: 50,
            max: 600,
            step: 25,
            onChange: setContourSpacing,
          },
          {
            type: 'slider',
            id: 'contourWidth',
            label: isZh
              ? `线宽 · ${contourWidth.toFixed(1)}px`
              : `Width · ${contourWidth.toFixed(1)}px`,
            value: contourWidth,
            min: 0.6,
            max: 3.2,
            step: 0.2,
            onChange: setContourWidth,
          },
          {
            type: 'color',
            id: 'contourColor',
            label: isZh ? '等高线颜色' : 'Contour color',
            value: contourColor,
            onChange: setContourColor,
          },
        ],
      },
    ],
    [
      isZh,
      mode,
      opacity,
      minElevation,
      maxElevation,
      maxSlopeDegrees,
      showContours,
      contourSpacing,
      contourWidth,
      contourColor,
    ],
  );

  const pageTitle = isZh ? '地形等高线与坡度分析着色 (Terrain Analysis)' : meta.title;
  const pageDescription = isZh
    ? '直接基于 CesiumJS 原生 `globe.material` 构建的纯 GPU 地形分析着色器：在任意 LOD 下像素级贴合真实三维地形，支持等高线（抗锯齿主/次计曲线）、高程分层设色、工程坡度分级与 360° 坡向分析实时切换，隐藏或销毁时自动无损恢复原有地表材质。'
    : meta.description;

  const apiProperties = isZh
    ? [
        {
          property: 'mode',
          type: "'contour' | 'elevation' | 'slope' | 'aspect'",
          defaultValue: "'elevation'",
          description: '地形分析着色模式：纯等高线、高程分层设色、坡度分级或 360° 坡向。',
        },
        {
          property: 'contourSpacing',
          type: 'number',
          defaultValue: '200',
          description: '次等高线的高程间距（米），每 5 条自动加粗为计曲线（主等高线）。',
        },
        {
          property: 'contourWidth',
          type: 'number',
          defaultValue: '1.4',
          description: '屏幕空间抗锯齿等高线宽度倍率（0.5–4）。',
        },
        {
          property: 'contourColor',
          type: 'ColorInput',
          defaultValue: "'#f8fafc'",
          description: '等高线颜色。',
        },
        {
          property: 'showContours',
          type: 'boolean',
          defaultValue: 'true',
          description: '在高程/坡度/坡向模式下是否同时叠加主次等高线。',
        },
        {
          property: 'minElevation',
          type: 'number',
          defaultValue: '1000',
          description: '高程色带下限海拔（米）。',
        },
        {
          property: 'maxElevation',
          type: 'number',
          defaultValue: '6500',
          description: '高程色带上限海拔（米）。',
        },
        {
          property: 'maxSlopeDegrees',
          type: 'number',
          defaultValue: '60',
          description: '坡度色带最高危陡坡角度阈值（度）。',
        },
        {
          property: 'opacity',
          type: 'number',
          defaultValue: '0.72',
          description: '地形着色叠层不透明度（0–1）。',
        },
      ]
    : [
        {
          property: 'mode',
          type: "'contour' | 'elevation' | 'slope' | 'aspect'",
          defaultValue: "'elevation'",
          description: 'Terrain shading mode: contours, elevation bands, slope hazard, or aspect.',
        },
        {
          property: 'contourSpacing',
          type: 'number',
          defaultValue: '200',
          description:
            'Elevation interval in metres between minor contours (every 5th is a major index line).',
        },
        {
          property: 'contourWidth',
          type: 'number',
          defaultValue: '1.4',
          description: 'Screen-space anti-aliased contour line width multiplier (0.5–4).',
        },
        {
          property: 'contourColor',
          type: 'ColorInput',
          defaultValue: "'#f8fafc'",
          description: 'Color of contour lines.',
        },
        {
          property: 'showContours',
          type: 'boolean',
          defaultValue: 'true',
          description:
            'Whether to overlay major/minor contour lines in elevation, slope, and aspect modes.',
        },
        {
          property: 'minElevation',
          type: 'number',
          defaultValue: '1000',
          description: 'Minimum elevation in metres for the elevation ramp.',
        },
        {
          property: 'maxElevation',
          type: 'number',
          defaultValue: '6500',
          description: 'Maximum elevation in metres for the elevation ramp.',
        },
        {
          property: 'maxSlopeDegrees',
          type: 'number',
          defaultValue: '60',
          description: 'Maximum slope angle in degrees mapped to the top of the slope hazard ramp.',
        },
        {
          property: 'opacity',
          type: 'number',
          defaultValue: '0.72',
          description: 'Overlay opacity multiplier (0–1).',
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
          isZh
            ? 'Terrain Analysis 地形等高线与坡度分析演示场景'
            : 'Terrain Analysis 3D CesiumJS demo scene'
        }
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
