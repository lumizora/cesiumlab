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
import { createEnergyBeam, type EnergyBeamHandle } from '../index.ts';

export const meta: EffectDemoMeta = {
  id: 'energy-beam',
  title: 'Energy Beam',
  section: 'Visual Effects',
  description:
    'Continuous 3D volumetric holographic energy beam built with dual open-ended cylinder shells, Fresnel edge falloff, rising energy waves, and a ground glow disc.',
  isNew: true,
  order: 3,
};

const INSTALL_CMD = 'pnpm add @cesiumlab/effects cesium';

const USAGE_CODE = `import { createEnergyBeam } from '@cesiumlab/effects';

const beam = createEnergyBeam(viewer, {
  position: [104.07, 30.57],  // Chengdu
  color: '#00a8ff',
  height: 520_000,
  coreWidth: 1,
  glowWidth: 1,
  intensity: 1,
  flowSpeed: 1,
  breathingSpeed: 1,
});

// Live parameter tuning (O(1) GPU uniform & matrix update)
beam.update({ height: 680_000, intensity: 1.2 });

// Pause / clean up
beam.setPaused(true);
beam.destroy();`;

const BEAM_NODES: ReadonlyArray<{
  coord: readonly [number, number];
  phase: number;
  heightFactor: number;
}> = [
  { coord: [104.0668, 30.5728], phase: 0, heightFactor: 1 },
  { coord: [108.9398, 34.3416], phase: 1.4, heightFactor: 0.92 },
  { coord: [113.2644, 23.1291], phase: 2.8, heightFactor: 0.85 },
];

function resetCamera(viewer: Viewer) {
  viewer.camera.lookAt(
    Cartesian3.fromDegrees(108, 29, 0),
    new HeadingPitchRange(CesiumMath.toRadians(335), CesiumMath.toRadians(-36), 3_200_000),
  );
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
}

const DEFAULTS = {
  color: '#00a8ff',
  heightKm: 520,
  radiusKm: 24,
  coreWidth: 1,
  glowWidth: 1,
  intensity: 1,
  flowSpeed: 1,
  breathingSpeed: 1,
  groundOffsetKm: 0,
} as const;

