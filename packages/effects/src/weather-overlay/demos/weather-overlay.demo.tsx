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
import { createWeatherOverlay, type WeatherMode, type WeatherOverlayHandle } from '../index.ts';

export const meta: EffectDemoMeta = {
  id: 'weather-overlay',
  title: 'Weather Overlay',
  section: 'Visual Effects',
  description:
    'Pure-GPU screen-space PostProcessStage weather engine supporting multi-layer parallax rain, swaying snow, and true depth-buffer atmospheric distance fog.',
  isNew: true,
  order: 10,
};

const INSTALL_CMD = 'pnpm add @cesiumlab/effects cesium';

const USAGE_CODE = `import { createWeatherOverlay } from '@cesiumlab/effects';

const weather = createWeatherOverlay(viewer, {
  mode: 'rain',        // 'rain' | 'snow' | 'fog'
  intensity: 0.75,
  speed: 1,
  wind: 0.25,
});

// Switch weather modes & tune parameters in O(1) via GPU uniforms
weather.update({ mode: 'snow', intensity: 0.9, wind: -0.2 });
weather.update({ mode: 'fog', fogVisibility: 14_000 });
weather.destroy();`;

function resetCamera(viewer: Viewer) {
  // Low grazing perspective across mountain ridges so rain, snow, and depth-layered fog all read vividly
  viewer.camera.lookAt(
    Cartesian3.fromDegrees(103.58, 31.42, 1_900),
    new HeadingPitchRange(CesiumMath.toRadians(34), CesiumMath.toRadians(-14), 14_000),
  );
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
}

const MODE_DEFAULT_COLORS: Record<WeatherMode, string> = {
  rain: '#dbeafe',
  snow: '#f8fafc',
  fog: '#cbd5e1',
};

const DEFAULTS = {
  mode: 'rain' as WeatherMode,
  color: MODE_DEFAULT_COLORS.rain,
  intensity: 0.75,
  speed: 1,
  wind: 0.25,
  fogVisibilityKm: 18,
} as const;

