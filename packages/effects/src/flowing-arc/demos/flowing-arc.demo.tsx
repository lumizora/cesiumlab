import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Cartesian3, Color, type Viewer } from 'cesium';
import {
  Button,
  Card,
  Code,
  CodeBlock,
  Divider,
  HStack,
  Heading,
  Icon,
  Slider,
  StackItem,
  Text,
  VStack,
  useClipboard,
} from '@astryxdesign/core';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { CesiumStage } from '@docs/components/CesiumStage';
import type { EffectDemoMeta } from '@docs/lib/effectDemos';
import { useI18n } from '@docs/lib/i18n';
import { createFlowingArc } from '../index.ts';

export const meta: EffectDemoMeta = {
  id: 'flowing-arc',
  title: 'Flowing Arc',
  section: 'Visual Effects',
  description:
    'Adds a luminous geodesic arc and a travelling point on the CesiumJS ellipsoid, synchronized with viewer.clock.',
  isNew: true,
  order: 1,
};

const INSTALL_CMD = 'pnpm add @cesiumlab/effects cesium';

const USAGE_CODE = `import { Color } from 'cesium';
import { createFlowingArc } from '@cesiumlab/effects';

const arc = createFlowingArc(viewer, {
  from: [103.82, 1.35],   // Singapore
  to: [139.69, 35.68],    // Tokyo
  height: 430_000,
  duration: 4,
  color: Color.DEEPSKYBLUE,
});

// Clean up when leaving the scene
arc.destroy();`;

const API_PROPERTIES = [
  {
    property: 'from',
    type: '[lng, lat]',
    defaultValue: 'required',
    description: 'Origin longitude and latitude in degrees. Must differ from `to` and not be antipodal.',
  },
  {
    property: 'to',
    type: '[lng, lat]',
    defaultValue: 'required',
    description: 'Destination longitude and latitude in degrees.',
  },
  {
    property: 'height',
    type: 'number',
    defaultValue: '350000',
    description: 'Peak height of the geodesic arc in metres above the viewer ellipsoid.',
  },
  {
    property: 'duration',
    type: 'number',
    defaultValue: '4',
    description: 'Cesium clock seconds per full loop of the travelling point.',
  },
  {
    property: 'color',
    type: 'Color',
    defaultValue: 'DEEPSKYBLUE',
    description: 'Cesium Color used for the polyline glow and travelling point outline.',
  },
  {
    property: 'destroy()',
    type: '() => void',
    defaultValue: 'method',
    description: 'Idempotently removes the created Entity without affecting the rest of the viewer.',
  },
];

function resetArcCamera(viewer: Viewer) {
  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(138, 13, 6_700_000),
    orientation: { heading: -Math.PI / 3, pitch: (-Math.PI * 5) / 12, roll: 0 },
  });
}

