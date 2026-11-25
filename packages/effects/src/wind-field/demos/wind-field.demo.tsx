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
import { Eye, EyeOff, Pause, Play, RotateCcw, Trash2 } from 'lucide-react';
import { CesiumStage } from '@docs/components/CesiumStage';
import type { ParamGroup } from '@docs/components/EffectParamPanel';
import { useDocsPageMarkdown } from '@docs/lib/docsPage';
import type { EffectDemoMeta } from '@docs/lib/effectDemos';
import { useI18n } from '@docs/lib/i18n';
import { formatEffectDocMarkdown } from '@docs/lib/markdown';
import {
  createWindField,
  type WindFieldBounds,
  type WindFieldHandle,
  type WindFieldPalette,
  type WindFieldPreset,
} from '../index.ts';

export const meta: EffectDemoMeta = {
  id: 'wind-field',
  title: 'Wind Field',
  section: 'Visual Effects',
  description:
    'GPU-accelerated particle streamline wind & ocean current visualization using WebGL2 trail-accumulation FBOs with speed-mapped color ramps and GroundPrimitive clamping.',
  isNew: true,
  order: 12,
};

const INSTALL_CMD = 'pnpm add @cesiumlab/effects cesium';

const USAGE_CODE = `import { createWindField } from '@cesiumlab/effects';

const wind = createWindField(viewer, {
  bounds: [112.0, 18.0, 136.0, 38.0], // [west, south, east, north]
  preset: 'typhoon', // 'typhoon' | 'ocean', or pass custom U/V grid via \`field\`
  particleCount: 6_000,
  speed: 1,
  fadeOpacity: 0.962,
  palette: 'wind',
  clampToGround: true,
});

// Live parameter & mode updates
wind.update({ preset: 'ocean', palette: 'ocean', particleCount: 10_000 });
wind.clear();
wind.destroy();`;

// East China Sea / Western Pacific typhoon corridor & Kuroshio Current domain
const DEMO_BOUNDS: WindFieldBounds = [112.0, 18.0, 136.0, 38.0];

function resetCamera(viewer: Viewer) {
  viewer.camera.lookAt(
    Cartesian3.fromDegrees(124.0, 27.5, 0),
    new HeadingPitchRange(CesiumMath.toRadians(0), CesiumMath.toRadians(-62), 3_400_000),
  );
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
}

const DEFAULTS = {
  preset: 'typhoon' as WindFieldPreset,
  palette: 'wind' as WindFieldPalette,
  particleCount: 6_000,
  lineWidth: 2.2,
  speed: 1,
  fadeOpacity: 0.962,
  opacity: 0.92,
  clampToGround: true,
  heightKm: 25,
} as const;

