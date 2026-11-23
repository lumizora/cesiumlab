import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Cartesian3, HeadingPitchRange, Math as CesiumMath, Matrix4, type Viewer } from 'cesium';
import {
  Button,
  Card,
  Code,
  CodeBlock,
  Divider,
  Grid,
  HStack,
  Heading,
  Icon,
  SegmentedControl,
  SegmentedControlItem,
  Slider,
  StackItem,
  Text,
  VStack,
} from '@astryxdesign/core';
import { Eye, EyeOff, Pause, Play, RotateCcw, Zap } from 'lucide-react';
import { CesiumStage } from '@docs/components/CesiumStage';
import { useDocsPageMarkdown } from '@docs/lib/docsPage';
import type { EffectDemoMeta } from '@docs/lib/effectDemos';
import { useI18n } from '@docs/lib/i18n';
import { formatEffectDocMarkdown } from '@docs/lib/markdown';
import { createPulseRing, type PulseRingHandle, type PulseRingMode } from '../index.ts';

export const meta: EffectDemoMeta = {
  id: 'pulse-ring',
  title: 'Pulse Ring',
  section: 'Visual Effects',
  description:
    'GPU-driven holographic radar ripples rendered on a single ENU disc Primitive with sharp leading wavefronts and soft inward wakes.',
  isNew: true,
  order: 2,
};

const INSTALL_CMD = 'pnpm add @cesiumlab/effects cesium';

const USAGE_CODE = `import { createPulseRing } from '@cesiumlab/effects';

// 1. Continuous staggered loop mode
const nodeRipple = createPulseRing(viewer, {
  position: [121.47, 31.23],
  mode: 'loop',
  color: '#00a8ff',
  maxRadius: 240_000,
  ringCount: 3,
});

// 2. Event-triggered strong burst mode (e.g. on comet arrival)
const hubPulse = createPulseRing(viewer, {
  position: [121.47, 31.23],
  mode: 'trigger',
  color: '#ffa31a',
  maxRadius: 680_000,
});
hubPulse.trigger();

// Clean up
nodeRipple.destroy();
hubPulse.destroy();`;

const CENTER_COORD: readonly [number, number] = [121.4737, 31.2304];

function resetCamera(viewer: Viewer) {
  viewer.camera.lookAt(
    Cartesian3.fromDegrees(CENTER_COORD[0], CENTER_COORD[1], 0),
    new HeadingPitchRange(CesiumMath.toRadians(340), CesiumMath.toRadians(-52), 2_400_000),
  );
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
}