export default function EnergyBeamDemoPage() {
  const { isZh } = useI18n();
  const viewerRef = useRef<Viewer | null>(null);
  const beamsRef = useRef<EnergyBeamHandle[]>([]);

  const [paused, setPaused] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [visible, setVisible] = useState(true);
  const [color, setColor] = useState<string>(DEFAULTS.color);
  const [heightKm, setHeightKm] = useState<number>(DEFAULTS.heightKm);
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULTS.radiusKm);
  const [coreWidth, setCoreWidth] = useState<number>(DEFAULTS.coreWidth);
  const [glowWidth, setGlowWidth] = useState<number>(DEFAULTS.glowWidth);
  const [intensity, setIntensity] = useState<number>(DEFAULTS.intensity);
  const [flowSpeed, setFlowSpeed] = useState<number>(DEFAULTS.flowSpeed);
  const [breathingSpeed, setBreathingSpeed] = useState<number>(DEFAULTS.breathingSpeed);
  const [groundOffsetKm, setGroundOffsetKm] = useState<number>(DEFAULTS.groundOffsetKm);

  const handleMount = useCallback(
    (viewer: Viewer) => {
      viewerRef.current = viewer;
      beamsRef.current = BEAM_NODES.map((node) =>
        createEnergyBeam(viewer, {
          position: node.coord,
          color,
          height: heightKm * 1_000 * node.heightFactor,
          radius: radiusKm * 1_000,
          coreWidth,
          glowWidth,
          intensity,
          flowSpeed,
          breathingSpeed,
          groundOffset: groundOffsetKm * 1_000,
          phase: node.phase,
          paused,
          show: visible,
        }),
      );
      resetCamera(viewer);

      return () => {
        for (const beam of beamsRef.current) {
          beam.destroy();
        }
        beamsRef.current = [];
        viewerRef.current = null;
      };
    },
    // Mount once per stage lifecycle; parameter updates use handle.update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    for (const beam of beamsRef.current) {
      beam.destroy();
    }
    beamsRef.current = BEAM_NODES.map((node) =>
      createEnergyBeam(viewer, {
        position: node.coord,
        color,
        height: heightKm * 1_000 * node.heightFactor,
        radius: radiusKm * 1_000,
        coreWidth,
        glowWidth,
        intensity,
        flowSpeed,
        breathingSpeed,
        groundOffset: groundOffsetKm * 1_000,
        phase: node.phase,
        paused,
        show: visible,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groundOffsetKm]);

  useEffect(() => {
    beamsRef.current.forEach((beam, idx) => {
      const factor = BEAM_NODES[idx]?.heightFactor ?? 1;
      beam.update({
        color,
        height: heightKm * 1_000 * factor,
        radius: radiusKm * 1_000,
        coreWidth,
        glowWidth,
        intensity,
        flowSpeed,
        breathingSpeed,
      });
    });
  }, [color, heightKm, radiusKm, coreWidth, glowWidth, intensity, flowSpeed, breathingSpeed]);

  const hasModifiedParams =
    color !== DEFAULTS.color ||
    heightKm !== DEFAULTS.heightKm ||
    radiusKm !== DEFAULTS.radiusKm ||
    coreWidth !== DEFAULTS.coreWidth ||
    glowWidth !== DEFAULTS.glowWidth ||
    intensity !== DEFAULTS.intensity ||
    flowSpeed !== DEFAULTS.flowSpeed ||
    breathingSpeed !== DEFAULTS.breathingSpeed ||
    groundOffsetKm !== DEFAULTS.groundOffsetKm;

  const handleResetParams = useCallback(() => {
    setColor(DEFAULTS.color);
    setHeightKm(DEFAULTS.heightKm);
    setRadiusKm(DEFAULTS.radiusKm);
    setCoreWidth(DEFAULTS.coreWidth);
    setGlowWidth(DEFAULTS.glowWidth);
    setIntensity(DEFAULTS.intensity);
    setFlowSpeed(DEFAULTS.flowSpeed);
    setBreathingSpeed(DEFAULTS.breathingSpeed);
    setGroundOffsetKm(DEFAULTS.groundOffsetKm);
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
            label: isZh ? '光束颜色' : 'Color',
            value: color,
            onChange: setColor,
          },
          {
            type: 'slider',
            id: 'intensity',
            label: isZh
              ? `亮度 · ${intensity.toFixed(1)}x`
              : `Intensity · ${intensity.toFixed(1)}x`,
            value: intensity,
            min: 0.3,
            max: 1.8,
            step: 0.1,
            onChange: setIntensity,
          },
        ],
      },
      {
        id: 'geometry',
        label: isZh ? '几何' : 'Geometry',
        controls: [
          {
            type: 'slider',
            id: 'height',
            label: isZh ? `高度 · ${heightKm}km` : `Height · ${heightKm}km`,
            value: heightKm,
            min: 200,
            max: 900,
            step: 20,
            onChange: setHeightKm,
          },
          {
            type: 'slider',
            id: 'radius',
            label: isZh ? `底半径 · ${radiusKm}km` : `Radius · ${radiusKm}km`,
            value: radiusKm,
            min: 10,
            max: 60,
            step: 2,
            onChange: setRadiusKm,
          },
          {
            type: 'slider',
            id: 'coreWidth',
            label: isZh
              ? `核心宽度 · ${coreWidth.toFixed(1)}x`
              : `Core width · ${coreWidth.toFixed(1)}x`,
            value: coreWidth,
            min: 0.4,
            max: 2,
            step: 0.1,
            onChange: setCoreWidth,
          },
          {
            type: 'slider',
            id: 'glowWidth',
            label: isZh
              ? `光晕宽度 · ${glowWidth.toFixed(1)}x`
              : `Glow width · ${glowWidth.toFixed(1)}x`,
            value: glowWidth,
            min: 0.5,
            max: 2,
            step: 0.1,
            onChange: setGlowWidth,
          },
          {
            type: 'slider',
            id: 'groundOffset',
            label: isZh ? `离地偏移 · ${groundOffsetKm}km` : `Ground offset · ${groundOffsetKm}km`,
            value: groundOffsetKm,
            min: 0,
            max: 80,
            step: 4,
            onChange: setGroundOffsetKm,
          },
        ],
      },
      {
        id: 'motion',
        label: isZh ? '动画' : 'Motion',
        controls: [
          {
            type: 'slider',
            id: 'flowSpeed',
            label: isZh
              ? `流动速度 · ${flowSpeed.toFixed(1)}x`
              : `Flow speed · ${flowSpeed.toFixed(1)}x`,
            value: flowSpeed,
            min: 0,
            max: 3,
            step: 0.1,
            onChange: setFlowSpeed,
          },
          {
            type: 'slider',
            id: 'breathingSpeed',
            label: isZh
              ? `呼吸速度 · ${breathingSpeed.toFixed(1)}x`
              : `Breathing · ${breathingSpeed.toFixed(1)}x`,
            value: breathingSpeed,
            min: 0,
            max: 3,
            step: 0.1,
            onChange: setBreathingSpeed,
          },
        ],
      },
    ],
    [
      isZh,
      color,
      intensity,
      heightKm,
      radiusKm,
      coreWidth,
      glowWidth,
      groundOffsetKm,
      flowSpeed,
      breathingSpeed,
    ],
  );

  useEffect(() => {
    for (const beam of beamsRef.current) {
      beam.setPaused(paused);
    }
  }, [paused]);

  useEffect(() => {
    for (const beam of beamsRef.current) {
      beam.setVisible(visible);
    }
  }, [visible]);

  const handleResetCamera = () => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      resetCamera(viewer);
    }
  };

  const pageTitle = isZh ? '分层全息光束 (Energy Beam)' : meta.title;
  const pageDescription = isZh
    ? '基于双层无封口锥形圆柱网格与自定义 GLSL 菲涅尔（Fresnel）体积着色器构建的连续三维全息光束，包含上升能量波纹、顶部指数消散与镂空双环底座，任意缩放视角均平滑连续无断层。'
    : meta.description;

  const apiProperties = isZh
    ? [
        {
          property: 'position',
          type: '[lng, lat]',
          defaultValue: 'required',
          description: '光束底部锚点经纬度（单位：度）。',
        },
        {
          property: 'color',
          type: 'Color | string',
          defaultValue: "'#00a8ff'",
          description: '光束核心与光晕色调，支持 Cesium Color 或 CSS 色值。',
        },
        {
          property: 'height / radius',
          type: 'number',
          defaultValue: '520000 / auto',
          description: '光束垂直高度（米）与基准外半径（默认 height * 0.045）。',
        },
        {
          property: 'coreWidth / glowWidth',
          type: 'number',
          defaultValue: '1 / 1',
          description: '亮白核心与外围体积光晕的宽度倍率。',
        },
        {
          property: 'intensity / flowSpeed / breathingSpeed',
          type: 'number',
          defaultValue: '1 / 1 / 1',
          description: '整体亮度系数、上升能量波纹速度与慢速呼吸速度倍率。',
        },
        {
          property: 'groundOffset',
          type: 'number',
          defaultValue: '0',
          description: '底部相对地表高度的抬升偏移量（单位：米）。',
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
          description: 'Anchor [longitude, latitude] in degrees.',
        },
        {
          property: 'color',
          type: 'Color | string',
          defaultValue: "'#00a8ff'",
          description: 'Beam glow color (Cesium Color or CSS string).',
        },
        {
          property: 'height / radius',
          type: 'number',
          defaultValue: '520000 / auto',
          description:
            'Vertical beam height in metres and base outer radius (defaults to height * 0.045).',
        },
        {
          property: 'coreWidth / glowWidth',
          type: 'number',
          defaultValue: '1 / 1',
          description: 'Width multipliers for the bright inner core and outer volumetric glow.',
        },
        {
          property: 'intensity / flowSpeed / breathingSpeed',
          type: 'number',
          defaultValue: '1 / 1 / 1',
          description:
            'Overall brightness, upward energy wave speed, and breathing speed multipliers.',
        },
        {
          property: 'groundOffset',
          type: 'number',
          defaultValue: '0',
          description: 'Vertical offset above sampled ground elevation in metres.',
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
        label={isZh ? 'Energy Beam 全息光束演示场景' : 'Energy Beam 3D CesiumJS demo scene'}
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

        <HStack paddingInline={4} paddingBlock={2} gap={4} vAlign="center">
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
