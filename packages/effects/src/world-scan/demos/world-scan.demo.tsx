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
import { Eye, EyeOff, Pause, Play, RotateCcw, Zap } from 'lucide-react';
import { CesiumStage } from '@docs/components/CesiumStage';
import type { ParamGroup } from '@docs/components/EffectParamPanel';
import { useDocsPageMarkdown } from '@docs/lib/docsPage';
import type { EffectDemoMeta } from '@docs/lib/effectDemos';
import { useI18n } from '@docs/lib/i18n';
import { formatEffectDocMarkdown } from '@docs/lib/markdown';
import { createWorldScan, type WorldScanHandle, type WorldScanMode } from '../index.ts';

export const meta: EffectDemoMeta = {
  id: 'world-scan',
  title: 'World Scan',
  section: 'Visual Effects',
  description:
    'PostProcessStage depth-reconstructed 3D holographic scan wave sweeping across real terrain ridges and 3D Tiles building facades.',
  isNew: true,
  order: 15,
};

const INSTALL_CMD = 'pnpm add @cesiumlab/effects @cesiumlab/cesium';

const USAGE_CODE = `import { createWorldScan } from '@cesiumlab/effects';

// 1. Radial expanding holographic scan across terrain & 3D buildings
const scan = createWorldScan(viewer, {
  center: [102.9, 31.1],
  mode: 'radial',
  radius: 18_000,
  color: '#00e5ff',
  bandWidth: 0.24,
  gridEnabled: true,
  gridSize: 600,
  duration: 4.5,
});

// 2. Switch live to a directional sweeping curtain
scan.update({ mode: 'linear', direction: 45, color: '#a855f7' });

// Clean up when unmounting
scan.destroy();`;

// Siguniang Mountain / Qionglai alpine range — dramatic peaks & ridges showcase 3D depth-buffer scanning
const CENTER_COORD: readonly [number, number] = [102.9, 31.1];

function resetCamera(viewer: Viewer) {
  viewer.camera.lookAt(
    Cartesian3.fromDegrees(CENTER_COORD[0], CENTER_COORD[1], 3_600),
    new HeadingPitchRange(CesiumMath.toRadians(330), CesiumMath.toRadians(-30), 46_000),
  );
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
}

const DEFAULTS = {
  mode: 'radial' as WorldScanMode,
  color: '#00e5ff',
  radiusKm: 18,
  bandWidth: 0.24,
  duration: 4.5,
  speed: 1,
  intensity: 1,
  direction: 45,
  gridEnabled: true,
  gridSize: 600,
  loop: true,
} as const;