export default function WindFieldDemoPage() {
  const { isZh } = useI18n();
  const viewerRef = useRef<Viewer | null>(null);
  const windRef = useRef<WindFieldHandle | null>(null);

  const [paused, setPaused] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [visible, setVisible] = useState(true);
  const [preset, setPreset] = useState<WindFieldPreset>(DEFAULTS.preset);
  const [palette, setPalette] = useState<WindFieldPalette>(DEFAULTS.palette);
  const [particleCount, setParticleCount] = useState<number>(DEFAULTS.particleCount);
  const [lineWidth, setLineWidth] = useState<number>(DEFAULTS.lineWidth);
  const [speed, setSpeed] = useState<number>(DEFAULTS.speed);
  const [fadeOpacity, setFadeOpacity] = useState<number>(DEFAULTS.fadeOpacity);
  const [opacity, setOpacity] = useState<number>(DEFAULTS.opacity);
  const [clampToGround, setClampToGround] = useState<boolean>(DEFAULTS.clampToGround);
  const [heightKm, setHeightKm] = useState<number>(DEFAULTS.heightKm);

  const handlePresetChange = useCallback((nextPreset: WindFieldPreset) => {
    setPreset(nextPreset);
    setPalette(nextPreset === 'ocean' ? 'ocean' : 'wind');
  }, []);

  const handleMount = useCallback(
    (viewer: Viewer) => {
      viewerRef.current = viewer;
      windRef.current = createWindField(viewer, {
        bounds: DEMO_BOUNDS,
        preset,
        palette,
        particleCount,
        lineWidth,
        speed,
        fadeOpacity,
        opacity,
        clampToGround,
        height: heightKm * 1_000,
        paused,
        show: visible,
      });
      resetCamera(viewer);

      return () => {
        windRef.current?.destroy();
        windRef.current = null;
        viewerRef.current = null;
      };
    },
    // Mount once per stage lifecycle; updates are synced by effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    windRef.current?.update({
      preset,
      palette,
      particleCount,
      lineWidth,
      speed,
      fadeOpacity,
      opacity,
      clampToGround,
      height: heightKm * 1_000,
    });
  }, [
    preset,
    palette,
    particleCount,
    lineWidth,
    speed,
    fadeOpacity,
    opacity,
    clampToGround,
    heightKm,
  ]);

  useEffect(() => {
    windRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    windRef.current?.setVisible(visible);
  }, [visible]);

  const handleResetCamera = () => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      resetCamera(viewer);
    }
  };

  const hasModifiedParams =
    preset !== DEFAULTS.preset ||
    palette !== DEFAULTS.palette ||
    particleCount !== DEFAULTS.particleCount ||
    lineWidth !== DEFAULTS.lineWidth ||
    speed !== DEFAULTS.speed ||
    fadeOpacity !== DEFAULTS.fadeOpacity ||
    opacity !== DEFAULTS.opacity ||
    clampToGround !== DEFAULTS.clampToGround ||
    heightKm !== DEFAULTS.heightKm;

  const handleResetParams = useCallback(() => {
    setPreset(DEFAULTS.preset);
    setPalette(DEFAULTS.palette);
    setParticleCount(DEFAULTS.particleCount);
    setLineWidth(DEFAULTS.lineWidth);
    setSpeed(DEFAULTS.speed);
    setFadeOpacity(DEFAULTS.fadeOpacity);
    setOpacity(DEFAULTS.opacity);
    setClampToGround(DEFAULTS.clampToGround);
    setHeightKm(DEFAULTS.heightKm);
  }, []);

  const paramGroups = useMemo<ParamGroup[]>(
    () => [
      {
        id: 'field',
        label: isZh ? '流场与色带' : 'Field & Palette',
        controls: [
          {
            type: 'segment',
            id: 'preset',
            label: isZh ? '矢量场预设' : 'Vector field',
            value: preset,
            options: [
              { value: 'typhoon', label: isZh ? '台风气旋' : 'Typhoon' },
              { value: 'ocean', label: isZh ? '黑潮洋流' : 'Ocean Current' },
            ],
            onChange: (val) => {
              if (val === 'typhoon' || val === 'ocean') handlePresetChange(val);
            },
          },
          {
            type: 'segment',
            id: 'palette',
            label: isZh ? '速度色带' : 'Color ramp',
            value: palette,
            options: [
              { value: 'wind', label: isZh ? '风速' : 'Wind' },
              { value: 'ocean', label: isZh ? '洋流' : 'Ocean' },
              { value: 'thermal', label: isZh ? '热力' : 'Thermal' },
            ],
            onChange: (val) => {
              if (val === 'wind' || val === 'ocean' || val === 'thermal') setPalette(val);
            },
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
        ],
      },
      {
        id: 'particles',
        label: isZh ? '粒子与流线' : 'Particles & Trails',
        controls: [
          {
            type: 'slider',
            id: 'particleCount',
            label: isZh
              ? `粒子数量 · ${particleCount.toLocaleString()}`
              : `Particles · ${particleCount.toLocaleString()}`,
            value: particleCount,
            min: 1_000,
            max: 20_000,
            step: 1_000,
            onChange: setParticleCount,
          },
          {
            type: 'slider',
            id: 'lineWidth',
            label: isZh
              ? `流线粗细 · ${lineWidth.toFixed(1)}px`
              : `Line width · ${lineWidth.toFixed(1)}px`,
            value: lineWidth,
            min: 1.0,
            max: 4.6,
            step: 0.2,
            onChange: setLineWidth,
          },
          {
            type: 'slider',
            id: 'speed',
            label: isZh ? `流速倍率 · ${speed.toFixed(1)}x` : `Speed · ${speed.toFixed(1)}x`,
            value: speed,
            min: 0.2,
            max: 3,
            step: 0.1,
            onChange: setSpeed,
          },
          {
            type: 'slider',
            id: 'fadeOpacity',
            label: isZh
              ? `拖尾长度 · ${Math.round(fadeOpacity * 1000) / 10}%`
              : `Trail decay · ${Math.round(fadeOpacity * 1000) / 10}%`,
            value: fadeOpacity,
            min: 0.88,
            max: 0.986,
            step: 0.002,
            onChange: setFadeOpacity,
          },
          {
            type: 'switch',
            id: 'clampToGround',
            label: isZh ? '贴合地表 / 海面' : 'Clamp to ground',
            value: clampToGround,
            onChange: setClampToGround,
          },
          ...(!clampToGround
            ? [
                {
                  type: 'slider' as const,
                  id: 'height',
                  label: isZh ? `等压面高度 · ${heightKm}km` : `Altitude · ${heightKm}km`,
                  value: heightKm,
                  min: 0,
                  max: 120,
                  step: 5,
                  onChange: setHeightKm,
                },
              ]
            : []),
        ],
      },
    ],
    [
      isZh,
      preset,
      handlePresetChange,
      palette,
      opacity,
      particleCount,
      lineWidth,
      speed,
      fadeOpacity,
      clampToGround,
      heightKm,
    ],
  );

  const pageTitle = isZh ? 'GPU 粒子风场 / 洋流场 (Wind Field)' : meta.title;
  const pageDescription = isZh
    ? '基于离屏 WebGL2 拖尾累积帧缓冲与双线性矢量场积分实现的动态粒子流线引擎：支持万级粒子按风速/流速 5 段色带实时着色，内置台风气旋与黑潮洋流预设，也可传入任意自定义 U/V 气象或海洋网格数据，并支持贴合地表（GroundPrimitive）与高空等压面无缝切换。'
    : meta.description;

  const apiProperties = isZh
    ? [
        {
          property: 'bounds',
          type: '[w, s, e, n]',
          defaultValue: 'required',
          description: '风场/洋流场覆盖的经纬度范围（度）。',
        },
        {
          property: 'preset',
          type: "'typhoon' | 'ocean'",
          defaultValue: "'typhoon'",
          description: '内置解析矢量场预设（台风气旋风场 / 黑潮洋流场），未传 `field` 时生效。',
        },
        {
          property: 'field',
          type: 'WindFieldGrid',
          defaultValue: '—',
          description:
            '自定义 2D 网格矢量场 `{ width, height, u: Float32Array, v: Float32Array }`。',
        },
        {
          property: 'particleCount',
          type: 'number',
          defaultValue: '6000',
          description: '同时活跃的流线粒子数量（200–30000），支持实时热更新。',
        },
        {
          property: 'lineWidth',
          type: 'number',
          defaultValue: '2.2',
          description: 'SDF 抗锯齿流线宽度（离屏纹素，0.8–6）。',
        },
        {
          property: 'resolution',
          type: 'number',
          defaultValue: '2048',
          description: '离屏拖尾帧缓冲分辨率（256–2048）。',
        },
        {
          property: 'speed',
          type: 'number',
          defaultValue: '1',
          description: '粒子平流推进速度倍率。',
        },
        {
          property: 'fadeOpacity',
          type: 'number',
          defaultValue: '0.962',
          description: '每帧拖尾保持系数（0.84–0.992），越大流线拖尾越长。',
        },
        {
          property: 'palette',
          type: "'wind' | 'ocean' | 'thermal'",
          defaultValue: "'wind'",
          description: '按局部速度映射的 5 段 GPU 着色色带。',
        },
        {
          property: 'clampToGround',
          type: 'boolean',
          defaultValue: 'true',
          description:
            'true 时通过 GroundPrimitive 贴合地形与海面；false 时悬浮于 `height` 等压面。',
        },
        {
          property: 'clear()',
          type: 'method',
          defaultValue: '—',
          description: '立即清空历史拖尾缓冲，重新生成流线。',
        },
      ]
    : [
        {
          property: 'bounds',
          type: '[w, s, e, n]',
          defaultValue: 'required',
          description: 'Geographic rectangle [west, south, east, north] in degrees.',
        },
        {
          property: 'preset',
          type: "'typhoon' | 'ocean'",
          defaultValue: "'typhoon'",
          description: 'Built-in analytical vector field preset used when `field` is omitted.',
        },
        {
          property: 'field',
          type: 'WindFieldGrid',
          defaultValue: '—',
          description: 'Custom 2D U/V velocity grid `{ width, height, u, v }`.',
        },
        {
          property: 'particleCount',
          type: 'number',
          defaultValue: '6000',
          description: 'Active streamline particle count (200–30000).',
        },
        {
          property: 'lineWidth',
          type: 'number',
          defaultValue: '2.2',
          description: 'Anti-aliased SDF streamline width in offscreen texels (0.8–6).',
        },
        {
          property: 'resolution',
          type: 'number',
          defaultValue: '2048',
          description: 'Offscreen trail FBO resolution in pixels (256–2048).',
        },
        {
          property: 'speed',
          type: 'number',
          defaultValue: '1',
          description: 'Particle advection speed multiplier.',
        },
        {
          property: 'fadeOpacity',
          type: 'number',
          defaultValue: '0.962',
          description: 'Per-frame trail persistence factor in [0.84, 0.992].',
        },
        {
          property: 'palette',
          type: "'wind' | 'ocean' | 'thermal'",
          defaultValue: "'wind'",
          description: '5-stop speed-to-color ramp preset.',
        },
        {
          property: 'clampToGround',
          type: 'boolean',
          defaultValue: 'true',
          description: 'Drapes via GroundPrimitive when true, or floats at `height` when false.',
        },
        {
          property: 'clear()',
          type: 'method',
          defaultValue: '—',
          description: 'Immediately clears accumulated streamline trail buffers.',
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
        label={isZh ? 'Wind Field GPU 粒子风场演示场景' : 'Wind Field 3D CesiumJS demo scene'}
        shouldAnimate={false}
        onMount={handleMount}
        paramGroups={paramGroups}
        onResetParams={handleResetParams}
        hasModifiedParams={hasModifiedParams}
        actions={
          <>
            <Button
              label={isZh ? '清空' : 'Clear'}
              variant="ghost"
              size="sm"
              icon={<Icon icon={Trash2} />}
              onClick={() => windRef.current?.clear()}
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
