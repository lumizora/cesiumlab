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
import { Eye, EyeOff, Pause, Play, RotateCcw } from 'lucide-react';
import { CesiumStage } from '@docs/components/CesiumStage';
import type { ParamGroup } from '@docs/components/EffectParamPanel';
import { useDocsPageMarkdown } from '@docs/lib/docsPage';
import type { EffectDemoMeta } from '@docs/lib/effectDemos';
import { useI18n } from '@docs/lib/i18n';
import { formatEffectDocMarkdown } from '@docs/lib/markdown';
import { createHoloBeacon, type HoloBeaconHandle } from '../index.ts';

export const meta: EffectDemoMeta = {
  id: 'holo-beacon',
  title: 'Holo Beacon',
  section: 'Visual Effects',
  description:
    '3D holographic floating octahedron beacon with self-rotation, smooth vertical bobbing, an energy tether line, and a rotating ground lock-on ring.',
  isNew: true,
  order: 8,
};

const INSTALL_CMD = 'pnpm add @cesiumlab/effects @cesiumlab/cesium';

const USAGE_CODE = `import { createHoloBeacon } from '@cesiumlab/effects';

const beacon = createHoloBeacon(viewer, {
  position: [121.47, 31.23],  // Shanghai
  color: '#38bdf8',
  altitude: 120_000,
  size: 28_000,
  spinSpeed: 1,
  bobSpeed: 1,
});

// O(1) GPU uniform & matrix updates
beacon.update({ color: '#00e5a0', altitude: 160_000 });
beacon.hide();
beacon.show();
beacon.destroy();`;

const DEMO_BEACONS: ReadonlyArray<{
  coord: readonly [number, number];
  phase: number;
  altitudeScale: number;
}> = [
  { coord: [121.4737, 31.2304], phase: 0, altitudeScale: 1 },
  { coord: [120.1551, 30.2741], phase: 1.6, altitudeScale: 0.85 },
  { coord: [118.7969, 32.0603], phase: 3.1, altitudeScale: 0.92 },
];

function resetCamera(viewer: Viewer) {
  viewer.camera.lookAt(
    Cartesian3.fromDegrees(120.3, 31.1, 0),
    new HeadingPitchRange(CesiumMath.toRadians(340), CesiumMath.toRadians(-34), 680_000),
  );
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
}

const DEFAULTS = {
  color: '#38bdf8',
  altitudeKm: 120,
  sizeKm: 28,
  ringRadiusKm: 62,
  spinSpeed: 1,
  bobSpeed: 1,
  bobAmplitude: 0.28,
  opacity: 0.9,
} as const;