export default function WorldScanDemoPage() {
  const { isZh } = useI18n();
  const viewerRef = useRef<Viewer | null>(null);
  const scanRef = useRef<WorldScanHandle | null>(null);

  const [mode, setMode] = useState<WorldScanMode>(DEFAULTS.mode);
  const [paused, setPaused] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [visible, setVisible] = useState(true);
  const [color, setColor] = useState<string>(DEFAULTS.color);
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULTS.radiusKm);
  const [bandWidth, setBandWidth] = useState<number>(DEFAULTS.bandWidth);
  const [duration, setDuration] = useState<number>(DEFAULTS.duration);
  const [speed, setSpeed] = useState<number>(DEFAULTS.speed);
  const [intensity, setIntensity] = useState<number>(DEFAULTS.intensity);
  const [direction, setDirection] = useState<number>(DEFAULTS.direction);
  const [gridEnabled, setGridEnabled] = useState<boolean>(DEFAULTS.gridEnabled);
  const [gridSize, setGridSize] = useState<number>(DEFAULTS.gridSize);
  const [loop, setLoop] = useState<boolean>(DEFAULTS.loop);

  const handleMount = useCallback(
    (viewer: Viewer) => {
      viewerRef.current = viewer;
      const handle = createWorldScan(viewer, {
        center: CENTER_COORD,
        height: 3_600,
        mode,
        color,
        radius: radiusKm * 1_000,
        bandWidth,
        duration,
        speed,
        intensity,
        direction,
        gridEnabled,
        gridSize,
        loop,
        show: visible,
        paused,
      });
      scanRef.current = handle;
      resetCamera(viewer);
      return () => {
        handle.destroy();
        scanRef.current = null;
        viewerRef.current = null;
      };
    },
    // Mount once; live updates flow through handle.update() below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    scanRef.current?.update({
      mode,
      color,
      radius: radiusKm * 1_000,
      bandWidth,
      duration,
      speed,
      intensity,
      direction,
      gridEnabled,
      gridSize,
      loop,
    });
  }, [
    mode,
    color,
    radiusKm,
    bandWidth,
    duration,
    speed,
    intensity,
    direction,
    gridEnabled,
    gridSize,
    loop,
  ]);

  useEffect(() => {
    scanRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    scanRef.current?.setVisible(visible);
  }, [visible]);

  const handleResetParams = useCallback(() => {
    setMode(DEFAULTS.mode);
    setColor(DEFAULTS.color);
    setRadiusKm(DEFAULTS.radiusKm);
    setBandWidth(DEFAULTS.bandWidth);
    setDuration(DEFAULTS.duration);
    setSpeed(DEFAULTS.speed);
    setIntensity(DEFAULTS.intensity);
    setDirection(DEFAULTS.direction);
    setGridEnabled(DEFAULTS.gridEnabled);
    setGridSize(DEFAULTS.gridSize);
    setLoop(DEFAULTS.loop);
  }, []);

  const hasModifiedParams =
    mode !== DEFAULTS.mode ||
    color !== DEFAULTS.color ||
    radiusKm !== DEFAULTS.radiusKm ||
    bandWidth !== DEFAULTS.bandWidth ||
    duration !== DEFAULTS.duration ||
    speed !== DEFAULTS.speed ||
    intensity !== DEFAULTS.intensity ||
    direction !== DEFAULTS.direction ||
    gridEnabled !== DEFAULTS.gridEnabled ||
    gridSize !== DEFAULTS.gridSize ||
    loop !== DEFAULTS.loop;

  const paramGroups = useMemo<ParamGroup[]>(
    () => [
      {
        id: 'appearance',
        label: isZh ? '扫描模式与外观' : 'Mode & Appearance',
        controls: [
          {
            type: 'segment',
            id: 'mode',
            label: isZh ? '波前形态' : 'Wavefront mode',
            value: mode,
            options: [
              { value: 'radial', label: isZh ? '环形扩散' : 'Radial' },
              { value: 'linear', label: isZh ? '线性扫描幕' : 'Linear' },
            ],
            onChange: (val) => {
              if (val === 'radial' || val === 'linear') setMode(val);
            },
          },
          {
            type: 'color',
            id: 'color',
            label: isZh ? '扫描光色' : 'Scan color',
            value: color,
            onChange: setColor,
          },
          {
            type: 'slider',
            id: 'intensity',
            label: isZh
              ? `辉光强度 · ${intensity.toFixed(1)}x`
              : `Intensity · ${intensity.toFixed(1)}x`,
            value: intensity,
            min: 0.2,
            max: 2,
            step: 0.1,
            onChange: setIntensity,
          },
        ],
      },
      {
        id: 'geometry',
        label: isZh ? '空间与网格' : 'Geometry & Grid',
        controls: [
          {
            type: 'slider',
            id: 'radiusKm',
            label: isZh ? `扫描半径 · ${radiusKm}km` : `Scan radius · ${radiusKm}km`,
            value: radiusKm,
            min: 4,
            max: 40,
            step: 1,
            onChange: setRadiusKm,
          },
          {
            type: 'slider',
            id: 'bandWidth',
            label: isZh
              ? `尾迹宽度 · ${Math.round(bandWidth * 100)}%`
              : `Trail width · ${Math.round(bandWidth * 100)}%`,
            value: bandWidth,
            min: 0.06,
            max: 0.5,
            step: 0.02,
            onChange: setBandWidth,
          },
          ...(mode === 'linear'
            ? [
                {
                  type: 'slider' as const,
                  id: 'direction',
                  label: isZh ? `推进方位角 · ${direction}°` : `Sweep azimuth · ${direction}°`,
                  value: direction,
                  min: 0,
                  max: 360,
                  step: 5,
                  onChange: setDirection,
                },
              ]
            : []),
          {
            type: 'switch',
            id: 'gridEnabled',
            label: isZh ? '全息网格高亮' : 'Holographic grid',
            value: gridEnabled,
            onChange: setGridEnabled,
          },
          ...(gridEnabled
            ? [
                {
                  type: 'slider' as const,
                  id: 'gridSize',
                  label: isZh ? `网格间距 · ${gridSize}m` : `Grid spacing · ${gridSize}m`,
                  value: gridSize,
                  min: 100,
                  max: 1_500,
                  step: 50,
                  onChange: setGridSize,
                },
              ]
            : []),
        ],
      },
      {
        id: 'motion',
        label: isZh ? '动画节拍' : 'Motion',
        controls: [
          {
            type: 'switch',
            id: 'loop',
            label: isZh ? '连续循环扫描' : 'Continuous loop',
            value: loop,
            onChange: setLoop,
          },
          {
            type: 'slider',
            id: 'duration',
            label: isZh
              ? `单轮周期 · ${duration.toFixed(1)}s`
              : `Duration · ${duration.toFixed(1)}s`,
            value: duration,
            min: 1.5,
            max: 10,
            step: 0.5,
            onChange: setDuration,
          },
          {
            type: 'slider',
            id: 'speed',
            label: isZh ? `播放倍率 · ${speed.toFixed(1)}x` : `Speed · ${speed.toFixed(1)}x`,
            value: speed,
            min: 0.2,
            max: 3,
            step: 0.1,
            onChange: setSpeed,
          },
        ],
      },
    ],
    [
      isZh,
      mode,
      color,
      intensity,
      radiusKm,
      bandWidth,
      direction,
      gridEnabled,
      gridSize,
      loop,
      duration,
      speed,
    ],
  );

  const handleResetCamera = () => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      resetCamera(viewer);
    }
  };

  const pageTitle = isZh ? '全地形立体扫描波 (World Scan)' : meta.title;
  const pageDescription = isZh
    ? '基于 PostProcessStage 采样深度缓冲并在眼空间高精度反算 ENU 三维坐标的纯 GPU 扫描波：0 几何体开销，天然像素级扫过陡峭山峰与 3D Tiles 建筑立面，支持环形扩散与线性推进双模式、抗锯齿全息网格及坡面立面边缘增亮。'
    : meta.description;

  const apiProperties = isZh
    ? [
        {
          property: 'center',
          type: '[lng, lat]',
          defaultValue: 'required',
          description: '扫描中心经纬度（度）。',
        },
        {
          property: 'height',
          type: 'number',
          defaultValue: '0',
          description: '中心基准高程（米，用于立面等高网格参考）。',
        },
        {
          property: 'mode',
          type: "'radial' | 'linear'",
          defaultValue: "'radial'",
          description: '波前形态：环形扩散波或线性推进扫描幕。',
        },
        {
          property: 'radius',
          type: 'number',
          defaultValue: '8000',
          description: '最大扫描作用半径（米）。',
        },
        {
          property: 'color',
          type: 'Color | string',
          defaultValue: "'#00e5ff'",
          description: '扫描波主色，支持 Cesium Color 或 CSS 色值。',
        },
        {
          property: 'bandWidth / intensity',
          type: 'number',
          defaultValue: '0.22 / 1',
          description: '尾迹带宽占半径比例（0.04–0.6）与辉光亮度倍率（0–2）。',
        },
        {
          property: 'direction',
          type: 'number',
          defaultValue: '45',
          description: '线性扫描推进方位角（度，0 = 正北，90 = 正东）。',
        },
        {
          property: 'gridEnabled / gridSize',
          type: 'boolean / number',
          defaultValue: 'true / 400',
          description: '是否在扫描尾迹内显示抗锯齿全息网格及网格单元间距（米）。',
        },
        {
          property: 'loop / duration / speed',
          type: 'boolean / number',
          defaultValue: 'true / 4.5 / 1',
          description: '是否连续循环扫描、单轮扫描周期（秒）与播放倍率。',
        },
        {
          property: 'trigger / show / hide / update / destroy',
          type: 'WorldScanHandle',
          defaultValue: '—',
          description: '手动发射扫描波及统一句柄方法（显隐、热更新、暂停/重置与幂等销毁）。',
        },
      ]
    : [
        {
          property: 'center',
          type: '[lng, lat]',
          defaultValue: 'required',
          description: 'Scan origin [longitude, latitude] in degrees.',
        },
        {
          property: 'height',
          type: 'number',
          defaultValue: '0',
          description: 'Reference elevation in metres for vertical elevation contours.',
        },
        {
          property: 'mode',
          type: "'radial' | 'linear'",
          defaultValue: "'radial'",
          description: 'Wavefront shape: expanding ring or directional sweeping curtain.',
        },
        {
          property: 'radius',
          type: 'number',
          defaultValue: '8000',
          description: 'Maximum scan reach in metres.',
        },
        {
          property: 'color',
          type: 'Color | string',
          defaultValue: "'#00e5ff'",
          description: 'Primary luminous scan color (Cesium Color or CSS string).',
        },
        {
          property: 'bandWidth / intensity',
          type: 'number',
          defaultValue: '0.22 / 1',
          description:
            'Trail width fraction of radius (0.04–0.6) and glow brightness multiplier (0–2).',
        },
        {
          property: 'direction',
          type: 'number',
          defaultValue: '45',
          description: 'Linear sweep azimuth in degrees (0 = North, 90 = East).',
        },
        {
          property: 'gridEnabled / gridSize',
          type: 'boolean / number',
          defaultValue: 'true / 400',
          description:
            'Toggle anti-aliased holographic grid inside the wake and grid cell spacing in metres.',
        },
        {
          property: 'loop / duration / speed',
          type: 'boolean / number',
          defaultValue: 'true / 4.5 / 1',
          description:
            'Continuous looping flag, single-sweep duration in seconds, and playback speed.',
        },
        {
          property: 'trigger / show / hide / update / destroy',
          type: 'WorldScanHandle',
          defaultValue: '—',
          description:
            'Launch a wave on demand plus unified handle methods for visibility, hot updates, pause/restart, and cleanup.',
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
        label={isZh ? 'World Scan 全地形立体扫描波演示场景' : 'World Scan 3D CesiumJS demo scene'}
        shouldAnimate={false}
        onMount={handleMount}
        paramGroups={paramGroups}
        onResetParams={handleResetParams}
        hasModifiedParams={hasModifiedParams}
        actions={
          <>
            <Button
              label={isZh ? '发射扫描' : 'Trigger'}
              variant="primary"
              size="sm"
              icon={<Icon icon={Zap} />}
              onClick={() => scanRef.current?.trigger()}
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