export default function WeatherOverlayDemoPage() {
  const { isZh } = useI18n();
  const viewerRef = useRef<Viewer | null>(null);
  const weatherRef = useRef<WeatherOverlayHandle | null>(null);

  const [paused, setPaused] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [visible, setVisible] = useState(true);
  const [mode, setMode] = useState<WeatherMode>(DEFAULTS.mode);
  const [color, setColor] = useState<string>(DEFAULTS.color);
  const [intensity, setIntensity] = useState<number>(DEFAULTS.intensity);
  const [speed, setSpeed] = useState<number>(DEFAULTS.speed);
  const [wind, setWind] = useState<number>(DEFAULTS.wind);
  const [fogVisibilityKm, setFogVisibilityKm] = useState<number>(DEFAULTS.fogVisibilityKm);

  const handleModeChange = useCallback((nextMode: WeatherMode) => {
    setMode(nextMode);
    setColor(MODE_DEFAULT_COLORS[nextMode]);
  }, []);

  const handleMount = useCallback(
    (viewer: Viewer) => {
      viewerRef.current = viewer;
      weatherRef.current = createWeatherOverlay(viewer, {
        mode,
        color,
        intensity,
        speed,
        wind,
        fogVisibility: fogVisibilityKm * 1_000,
        paused,
        show: visible,
      });
      resetCamera(viewer);

      return () => {
        weatherRef.current?.destroy();
        weatherRef.current = null;
        viewerRef.current = null;
      };
    },
    // Mount once per stage lifecycle; parameter updates use handle.update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    weatherRef.current?.update({
      mode,
      color,
      intensity,
      speed,
      wind,
      fogVisibility: fogVisibilityKm * 1_000,
    });
  }, [mode, color, intensity, speed, wind, fogVisibilityKm]);

  useEffect(() => {
    weatherRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    weatherRef.current?.setVisible(visible);
  }, [visible]);

  const handleResetCamera = () => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      resetCamera(viewer);
    }
  };

  const hasModifiedParams =
    mode !== DEFAULTS.mode ||
    color !== DEFAULTS.color ||
    intensity !== DEFAULTS.intensity ||
    speed !== DEFAULTS.speed ||
    wind !== DEFAULTS.wind ||
    fogVisibilityKm !== DEFAULTS.fogVisibilityKm;

  const handleResetParams = useCallback(() => {
    setMode(DEFAULTS.mode);
    setColor(DEFAULTS.color);
    setIntensity(DEFAULTS.intensity);
    setSpeed(DEFAULTS.speed);
    setWind(DEFAULTS.wind);
    setFogVisibilityKm(DEFAULTS.fogVisibilityKm);
  }, []);

  const paramGroups = useMemo<ParamGroup[]>(
    () => [
      {
        id: 'appearance',
        label: isZh ? '气象' : 'Weather',
        controls: [
          {
            type: 'segment',
            id: 'mode',
            label: isZh ? '天气类型' : 'Mode',
            value: mode,
            options: [
              { value: 'rain', label: isZh ? '雨' : 'Rain' },
              { value: 'snow', label: isZh ? '雪' : 'Snow' },
              { value: 'fog', label: isZh ? '雾' : 'Fog' },
            ],
            onChange: (val) => {
              if (val === 'rain' || val === 'snow' || val === 'fog') handleModeChange(val);
            },
          },
          {
            type: 'color',
            id: 'color',
            label: isZh ? '气象色调' : 'Tint color',
            value: color,
            onChange: setColor,
          },
          {
            type: 'slider',
            id: 'intensity',
            label: isZh
              ? `强度 · ${Math.round(intensity * 100)}%`
              : `Intensity · ${Math.round(intensity * 100)}%`,
            value: intensity,
            min: 0.1,
            max: 1.8,
            step: 0.05,
            onChange: setIntensity,
          },
        ],
      },
      {
        id: 'motion',
        label: isZh ? '风速与能见度' : 'Dynamics',
        controls: [
          {
            type: 'slider',
            id: 'speed',
            label: isZh ? `速度 · ${speed.toFixed(1)}x` : `Speed · ${speed.toFixed(1)}x`,
            value: speed,
            min: 0,
            max: 2.5,
            step: 0.1,
            onChange: setSpeed,
          },
          {
            type: 'slider',
            id: 'wind',
            label: isZh ? `风向倾斜 · ${wind.toFixed(2)}` : `Wind · ${wind.toFixed(2)}`,
            value: wind,
            min: -1,
            max: 1,
            step: 0.05,
            onChange: setWind,
          },
          {
            type: 'slider',
            id: 'fogVisibility',
            label: isZh
              ? `雾能见度 · ${fogVisibilityKm}km`
              : `Fog visibility · ${fogVisibilityKm}km`,
            value: fogVisibilityKm,
            min: 2,
            max: 50,
            step: 1,
            onChange: setFogVisibilityKm,
          },
        ],
      },
    ],
    [isZh, mode, handleModeChange, color, intensity, speed, wind, fogVisibilityKm],
  );

  const pageTitle = isZh ? '屏幕空间气象特效 (Weather Overlay)' : meta.title;
  const pageDescription = isZh
    ? '单 PostProcessStage 驱动的纯 GPU 屏幕空间气象引擎，0 每帧 CPU 粒子计算：支持 4 层视差倾斜雨丝、柔和风摆飘雪与基于真实深度缓冲的大气距离雾，可在雨 / 雪 / 雾之间 O(1) 无缝切换。'
    : meta.description;

  const apiProperties = isZh
    ? [
        {
          property: 'mode',
          type: "'rain' | 'snow' | 'fog'",
          defaultValue: "'rain'",
          description: '气象类型：多层视差雨丝、风摆飘雪或基于深度缓冲的大气距离雾。',
        },
        {
          property: 'intensity',
          type: 'number',
          defaultValue: '0.75',
          description: '整体密度与氛围强度倍率（0–2）。',
        },
        {
          property: 'speed / wind',
          type: 'number',
          defaultValue: '1 / 0.25',
          description: '下落/流动速度倍率以及风向倾斜/飘移量（-1 到 1）。',
        },
        {
          property: 'color',
          type: 'Color | string',
          defaultValue: 'auto',
          description: '雨丝、雪花或雾气色调；不传时随 mode 自动匹配默认色。',
        },
        {
          property: 'fogVisibility',
          type: 'number',
          defaultValue: '18000',
          description: 'fog 模式下的大气能见度距离（单位：米），数值越小雾越浓。',
        },
        {
          property: 'show / paused',
          type: 'boolean',
          defaultValue: 'true / false',
          description: '初始是否启用、初始是否暂停动画。',
        },
        {
          property: 'show / hide / setVisible / update / setPaused / restart / destroy',
          type: 'EffectHandle',
          defaultValue: '—',
          description: '统一特效句柄方法：显隐切换、O(1) 实时切换天气与参数、暂停/重置与幂等销毁。',
        },
      ]
    : [
        {
          property: 'mode',
          type: "'rain' | 'snow' | 'fog'",
          defaultValue: "'rain'",
          description:
            'Weather mode: parallax rain streaks, swaying snowflakes, or depth-based fog.',
        },
        {
          property: 'intensity',
          type: 'number',
          defaultValue: '0.75',
          description: 'Overall density and atmospheric intensity multiplier (0–2).',
        },
        {
          property: 'speed / wind',
          type: 'number',
          defaultValue: '1 / 0.25',
          description: 'Fall/drift speed multiplier and horizontal wind slant (-1 to 1).',
        },
        {
          property: 'color',
          type: 'Color | string',
          defaultValue: 'auto',
          description: 'Tint color for streaks, flakes, or haze; defaults per mode when omitted.',
        },
        {
          property: 'fogVisibility',
          type: 'number',
          defaultValue: '18000',
          description: 'Visibility distance in metres for fog mode (lower = denser haze).',
        },
        {
          property: 'show / paused',
          type: 'boolean',
          defaultValue: 'true / false',
          description: 'Initial enabled visibility and paused state.',
        },
        {
          property: 'show / hide / setVisible / update / setPaused / restart / destroy',
          type: 'EffectHandle',
          defaultValue: '—',
          description:
            'Unified handle methods for visibility, O(1) mode & uniform updates, pause/restart, and cleanup.',
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
            ? 'Weather Overlay 屏幕空间气象特效演示场景'
            : 'Weather Overlay 3D CesiumJS demo scene'
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