export default function FlowingArcDemoPage() {
  const { isZh } = useI18n();
  const viewerRef = useRef<Viewer | null>(null);
  const arcRef = useRef<{ destroy(): void } | null>(null);
  const { isCopied, copy } = useClipboard();

  const [playing, setPlaying] = useState(
    () => typeof window === 'undefined' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [heightKm, setHeightKm] = useState(430);
  const [duration, setDuration] = useState(4);

  const rebuildArc = useCallback((viewer: Viewer, nextHeightKm: number, nextDuration: number) => {
    arcRef.current?.destroy();
    arcRef.current = createFlowingArc(viewer, {
      from: [103.82, 1.35],
      to: [139.69, 35.68],
      height: nextHeightKm * 1_000,
      duration: nextDuration,
      color: Color.DEEPSKYBLUE,
    });
  }, []);

  const handleMount = useCallback(
    (viewer: Viewer) => {
      viewerRef.current = viewer;
      viewer.clock.shouldAnimate = playing;
      rebuildArc(viewer, heightKm, duration);
      resetArcCamera(viewer);

      return () => {
        arcRef.current?.destroy();
        arcRef.current = null;
        viewerRef.current = null;
      };
    },
    // Mount once per stage lifecycle; parameter updates are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    rebuildArc(viewer, heightKm, duration);
  }, [heightKm, duration, rebuildArc]);

  const handleTogglePlay = () => {
    const next = !playing;
    setPlaying(next);
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      viewer.clock.shouldAnimate = next;
    }
  };

  const handleResetCamera = () => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      resetArcCamera(viewer);
    }
  };

  const handleCopyPage = () => {
    const markdown = `# ${meta.title}\n\n${meta.description}\n\n## Install\n\`\`\`bash\n${INSTALL_CMD}\n\`\`\`\n\n## Usage\n\`\`\`ts\n${USAGE_CODE}\n\`\`\``;
    void copy(markdown);
  };

  const apiProperties = isZh
    ? [
        {
          property: 'from',
          type: '[lng, lat]',
          defaultValue: 'required',
          description: '起点经纬度（单位：度）。必须与 to 不同，且不能接近对跖点。',
        },
        {
          property: 'to',
          type: '[lng, lat]',
          defaultValue: 'required',
          description: '终点经纬度（单位：度）。',
        },
        {
          property: 'height',
          type: 'number',
          defaultValue: '350000',
          description: '测地线弧线相对于椭球面的峰值高度（单位：米）。',
        },
        {
          property: 'duration',
          type: 'number',
          defaultValue: '4',
          description: '光点沿弧线完整循环一次所需的 Cesium 时钟秒数。',
        },
        {
          property: 'color',
          type: 'Color',
          defaultValue: 'DEEPSKYBLUE',
          description: '飞线发光材质与光点描边使用的 Cesium Color。',
        },
        {
          property: 'destroy()',
          type: '() => void',
          defaultValue: 'method',
          description: '幂等移除该特效创建的 Entity，不影响 Viewer 中的其他对象。',
        },
      ]
    : API_PROPERTIES;

  return (
    <VStack gap={8}>
      <VStack gap={3}>
        <HStack hAlign="between" vAlign="start" gap={4} wrap="wrap">
          <Heading level={1} textWrap="balance">
            {isZh ? '飞线 (Flowing Arc)' : meta.title}
          </Heading>
          <Button
            label={isCopied ? (isZh ? '已复制' : 'Copied') : isZh ? '复制页面' : 'Copy page'}
            variant="secondary"
            size="sm"
            icon={isCopied ? <Icon icon="check" /> : undefined}
            onClick={handleCopyPage}
          />
        </HStack>
        <Text type="body" color="secondary">
          {isZh
            ? '在 CesiumJS 三维椭球面上沿测地线生成发光飞线与循环光点，动画随 viewer.clock 同步驱动。'
            : meta.description}
        </Text>
      </VStack>

      <CesiumStage
        label={
          isZh
            ? '新加坡至东京的 CesiumJS 飞线场景'
            : 'Singapore to Tokyo CesiumJS flowing arc scene'
        }
        shouldAnimate={playing}
        onMount={handleMount}
        toolbar={
          <>
            <HStack gap={2} vAlign="center">
              <Button
                label={playing ? (isZh ? '暂停' : 'Pause') : isZh ? '播放' : 'Play'}
                variant="secondary"
                size="sm"
                icon={<Icon icon={playing ? Pause : Play} />}
                onClick={handleTogglePlay}
              />
              <Button
                label={isZh ? '重置视角' : 'Reset camera'}
                variant="ghost"
                size="sm"
                icon={<Icon icon={RotateCcw} />}
                onClick={handleResetCamera}
              />
            </HStack>

            <HStack gap={4} vAlign="center" wrap="wrap">
              <HStack gap={2} vAlign="center" width={180}>
                <Text type="supporting" size="xsm" hasTabularNumbers>
                  {isZh ? `弧高 ${heightKm}km` : `Height ${heightKm}km`}
                </Text>
                <Slider
                  label={isZh ? '飞线峰值高度（千米）' : 'Arc peak height in km'}
                  value={heightKm}
                  min={100}
                  max={800}
                  step={10}
                  onChange={setHeightKm}
                />
              </HStack>
              <HStack gap={2} vAlign="center" width={170}>
                <Text type="supporting" size="xsm" hasTabularNumbers>
                  {isZh ? `周期 ${duration}s` : `Duration ${duration}s`}
                </Text>
                <Slider
                  label={isZh ? '循环周期（秒）' : 'Cycle duration in seconds'}
                  value={duration}
                  min={1}
                  max={10}
                  step={0.5}
                  onChange={setDuration}
                />
              </HStack>
            </HStack>
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
          <HStack width={120} vAlign="center">
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
                    <HStack width={120} vAlign="center">
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