export default function HoloBeaconDemoPage() {
  const { isZh } = useI18n();
  const viewerRef = useRef<Viewer | null>(null);
  const beaconsRef = useRef<HoloBeaconHandle[]>([]);

  const [paused, setPaused] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [visible, setVisible] = useState(true);
  const [color, setColor] = useState<string>(DEFAULTS.color);
  const [altitudeKm, setAltitudeKm] = useState<number>(DEFAULTS.altitudeKm);
  const [sizeKm, setSizeKm] = useState<number>(DEFAULTS.sizeKm);
  const [ringRadiusKm, setRingRadiusKm] = useState<number>(DEFAULTS.ringRadiusKm);
  const [spinSpeed, setSpinSpeed] = useState<number>(DEFAULTS.spinSpeed);
  const [bobSpeed, setBobSpeed] = useState<number>(DEFAULTS.bobSpeed);
  const [bobAmplitude, setBobAmplitude] = useState<number>(DEFAULTS.bobAmplitude);
  const [opacity, setOpacity] = useState<number>(DEFAULTS.opacity);

  const handleMount = useCallback(
    (viewer: Viewer) => {
      viewerRef.current = viewer;
      beaconsRef.current = DEMO_BEACONS.map((node) =>
        createHoloBeacon(viewer, {
          position: node.coord,
          color,
          altitude: altitudeKm * 1_000 * node.altitudeScale,
          size: sizeKm * 1_000,
          ringRadius: ringRadiusKm * 1_000,
          spinSpeed,
          bobSpeed,
          bobAmplitude,
          opacity,
          phase: node.phase,
          paused,
          show: visible,
        }),
      );
      resetCamera(viewer);

      return () => {
        for (const beacon of beaconsRef.current) {
          beacon.destroy();
        }
        beaconsRef.current = [];
        viewerRef.current = null;
      };
    },
    // Mount once per stage lifecycle; parameter updates use handle.update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    beaconsRef.current.forEach((beacon, idx) => {
      const scale = DEMO_BEACONS[idx]?.altitudeScale ?? 1;
      beacon.update({
        color,
        altitude: altitudeKm * 1_000 * scale,
        size: sizeKm * 1_000,
        ringRadius: ringRadiusKm * 1_000,
        spinSpeed,
        bobSpeed,
        bobAmplitude,
        opacity,
      });
    });
  }, [color, altitudeKm, sizeKm, ringRadiusKm, spinSpeed, bobSpeed, bobAmplitude, opacity]);

  useEffect(() => {
    for (const beacon of beaconsRef.current) {
      beacon.setPaused(paused);
    }
  }, [paused]);

  useEffect(() => {
    for (const beacon of beaconsRef.current) {
      beacon.setVisible(visible);
    }
  }, [visible]);

  const handleResetCamera = () => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      resetCamera(viewer);
    }
  };

  const hasModifiedParams =
    color !== DEFAULTS.color ||
    altitudeKm !== DEFAULTS.altitudeKm ||
    sizeKm !== DEFAULTS.sizeKm ||
    ringRadiusKm !== DEFAULTS.ringRadiusKm ||
    spinSpeed !== DEFAULTS.spinSpeed ||
    bobSpeed !== DEFAULTS.bobSpeed ||
    bobAmplitude !== DEFAULTS.bobAmplitude ||
    opacity !== DEFAULTS.opacity;

  const handleResetParams = useCallback(() => {
    setColor(DEFAULTS.color);
    setAltitudeKm(DEFAULTS.altitudeKm);
    setSizeKm(DEFAULTS.sizeKm);
    setRingRadiusKm(DEFAULTS.ringRadiusKm);
    setSpinSpeed(DEFAULTS.spinSpeed);
    setBobSpeed(DEFAULTS.bobSpeed);
    setBobAmplitude(DEFAULTS.bobAmplitude);
    setOpacity(DEFAULTS.opacity);
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
            label: isZh ? '信标颜色' : 'Color',
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
            min: 0.25,
            max: 1.4,
            step: 0.05,
            onChange: setOpacity,
          },
        ],
      },
      {
        id: 'geometry',
        label: isZh ? '几何' : 'Geometry',
        controls: [
          {
            type: 'slider',
            id: 'altitude',
            label: isZh ? `悬浮高度 · ${altitudeKm}km` : `Altitude · ${altitudeKm}km`,
            value: altitudeKm,
            min: 50,
            max: 260,
            step: 10,
            onChange: setAltitudeKm,
          },
          {
            type: 'slider',
            id: 'size',
            label: isZh ? `晶核尺寸 · ${sizeKm}km` : `Crystal size · ${sizeKm}km`,
            value: sizeKm,
            min: 10,
            max: 60,
            step: 2,
            onChange: setSizeKm,
          },
          {
            type: 'slider',
            id: 'ringRadius',
            label: isZh ? `底座环半径 · ${ringRadiusKm}km` : `Ring radius · ${ringRadiusKm}km`,
            value: ringRadiusKm,
            min: 20,
            max: 140,
            step: 4,
            onChange: setRingRadiusKm,
          },
        ],
      },
      {
        id: 'motion',
        label: isZh ? '动画' : 'Motion',
        controls: [
          {
            type: 'slider',
            id: 'spinSpeed',
            label: isZh ? `自转速度 · ${spinSpeed.toFixed(1)}x` : `Spin · ${spinSpeed.toFixed(1)}x`,
            value: spinSpeed,
            min: 0,
            max: 3,
            step: 0.1,
            onChange: setSpinSpeed,
          },
          {
            type: 'slider',
            id: 'bobSpeed',
            label: isZh
              ? `呼吸频率 · ${bobSpeed.toFixed(1)}x`
              : `Bob speed · ${bobSpeed.toFixed(1)}x`,
            value: bobSpeed,
            min: 0,
            max: 3,
            step: 0.1,
            onChange: setBobSpeed,
          },
          {
            type: 'slider',
            id: 'bobAmplitude',
            label: isZh
              ? `悬浮幅度 · ${Math.round(bobAmplitude * 100)}%`
              : `Bob range · ${Math.round(bobAmplitude * 100)}%`,
            value: bobAmplitude,
            min: 0,
            max: 0.8,
            step: 0.04,
            onChange: setBobAmplitude,
          },
        ],
      },
    ],
    [isZh, color, opacity, altitudeKm, sizeKm, ringRadiusKm, spinSpeed, bobSpeed, bobAmplitude],
  );

  const pageTitle = isZh ? '全息悬浮信标 (Holo Beacon)' : meta.title;
  const pageDescription = isZh
    ? '纯 GPU 构建的三维全息悬浮八面体信标，融合晶面棱边高光与菲涅尔轮廓、平滑自转与上下呼吸、能量牵引光丝及地面双层旋转锁定环，适用于重点 POI 标识、目标锁定与告警定位。'
    : meta.description;

  const apiProperties = isZh
    ? [
        {
          property: 'position',
          type: '[lng, lat]',
          defaultValue: 'required',
          description: '信标地面锚点经纬度（单位：度）。',
        },
        {
          property: 'color',
          type: 'Color | string',
          defaultValue: "'#38bdf8'",
          description: '晶核、牵引光丝与地面锁定环颜色，支持 Cesium Color 或 CSS 色值。',
        },
        {
          property: 'altitude / size',
          type: 'number',
          defaultValue: '120000 / 28000',
          description: '晶核中心悬浮离地高度（米）与八面体半径尺寸（米）。',
        },
        {
          property: 'ringRadius',
          type: 'number',
          defaultValue: 'size * 2.2',
          description: '地面双层旋转锁定环半径（单位：米）。',
        },
        {
          property: 'spinSpeed / bobSpeed / bobAmplitude',
          type: 'number',
          defaultValue: '1 / 1 / 0.28',
          description: '自转速度倍率、上下呼吸频率及悬浮振幅（占晶核尺寸比例）。',
        },
        {
          property: 'opacity / groundOffset',
          type: 'number',
          defaultValue: '0.9 / 0',
          description: '整体不透明度倍率与地面锚点抬升偏移量（米）。',
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
          description: '统一特效句柄方法：显隐切换、O(1) 更新矩阵与 uniform、暂停/重置与幂等销毁。',
        },
      ]
    : [
        {
          property: 'position',
          type: '[lng, lat]',
          defaultValue: 'required',
          description: 'Ground anchor [longitude, latitude] in degrees.',
        },
        {
          property: 'color',
          type: 'Color | string',
          defaultValue: "'#38bdf8'",
          description: 'Crystal, tether, and ground ring color (Cesium Color or CSS string).',
        },
        {
          property: 'altitude / size',
          type: 'number',
          defaultValue: '120000 / 28000',
          description: 'Floating crystal center altitude and octahedron radius in metres.',
        },
        {
          property: 'ringRadius',
          type: 'number',
          defaultValue: 'size * 2.2',
          description: 'Rotating ground lock-on ring radius in metres.',
        },
        {
          property: 'spinSpeed / bobSpeed / bobAmplitude',
          type: 'number',
          defaultValue: '1 / 1 / 0.28',
          description: 'Self-rotation speed, bobbing frequency, and bobbing amplitude fraction.',
        },
        {
          property: 'opacity / groundOffset',
          type: 'number',
          defaultValue: '0.9 / 0',
          description: 'Overall opacity multiplier and vertical ground offset in metres.',
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
            'Unified handle methods for visibility, O(1) GPU updates, pause/restart, and idempotent cleanup.',
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
        label={isZh ? 'Holo Beacon 全息悬浮信标演示场景' : 'Holo Beacon 3D CesiumJS demo scene'}
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