export default function PulseRingDemoPage() {
  const { isZh } = useI18n();
  const viewerRef = useRef<Viewer | null>(null);
  const ringRef = useRef<PulseRingHandle | null>(null);

  const [mode, setMode] = useState<PulseRingMode>('loop');
  const [paused, setPaused] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [visible, setVisible] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [radiusKm, setRadiusKm] = useState(320);

  const buildRing = useCallback(
    (
      viewer: Viewer,
      nextMode: PulseRingMode,
      nextRadiusKm: number,
      nextSpeed: number,
      nextPaused: boolean,
    ) => {
      ringRef.current?.destroy();
      const handle = createPulseRing(viewer, {
        position: CENTER_COORD,
        mode: nextMode,
        color: nextMode === 'trigger' ? '#ffa31a' : '#00a8ff',
        maxRadius: nextRadiusKm * 1_000,
        speed: nextSpeed,
        paused: nextPaused,
      });
      ringRef.current = handle;
      if (nextMode === 'trigger' && !nextPaused) {
        handle.trigger();
      }
    },
    [],
  );

  const handleMount = useCallback(
    (viewer: Viewer) => {
      viewerRef.current = viewer;
      buildRing(viewer, mode, radiusKm, speed, paused);
      resetCamera(viewer);

      return () => {
        ringRef.current?.destroy();
        ringRef.current = null;
        viewerRef.current = null;
      };
    },
    // Mount once per stage lifecycle; mode/param updates are synced by effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    buildRing(viewer, mode, radiusKm, speed, paused);
    // Rebuild only when mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, buildRing]);

  useEffect(() => {
    ringRef.current?.update({ maxRadius: radiusKm * 1_000, speed });
  }, [radiusKm, speed]);

  useEffect(() => {
    ringRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    ringRef.current?.setVisible(visible);
  }, [visible]);

  const handleResetCamera = () => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      resetCamera(viewer);
    }
  };

  const pageTitle = isZh ? '地表扩散波纹 (Pulse Ring)' : meta.title;
  const pageDescription = isZh
    ? '单张 ENU 切平面 Primitive + 自定义 GLSL 雷达波纹着色器：每圈具备锐利高亮前沿与向内渐隐尾迹，0 每帧顶点重建，支持循环（loop）与事件触发强脉冲（trigger）两种模式。'
    : meta.description;

  const apiProperties = isZh
    ? [
        {
          property: 'position',
          type: '[lng, lat]',
          defaultValue: 'required',
          description: '波纹中心经纬度（单位：度）。',
        },
        {
          property: 'mode',
          type: "'loop' | 'trigger'",
          defaultValue: "'loop'",
          description: 'loop 为多圈错位持续扩散；trigger 为调用 trigger() 释放高速强脉冲。',
        },
        {
          property: 'color',
          type: 'Color | string',
          defaultValue: "'#00a8ff' / '#ffa31a'",
          description: '光环颜色，支持 Cesium Color 或 CSS 色值。',
        },
        {
          property: 'minRadius / maxRadius',
          type: 'number',
          defaultValue: '8km–180km / 25km–760km',
          description: '波纹起始与最大扩散半径（单位：米）。',
        },
        {
          property: 'ringCount',
          type: 'number',
          defaultValue: '3 / 2',
          description: '错位叠加的光环数量（1–6）。',
        },
        {
          property: 'duration / speed',
          type: 'number',
          defaultValue: '2.6s / 1.4s, 1',
          description: '单圈生命周期（秒）与实时扩散速度倍率。',
        },
        {
          property: 'show / paused',
          type: 'boolean',
          defaultValue: 'true / false',
          description: '初始是否可见、初始是否暂停动画。',
        },
        {
          property: 'trigger / show / hide / setVisible / update / destroy',
          type: 'PulseRingHandle',
          defaultValue: '—',
          description: '手动触发脉冲及统一句柄方法（显隐、更新、暂停/重置与幂等销毁）。',
        },
      ]
    : [
        {
          property: 'position',
          type: '[lng, lat]',
          defaultValue: 'required',
          description: 'Center [longitude, latitude] in degrees.',
        },
        {
          property: 'mode',
          type: "'loop' | 'trigger'",
          defaultValue: "'loop'",
          description: 'Continuous staggered loop or event-driven burst via `trigger()`.',
        },
        {
          property: 'color',
          type: 'Color | string',
          defaultValue: "'#00a8ff' / '#ffa31a'",
          description: 'Ring color (Cesium Color or CSS string).',
        },
        {
          property: 'minRadius / maxRadius',
          type: 'number',
          defaultValue: '8km–180km / 25km–760km',
          description: 'Starting and maximum expansion radius in metres.',
        },
        {
          property: 'ringCount',
          type: 'number',
          defaultValue: '3 / 2',
          description: 'Number of staggered rings (1–6).',
        },
        {
          property: 'duration / speed',
          type: 'number',
          defaultValue: '2.6s / 1.4s, 1',
          description: 'Single-ring lifetime in seconds and live speed multiplier.',
        },
        {
          property: 'show / paused',
          type: 'boolean',
          defaultValue: 'true / false',
          description: 'Initial visibility and paused state.',
        },
        {
          property: 'trigger / show / hide / setVisible / update / destroy',
          type: 'PulseRingHandle',
          defaultValue: '—',
          description:
            'Fire bursts plus unified handle methods for visibility, updates, pause/restart, and cleanup.',
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
        label={isZh ? 'Pulse Ring 扩散波纹演示场景' : 'Pulse Ring 3D CesiumJS demo scene'}
        shouldAnimate={false}
        onMount={handleMount}
        toolbar={
          <>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <SegmentedControl
                label={isZh ? '波纹模式' : 'Pulse ring mode'}
                size="sm"
                value={mode}
                onChange={(val) => {
                  if (val === 'loop' || val === 'trigger') setMode(val);
                }}
              >
                <SegmentedControlItem value="loop" label={isZh ? '循环' : 'Loop'} />
                <SegmentedControlItem value="trigger" label={isZh ? '触发脉冲' : 'Trigger'} />
              </SegmentedControl>

              {mode === 'trigger' && (
                <Button
                  label={isZh ? '触发脉冲' : 'Trigger pulse'}
                  variant="primary"
                  size="sm"
                  icon={<Icon icon={Zap} />}
                  onClick={() => ringRef.current?.trigger()}
                />
              )}

              <Button
                label={paused ? (isZh ? '播放' : 'Play') : isZh ? '暂停' : 'Pause'}
                variant="secondary"
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
            </HStack>

            <Grid columns={{ minWidth: 160, max: 2 }} gap={4} width="100%">
              <Slider
                label={isZh ? `最大半径 · ${radiusKm}km` : `Max radius · ${radiusKm}km`}
                value={radiusKm}
                min={100}
                max={800}
                step={20}
                onChange={setRadiusKm}
              />
              <Slider
                label={isZh ? `扩散速度 · ${speed.toFixed(1)}x` : `Speed · ${speed.toFixed(1)}x`}
                value={speed}
                min={0.3}
                max={3}
                step={0.1}
                onChange={setSpeed}
              />
            </Grid>
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
